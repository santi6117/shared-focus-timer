// Rain-on-glass details for the laptop watercolor wallpaper. A seeded layout
// avoids changing the composition on reload. CSS animates only small drops;
// no per-frame JavaScript loop or canvas is needed. Phones keep their scene.
import { REMOTE } from './device.js';

export function init() {
  if (REMOTE) return;
  const scene = document.querySelector('.rain-study');
  if (!scene || scene.dataset.initialized) return;
  scene.dataset.initialized = 'true';
  const layer = document.querySelector('#backgroundLayer');
  const NS = 'http://www.w3.org/2000/svg';
  let seed = 371;
  function random() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  const beads = scene.querySelector('.rain-still-drops');
  for (let i = 0; i < 310; i++) {
    const drop = document.createElementNS(NS, 'use');
    const x = random() * 1600, y = random() * 900;
    const size = i < 36 ? .55 + random() * .5 : .13 + random() * .42;
    drop.setAttribute('href', '#glass-drop');
    drop.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(random()*30-15).toFixed(1)}) scale(${size.toFixed(2)} ${(size*(.75+random()*.65)).toFixed(2)})`);
    drop.setAttribute('opacity', String(.45 + random() * .5));
    beads.append(drop);
  }
  for (let i = 0; i < 11; i++) {
    const drop = document.createElement('span');
    drop.className = 'rain-slide';
    // The clearest water trails sit beside the timer rather than behind it.
    const x = i < 5 ? 6 + random()*25 : 69 + random()*26;
    drop.style.cssText = `--x:${x}%;--y:${random()*68-8}%;--w:${3+random()*4}px;--trail:${70+random()*100}px;--duration:${29+random()*34}s;--delay:-${random()*60}s`;
    scene.querySelector('.rain-moving-drops').append(drop);
  }
  // CSS handles the motion; this observer only suspends it when unused.
  function syncMotion() {
    scene.classList.toggle('rain-paused', document.hidden || layer.dataset.bg !== 'rain');
  }
  new MutationObserver(syncMotion).observe(layer, { attributes: true, attributeFilter: ['data-bg'] });
  document.addEventListener('visibilitychange', syncMotion);
  syncMotion();
}
