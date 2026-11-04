// Music + sound effects through Web Audio (adapted from BreakingEmbed's engine; the rendered files are in assets/audio).
//
// * iOS only starts audio inside a tap: the first pointer/touch/key event resumes the context and starts the wanted music.
// * Music is decoded once and looped sample-exact with loopStart/loopEnd from assets/audio/manifest.json (the mp3 carries 1 s
//   of padding on both sides, so encoder delay never opens a gap). Switching tracks crossfades.
// * Two volumes (music, sounds), saved in localStorage. Everything pauses while the app is in the background.

const XFADE = 0.8;
const KEY = 'bt.audio';
const DEFAULTS = { music: 0.6, sfx: 0.8, style: 'cosy' };
export const MUSIC_STYLES = [['cosy', 'Cosy'], ['jazz', 'Café jazz'], ['off', 'Off']];
const CURVE = (v) => v * v;

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.manifest = { music: {}, sfx: {} };
    this.vol = { ...DEFAULTS };
    this.unlocked = false;
    this.wantMusic = '';
    this.curName = '';
    this.buffers = new Map();
    this.loading = new Map();
    this.musBuf = new Map();
    this.mus = null;
    this._pending = '';
    this.active = 0;
    try { Object.assign(this.vol, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* private mode */ }
  }

  async init() {
    try { this.manifest = await (await fetch('assets/audio/manifest.json')).json(); } catch { /* play silently */ }
    const unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) addEventListener(ev, unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => (document.hidden ? this._pause() : this._resume()));
    addEventListener('pagehide', () => this._pause());
    addEventListener('pageshow', () => { if (!document.hidden) this._resume(); });
  }

  _ensureCtx() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const c = (this.ctx = new AC({ latencyHint: 'interactive' }));
    this.bus = { music: c.createGain(), sfx: c.createGain() };
    this.bus.music.connect(c.destination);
    this.bus.sfx.connect(c.destination);
    this._applyVolumes();
    c.addEventListener?.('statechange', () => { if (c.state === 'interrupted' || c.state === 'suspended') this.unlocked = false; });
    return c;
  }

  unlock() {
    const c = this._ensureCtx();
    if (!c) return;
    if (this.unlocked && c.state === 'running') return;
    try { c.resume(); } catch { /* ignore */ }
    try {   // a silent buffer: required by older iOS
      const s = c.createBufferSource();
      s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0);
    } catch { /* ignore */ }
    if (!this.unlocked) {
      this.unlocked = true;
      this._preloadSfx();
      if (this.wantMusic && !this.mus) { const w = this.wantMusic; this.curName = ''; this.playMusic(w); }
    }
  }

  // ---------------------------------------------------------------- volumes
  _applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const n of ['music', 'sfx']) this.bus[n].gain.setTargetAtTime(CURVE(this.vol[n]), t, 0.03);
  }
  getVolume(bus) { return this.vol[bus]; }
  setVolume(bus, v) {
    this.vol[bus] = Math.max(0, Math.min(1, v));
    this._applyVolumes();
    this._save();
  }
  get style() { return this.vol.style; }
  /** 'cosy' | 'jazz' | 'off'; `screen` is the screen showing now, so the change is heard straight away. */
  setStyle(style, screen) {
    this.vol.style = style;
    this._save();
    this.playMusic(musicFor(screen));
  }
  _save() { try { localStorage.setItem(KEY, JSON.stringify(this.vol)); } catch { /* ignore */ } }

  // ---------------------------------------------------------------- SFX
  _decode(arr) {
    return new Promise((res, rej) => { const p = this.ctx.decodeAudioData(arr, res, rej); p?.catch?.(rej); });
  }

  _load(name) {
    if (this.buffers.has(name)) return Promise.resolve(this.buffers.get(name));
    if (this.loading.has(name)) return this.loading.get(name);
    const m = this.manifest.sfx[name];
    if (!m || !this.ctx) return Promise.resolve(null);
    const pr = fetch('assets/audio/' + m.file).then((r) => r.arrayBuffer()).then((a) => this._decode(a))
      .then((b) => { this.buffers.set(name, b); return b; }).catch(() => null);
    this.loading.set(name, pr);
    return pr;
  }

  async _preloadSfx() {
    for (const n of Object.keys(this.manifest.sfx)) await this._load(n);
  }

  /** Plays a sound; unknown names are a no-op. */
  sfx(name) {
    if (!this.ctx || !this.unlocked || this.vol.sfx <= 0) return;
    const m = this.manifest.sfx[name];
    if (!m) return;
    const buf = this.buffers.get(name);
    if (!buf) { this._load(name).then((b) => b && this.sfx(name)); return; }
    if (this.active >= 10) return;
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.connect(this.bus.sfx);
    this.active++;
    s.onended = () => { this.active--; try { s.disconnect(); } catch { /* ignore */ } };
    s.start();
  }

  // ---------------------------------------------------------------- music
  /** Crossfades to a track ('' = silence). Before the first tap it is remembered and started on unlock. */
  playMusic(name) {
    if (!name) { this.stopMusic(); return; }
    this.wantMusic = name;
    if (name === this.curName && this.mus) return;
    if (!this.ctx || !this.unlocked || !this.manifest.music[name]) return;
    this._crossTo(name);
  }

  async _musicBuffer(name) {
    if (this.musBuf.has(name)) { const b = this.musBuf.get(name); this.musBuf.delete(name); this.musBuf.set(name, b); return b; }
    const buf = await fetch('assets/audio/' + this.manifest.music[name].file).then((r) => r.arrayBuffer()).then((a) => this._decode(a));
    this.musBuf.set(name, buf);
    while (this.musBuf.size > 2) this.musBuf.delete(this.musBuf.keys().next().value);   // ~25 MB of PCM each: keep two
    return buf;
  }

  async _crossTo(name) {
    if (this._pending === name) return;
    this._pending = name;
    let buf = null;
    try { buf = await this._musicBuffer(name); } catch { /* offline: stay quiet */ }
    if (this._pending === name) this._pending = '';
    if (!buf || this.wantMusic !== name || !this.ctx || (name === this.curName && this.mus)) return;
    const c = this.ctx, t = c.currentTime, m = this.manifest.music[name];
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    src.loopStart = m.loopStart || 0;
    src.loopEnd = Math.min(m.loopEnd || buf.duration, buf.duration);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(1, t + XFADE);
    src.connect(gain); gain.connect(this.bus.music);
    src.start(0, src.loopStart);
    this._fadeOut(this.mus, t);
    this.mus = { src, gain };
    this.curName = name;
  }

  _fadeOut(m, t) {
    if (!m) return;
    m.gain.gain.cancelScheduledValues(t);
    m.gain.gain.setValueAtTime(m.gain.gain.value, t);
    m.gain.gain.linearRampToValueAtTime(0, t + XFADE);
    setTimeout(() => { try { m.src.stop(); m.src.disconnect(); m.gain.disconnect(); } catch { /* ignore */ } }, XFADE * 1000 + 150);
  }

  stopMusic() {
    this.wantMusic = '';
    if (this.ctx && this.mus) this._fadeOut(this.mus, this.ctx.currentTime);
    this.mus = null; this.curName = '';
  }

  _pause() { if (this.ctx?.state === 'running') this.ctx.suspend().catch(() => {}); }
  _resume() { this.ctx?.resume().catch(() => {}); }
}

export const audio = new AudioEngine();
export const sfx = (name) => audio.sfx(name);

/** Which track a screen wants in the chosen style: the quiz has its own, everything else is home. '' = silence. */
export function musicFor(screen) {
  if (audio.style === 'off') return '';
  return (screen === 'quiz' ? 'quiz' : 'home') + (audio.style === 'jazz' ? '_jazz' : '');
}
