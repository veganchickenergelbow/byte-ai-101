// Small DOM helpers: escaping, icons, Byte's sprite, sheets and toasts.
import { app } from './app.js';
import { sfx } from './audio.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Parses an HTML string into a single element. */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// UI icons: the sliced icon art when data/art.json "icons" is on, else emoji.
const EMOJI = { fish: '🐟', flame: '🔥', heart: '❤️', star: '⭐', paw: '🐾', bowl: '🥣', yarn: '🧶', pet: '💕', check: '✅', cross: '❌',
  trophy: '🏆', chart: '📊', gear: '⚙️', home: '🏠', book: '📖', lock: '🔒' };
export function icon(name) {
  if (app.content?.art.icons) return `<img class="ico-img" src="assets/img/ui/${name}.png" alt="">`;
  return EMOJI[name] || '';
}
/** A theme's emoji, or its icon art if the theme has some ("art": true in data/themes.json: only the mix card does). */
export function themeIcon(t) {
  if (t.art && app.content?.art.icons) return `<img class="ico-img" src="assets/img/ui/theme_${t.id}.png" alt="">`;
  return t.emoji;
}

/** A cat's sprite for a pose ('idle' | 'happy' | 'sleep'), wearing its chosen accessory (unless `cls` is 'locked'). */
export function catArt(cat, pose = 'idle', cls = '') {
  const img = `<img class="cat-art px ${cls}" src="assets/img/cats/${cat.id}_${pose}.png" alt="${esc(cat.name)}" draggable="false">`;
  const acc = cls.includes('locked') ? '' : accessoryHTML(cat, pose);
  return acc ? `<span class="cat-fig">${img}${acc}</span>` : img;
}

/** The accessory a cat is wearing, positioned on its head in % of the 34 x 30 sprite box ('' if none). */
export function accessoryHTML(cat, pose) {
  const id = app.save?.wear?.[cat.id];
  const a = id && app.content.accessories.find((x) => x.id === id);
  const at = a && app.content.anchors[cat.id]?.[pose];
  if (!at) return '';
  const style = `left:${(100 * at[0]) / 34}%;top:${(100 * at[1]) / 30}%;width:${(100 * a.w) / 34}%`;
  return app.content.art.accessories
    ? `<img class="acc px" src="assets/img/accessories/${a.id}.png" alt="" style="${style}">`
    : `<span class="acc emoji" style="${style}">${a.emoji}</span>`;
}

/** Floats a little emoji/heart up from a point inside `host` (which must be position:relative). */
export function popHeart(host, x, y, char = '💕') {
  const h = el(`<span class="heart-pop">${char}</span>`);
  h.style.left = x + 'px'; h.style.top = y + 'px';
  host.appendChild(h);
  setTimeout(() => h.remove(), 950);
}

export function toast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = el(`<div class="toast">${esc(msg)}</div>`);
  document.getElementById('app').appendChild(t);
  setTimeout(() => t.remove(), 2300);
}

/**
 * Opens a bottom sheet (or a centred card with {center:true}). `build(sheetEl, close)` fills it.
 * @returns {Function} close
 */
export function openSheet(build, { center = false, onClose = null, dismissable = true } = {}) {
  const ov = el(`<div class="overlay${center ? ' center' : ''}"><div class="sheet"></div></div>`);
  const sheet = ov.firstElementChild;
  let closed = false;
  const close = () => { if (closed) return; closed = true; ov.remove(); onClose?.(); };
  if (dismissable) ov.addEventListener('click', (e) => { if (e.target === ov) { sfx('tap'); close(); } });
  document.getElementById('app').appendChild(ov);
  build(sheet, close);
  return close;
}

export function confirmDialog(title, text, yes = 'Yes', no = 'Cancel', danger = false) {
  return new Promise((resolve) => {
    let answer = false;
    openSheet((s, close) => {
      s.innerHTML = `<h2 class="center">${esc(title)}</h2><p class="center dim">${esc(text)}</p>
        <button class="btn block ${danger ? 'red' : ''}" data-y>${esc(yes)}</button><button class="btn ghost block" data-n>${esc(no)}</button>`;
      s.querySelector('[data-y]').onclick = () => { answer = true; close(); };
      s.querySelector('[data-n]').onclick = () => close();
    }, { center: true, onClose: () => resolve(answer) });
  });
}
