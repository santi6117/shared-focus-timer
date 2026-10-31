// Local-only preview state. Explicit item toggles replace free dragging to keep the little room composed.
const rewards = [
  { id: 'rug', name: 'Woven rug', hours: 105 },
  { id: 'plant', name: 'Little plant', hours: 110 },
  { id: 'books', name: 'Bookshelf', hours: 120 },
  { id: 'lamp', name: 'Warm lamp', hours: 130 },
  { id: 'flowers', name: 'Window flowers', hours: 135 },
  { id: 'curtains', name: 'Linen curtains', hours: 145 },
  { id: 'tea', name: 'Coffee', hours: 150 },
  { id: 'art', name: 'Botanical print', hours: 155 },
  { id: 'chair', name: 'Reading armchair', hours: 165 },
  { id: 'blanket', name: 'Blanket', hours: 170 },
  { id: 'fire', name: 'Fireplace', hours: 180 },
  { id: 'basket', name: 'Log basket', hours: 185 },
  { id: 'cat', name: 'Sleeping cat', hours: 195 },
  { id: 'portrait', name: 'You & Kristina', hours: 200 },
];
const el = id => document.getElementById(id);
let hours = 100;
let inside = false;
let decorating = false;
const placed = new Set();

// Simulated hours gate both navigation and decoration; changing the preview never grants real rewards.
function render() {
  const unlocked = hours >= 100;
  if (!unlocked) { inside = false; decorating = false; }
  el('hours').value = hours;
  el('hoursValue').textContent = `${hours} h`;
  el('outside').toggleAttribute('hidden', inside);
  el('inside').toggleAttribute('hidden', !inside);
  el('door').hidden = inside || !unlocked;
  el('leave').hidden = !inside;
  el('locked').hidden = unlocked;
  el('scene').classList.toggle('unavailable', !unlocked);
  el('remaining').textContent = `${100 - hours} more hours until you get the keys`;
  el('place').textContent = inside ? 'Inside · one cosy room' : 'A little home';
  el('decorate').hidden = !unlocked;
  el('decorate').textContent = decorating ? 'Done' : 'Decorate';
  el('decorate').setAttribute('aria-expanded', String(decorating));
  el('inventory').hidden = !decorating;
  el('sceneHint').textContent = !unlocked ? 'Something to look forward to.' : inside ? 'Make yourself at home.' : 'Your keys are waiting. Open the door.';
  el('items').replaceChildren(...rewards.map(reward => {
    const available = hours >= reward.hours;
    el(reward.id).toggleAttribute('hidden', !available || !placed.has(reward.id));
    const button = document.createElement('button');
    button.textContent = `${placed.has(reward.id) && available ? '✓ ' : ''}${reward.name} · ${reward.hours} h`;
    button.disabled = !available;
    button.setAttribute('aria-pressed', String(available && placed.has(reward.id)));
    button.onclick = () => {
      if (placed.has(reward.id)) placed.delete(reward.id); else placed.add(reward.id);
      inside = reward.id !== 'flowers';
      render();
      // Restore focus after replacing the collection buttons.
      el('items').children[rewards.indexOf(reward)].focus();
      el('announcement').textContent = `${reward.name} ${placed.has(reward.id) ? 'placed' : 'put away'}.`;
    };
    return button;
  }));
  const next = [{ name: 'Your cottage', hours: 100 }, ...rewards].find(r => r.hours > hours);
  const previous = [...rewards].reverse().find(r => r.hours <= hours)?.hours ?? (unlocked ? 100 : 0);
  el('nextLabel').textContent = next ? `Next · ${next.name}` : 'Your little home, fully unlocked';
  el('nextHours').textContent = next ? `${next.hours - hours} h to go` : '200 h';
  el('progress').value = next ? ((hours - previous) / (next.hours - previous)) * 100 : 100;
  el('announcement').textContent = next ? `Unlocks at ${next.hours} total focus hours.` : 'You can change your decorations whenever you like.';
}
el('hours').oninput = event => { hours = Number(event.target.value); render(); };
document.querySelectorAll('[data-hours]').forEach(button => button.onclick = () => { hours = Number(button.dataset.hours); render(); });
el('door').onclick = () => { inside = true; render(); el('leave').focus(); };
el('leave').onclick = () => { inside = false; render(); el('door').focus(); };
el('decorate').onclick = () => { decorating = !decorating; render(); };
render();

// A design-study shortcut: respects the simulated unlock level, without changing hours.
el('placeAll').onclick = () => {
  rewards.filter(reward => hours >= reward.hours).forEach(reward => placed.add(reward.id));
  inside = hours >= 100;
  render();
  el('announcement').textContent = hours < 105 ? 'Your first decoration unlocks at 105 hours.' : 'All unlocked decorations placed.';
};

// Background tabs should not keep decorative animation running.
function syncMotion() { document.documentElement.classList.toggle('motion-paused', document.hidden); }
document.addEventListener('visibilitychange', syncMotion);
syncMotion();

// Embed the same card in the full-app study, without the study controls.
if (new URLSearchParams(location.search).has('embed')) {
  document.body.classList.add('embedded');
  hours = 200;
  rewards.forEach(reward => placed.add(reward.id));
  render();
  new ResizeObserver(() => {
    parent.postMessage({ type: 'cottage-height', height: document.querySelector('main').getBoundingClientRect().height + 2 }, location.origin);
  }).observe(document.querySelector('main'));
}
