// Cottage dashboard controller. Totals come from sessions; decorations are private per-browser preferences.
import { ME } from './identity.js';
import * as sessions from './sessions.js';
import { REWARDS, earnedHours, validPlaced } from './lib/cottage.js';

const KEY = 'cottage:' + ME;
const el = id => document.getElementById('cottage-' + id);
let root, hours = 0, inside = false, decorating = false, placed = new Set();
let loaded = false;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (!saved || typeof saved !== 'object') return;
    hours = earnedHours(0, saved.hours);
    placed = new Set(validPlaced(saved.placed, hours));
  } catch { /* Storage is optional; the card still works for this visit. */ }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ hours, placed: [...placed] })); }
  catch { el('announcement').textContent = 'Decorations kept for this visit; browser storage is unavailable.'; }
}

// Wait for the initial history snapshot so an empty loading log never acts as zero earned hours.
function updateHours() {
  if (!sessions.isInitialLoadComplete()) return;
  loaded = true;
  const previous = hours;
  hours = earnedHours(sessions.all().reduce((sum, s) => sum + (s.elapsedSeconds || 0), 0), hours);
  render();
  save();
  const fresh = REWARDS.filter(r => r.hours > previous && r.hours <= hours);
  if (fresh.length) el('announcement').textContent = `Unlocked: ${fresh.map(r => r.name).join(', ')}.`;
}

// Render only this card; the timer, navigation and shared data stay independent.
function render() {
  if (!loaded) return;
  const unlocked = hours >= 100;
  if (!unlocked) { inside = false; decorating = false; }
  el('outside').toggleAttribute('hidden', inside);
  el('inside').toggleAttribute('hidden', !inside);
  el('door').hidden = inside || !unlocked;
  el('leave').hidden = !inside;
  el('locked').hidden = unlocked;
  el('locked').querySelector('strong').textContent = 'Yours at 100 hours';
  el('remaining').textContent = `${Math.ceil((100 - hours) * 60)} more minutes until you get the keys`;
  root.classList.toggle('unavailable', !unlocked);
  el('place').textContent = inside ? 'Inside · one cosy room' : 'A little home';
  el('decorate').hidden = !unlocked;
  el('decorate').textContent = decorating ? 'Done' : 'Decorate';
  el('decorate').setAttribute('aria-expanded', String(decorating));
  el('inventory').hidden = !decorating;
  el('sceneHint').textContent = !unlocked ? 'Something to look forward to.' : inside ? 'Make yourself at home.' : 'Your keys are waiting. Open the door.';
  const focused = document.activeElement?.dataset?.cottageItem;
  el('items').replaceChildren(...REWARDS.map(reward => {
    const available = hours >= reward.hours;
    el(reward.id).toggleAttribute('hidden', !available || !placed.has(reward.id));
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.cottageItem = reward.id;
    button.textContent = `${placed.has(reward.id) ? '✓ ' : ''}${reward.name} · ${reward.hours} h`;
    button.disabled = !available;
    button.setAttribute('aria-pressed', String(placed.has(reward.id)));
    button.onclick = () => {
      if (placed.has(reward.id)) placed.delete(reward.id); else placed.add(reward.id);
      inside = reward.id !== 'flowers';
      render();
      el('items').querySelector(`[data-cottage-item="${reward.id}"]`).focus();
      el('announcement').textContent = `${reward.name} ${placed.has(reward.id) ? 'placed' : 'put away'}.`;
      save();
    };
    return button;
  }));
  if (focused) el('items').querySelector(`[data-cottage-item="${focused}"]`)?.focus();
  const next = [{ name: 'Your cottage', hours: 100 }, ...REWARDS].find(r => r.hours > hours);
  const previous = [...REWARDS].reverse().find(r => r.hours <= hours)?.hours ?? (unlocked ? 100 : 0);
  el('nextLabel').textContent = next ? `Next · ${next.name}` : 'Your little home, fully unlocked';
  const minutes = next ? Math.ceil((next.hours - hours) * 60) : 0;
  el('nextHours').textContent = next ? `${Math.floor(minutes / 60)}h ${minutes % 60}m to go` : '200 h';
  el('progress').value = next ? ((hours - previous) / (next.hours - previous)) * 100 : 100;
  el('announcement').textContent = next ? `Unlocks at ${next.hours} total focus hours.` : 'Change your decorations whenever you like.';
}

function syncMotion() {
  root.classList.toggle('motion-paused', document.hidden || document.getElementById('dashboardView').hidden);
}
export function init() {
  root = document.getElementById('cottageWidget');
  load();
  el('door').onclick = () => { inside = true; render(); el('leave').focus(); };
  el('leave').onclick = () => { inside = false; render(); el('door').focus(); };
  el('decorate').onclick = () => { decorating = !decorating; render(); };
  document.getElementById('cottagePlaceAll').onclick = () => {
    REWARDS.filter(r => r.hours <= hours).forEach(r => placed.add(r.id));
    inside = true;
    render();
    el('announcement').textContent = 'All unlocked decorations placed.';
    save();
  };
  document.addEventListener('visibilitychange', syncMotion);
  window.addEventListener('sft:viewchange', syncMotion);
  sessions.onChange(updateHours);
  updateHours();
  syncMotion();
}
