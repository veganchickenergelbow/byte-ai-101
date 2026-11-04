// The app hub: loaded content, the save, persistence and the screen router.
// Screen contract: a module exporting `render(root, params)`; it may return a cleanup function.
import { migrate } from './core/progress.js';
import { ensureStarter, levelFor } from './core/home.js';
import { audio, musicFor } from './audio.js';

const SAVE_KEY = 'bt.save';
let memorySave = null;   // fallback when localStorage is blocked

export const app = {
  /** @type {{themes:object[], cats:object[], bank:object[], art:object, home:object, themeIds:string[]}} */
  content: null,
  save: null,
  storageOk: true,
  screens: {},
  current: null,
  _cleanup: null,
};

export function loadSave() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { app.storageOk = false; raw = memorySave; }
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { /* corrupt: start fresh */ }
  app.save = migrate(parsed);
  const h = app.content.home;
  ensureStarter(app.save, h);
  if (app.save.home.level == null) app.save.home.level = levelFor(app.save.stats.correct, h.levels).index;   // no fanfare for levels earned before homes existed
  return app.save;
}

export function persist() {
  const s = JSON.stringify(app.save);
  try { localStorage.setItem(SAVE_KEY, s); } catch { app.storageOk = false; memorySave = s; }
}

export function resetSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  memorySave = null;
  loadSave();
  persist();
}

export const themeById = (id) => app.content.themes.find((t) => t.id === id);
/** Byte, the one cat (the first entry of data/cats.json). */
export const byteCat = () => app.content.cats[0];

const NAV_SCREENS = ['home', 'byte', 'stats'];

export function go(name, params = {}) {
  if (app._cleanup) { try { app._cleanup(); } catch (e) { console.error(e); } }
  const root = document.getElementById('screen');
  root.className = 'screen screen-' + name + (NAV_SCREENS.includes(name) ? ' with-nav' : '');
  root.innerHTML = '';
  root.scrollTop = 0;
  document.querySelectorAll('.overlay').forEach((o) => o.remove());
  const nav = document.getElementById('nav');
  nav.hidden = !NAV_SCREENS.includes(name);
  nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.go === name));
  app.current = name;
  audio.playMusic(musicFor(name));
  app._cleanup = app.screens[name].render(root, params) || null;
}
