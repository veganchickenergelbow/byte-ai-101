// The live home room: window view (tinted by the time of day), the room frame, placed furniture and wandering cats.
// Everything inside is laid out in native room pixels (270 x 380) and the whole layer is scaled to fit, with
// pixelated rendering. Furniture and cats are drawn at 2x, as in BreakingEmbed's café.
import { app, persist } from './app.js';
import { ROOM, itemById, placeItem } from './core/home.js';
import { esc, el, popHeart, accessoryHTML } from './ui.js';
import { sfx } from './audio.js';

const GLASS = { x: 64, y: 48, w: 152, h: 106 };
const CAT = { w: 68, h: 60 };
const FLOOR = { x0: 28, x1: 242, y0: 262, y1: 376 };     // where a cat's feet can be when walking
const WALK_SPEED = 42;                                     // room px per second
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function timeOfDay(d = new Date()) {
  const h = d.getHours();
  return h >= 20 || h < 6 ? 'night' : h >= 17 ? 'evening' : h < 9 ? 'morning' : 'day';
}

export class Room {
  /**
   * @param {HTMLElement} host
   * @param {{area?:string, cats?:object[], onCatTap?:Function, onSelect?:Function, onMove?:Function}} [opts]
   *   area: 'room' (default) or 'balcony'; cats: who lives in this area (default: every cat at home)
   */
  constructor(host, opts = {}) {
    this.area = opts.area || 'room';
    this.host = host;
    this.opts = opts;
    this.cats = [];
    this.timers = new Set();
    this.decorating = false;
    this.selected = null;
    this.el = el(`<div class="room is-${timeOfDay()}"><div class="room-inner"></div></div>`);
    this.inner = this.el.firstElementChild;
    host.appendChild(this.el);
    this.onResize = () => this.fit();
    addEventListener('resize', this.onResize);
    this.draw();
    this.fit();
  }

  /** Largest scale that fits the host's width and about half the screen's height. */
  fit() {
    const w = this.host.clientWidth || 360;
    const maxH = Math.max(260, innerHeight * 0.5);
    this.scale = Math.min(w / ROOM.w, maxH / ROOM.h);
    this.el.style.width = Math.floor(ROOM.w * this.scale) + 'px';
    this.el.style.height = Math.floor(ROOM.h * this.scale) + 'px';
    this.inner.style.transform = `scale(${this.scale})`;
  }

  draw() {
    const h = app.save.home;
    this.el.classList.toggle('is-balcony', this.area === 'balcony');
    this.inner.innerHTML = this.area === 'balcony'
      ? `<img class="r-frame px" src="assets/img/room/balcony.png" alt="" draggable="false">
        <div class="r-light"></div>`
      : `<img class="r-view px" src="assets/img/room/window_${esc(h.window)}.png" alt="" draggable="false"
          style="left:${GLASS.x}px;top:${GLASS.y}px;width:${GLASS.w}px;height:${GLASS.h}px">
        <div class="r-view-tint" style="left:${GLASS.x}px;top:${GLASS.y}px;width:${GLASS.w}px;height:${GLASS.h}px"></div>
        <img class="r-frame px" src="assets/img/room/frame.png" alt="" draggable="false">
        <div class="r-light"></div><div class="r-lamp"></div>`;
    this.items = {};
    for (const [id, pos] of Object.entries(h.items)) if (this.inArea(id)) this.drawItem(id, pos);
    this.placeCats();
  }

  inArea(id) { const it = itemById(app.content.home, id); return !!it && (it.area || 'room') === this.area; }

  drawItem(id, pos) {
    const it = itemById(app.content.home, id);
    if (!it) return;
    const node = el(`<img class="r-item px layer-${it.layer}" data-id="${id}" src="assets/img/room/furniture/${id}.png" alt="${esc(it.name)}" draggable="false">`);
    node.style.width = it.w * 2 + 'px';
    node.style.height = it.h * 2 + 'px';
    this.inner.insertBefore(node, this.inner.querySelector('.r-light'));
    this.items[id] = node;
    this.positionItem(id, pos);
    node.addEventListener('pointerdown', (e) => this.dragStart(e, id));
  }

  positionItem(id, pos) {
    const it = itemById(app.content.home, id), node = this.items[id];
    node.style.left = pos.x - it.w + 'px';
    const hung = it.layer === 'ceiling' || it.layer === 'wall';      // anchored at the top
    node.style.top = (hung ? pos.y : pos.y - it.h * 2) + 'px';
    node.style.zIndex = { rug: 50, wall: 40, ceiling: 3000 }[it.layer] ?? 200 + 2 * pos.y;
  }

  // ------------------------------------------------------------------ cats
  /** Free perches: placed furniture with a spot for a cat that nobody is using. */
  perches(except) {
    const h = app.save.home;
    return Object.keys(h.items).filter((id) => this.inArea(id))
      .map((id) => ({ id, it: itemById(app.content.home, id), pos: h.items[id] }))
      .filter((p) => p.it?.perch && !this.cats.some((c) => c !== except && c.perch === p.id));
  }

  perchPoint(p) { return { x: p.pos.x + p.it.perch.dx, y: p.pos.y + p.it.perch.dy }; }

  placeCats() {
    for (const c of this.cats) c.el.remove();
    this.clearTimers();
    const owned = this.opts.cats || app.content.cats.filter((c) => app.save.cats[c.id]);
    this.cats = owned.map((cat) => {
      // the figure (sprite + accessory) flips and bobs as one; the button only moves around the room
      const node = el(`<button class="r-cat" aria-label="${esc(cat.name)}"><span class="r-fig"><img class="px" alt="" draggable="false"></span></button>`);
      this.inner.insertBefore(node, this.inner.querySelector('.r-light'));
      const fig = node.firstElementChild;
      const c = { cat, el: node, fig, img: fig.firstElementChild, x: 0, y: 0, pose: 'idle', facing: 1, perch: null };
      node.addEventListener('click', () => this.tapCat(c));
      return c;
    });
    for (const c of this.cats) {
      // start the day: a favourite spot if it is free, otherwise somewhere on the floor
      const fav = this.perches(c).find((p) => p.id === c.cat.favourite);
      if (fav && Math.random() < 0.7) this.setOnPerch(c, fav);
      else { const f = this.floorPoint(); this.setAt(c, f.x, f.y); this.setPose(c, Math.random() < 0.3 ? 'sleep' : 'idle'); }
      c.facing = Math.random() < 0.5 ? 1 : -1;
      this.drawCat(c);
      this.schedule(c, rand(1500, 6000));
    }
  }

  floorPoint() { return { x: rand(FLOOR.x0, FLOOR.x1), y: rand(FLOOR.y0, FLOOR.y1) }; }

  setAt(c, x, y) {
    c.x = x; c.y = y;
    c.el.style.left = x - CAT.w / 2 + 'px';
    c.el.style.top = y - CAT.h + 'px';
    c.el.style.zIndex = c.perch ? this.perchZ(c) : 201 + 2 * Math.round(y);
  }

  perchZ(c) {
    const p = this.perches(c).find((q) => q.id === c.perch) || { it: itemById(app.content.home, c.perch), pos: app.save.home.items[c.perch] };
    // sitting in front of an item: normal floor depth; on top of it: just above the item
    return p.it.perch.dy >= 0 ? 201 + 2 * Math.round(c.y) : 202 + 2 * p.pos.y;
  }

  setOnPerch(c, p) {
    c.perch = p.id;
    const pt = this.perchPoint(p);
    this.setAt(c, pt.x, pt.y);
    this.setPose(c, p.it.perch.pose);
  }

  setPose(c, pose) {
    c.pose = pose;
    c.img.src = `assets/img/cats/${c.cat.id}_${pose}.png`;
    c.el.classList.toggle('sleeping', pose === 'sleep');
    c.fig.querySelector('.acc')?.remove();
    const acc = accessoryHTML(c.cat, pose);
    if (acc) c.fig.insertAdjacentHTML('beforeend', acc);
  }

  drawCat(c) { c.fig.style.scale = `${c.facing} 1`; }   // `scale`, not transform: the bob animation owns transform

  /** Walks (or hops up) to a point, then calls done. */
  moveTo(c, x, y, done) {
    const dist = Math.hypot(x - c.x, y - c.y);
    if (Math.abs(x - c.x) > 2) { c.facing = x < c.x ? -1 : 1; this.drawCat(c); }
    const jump = Math.abs(y - c.y) > 40;
    const dur = jump ? 0.55 : Math.max(0.5, dist / WALK_SPEED);
    this.setPose(c, 'idle');
    c.el.style.transition = `left ${dur}s linear, top ${dur}s ${jump ? 'cubic-bezier(.3,-0.6,.6,1)' : 'linear'}`;
    c.el.classList.add(jump ? 'jumping' : 'walking');
    this.setAt(c, x, y);
    this.later(() => {
      c.el.style.transition = '';
      c.el.classList.remove('walking', 'jumping');
      done?.();
    }, dur * 1000);
  }

  schedule(c, ms) { this.later(() => this.act(c), ms); }

  /** One decision: wander, go to a perch, nap, or stretch happily. */
  act(c) {
    if (this.decorating || document.hidden || reduceMotion()) { this.schedule(c, 4000); return; }
    const r = Math.random();
    const leave = () => { c.perch = null; };
    if (r < 0.4) {
      leave();
      const f = this.floorPoint();
      this.moveTo(c, f.x, f.y, () => { this.setPose(c, Math.random() < 0.25 ? 'sleep' : 'idle'); this.schedule(c, rand(4000, 9000)); });
    } else if (r < 0.68) {
      const free = this.perches(c);
      const p = free.find((q) => q.id === c.cat.favourite && Math.random() < 0.6) || (free.length ? pick(free) : null);
      if (!p) { this.schedule(c, 1500); return; }
      leave();
      const pt = this.perchPoint(p);
      c.perch = p.id;      // reserve it so nobody else heads there
      this.moveTo(c, pt.x, pt.y, () => { this.setOnPerch(c, p); this.schedule(c, p.it.perch.pose === 'sleep' ? rand(12000, 22000) : rand(6000, 12000)); });
    } else if (r < 0.88) {
      this.setPose(c, 'sleep');
      this.schedule(c, rand(10000, 18000));
    } else {
      this.setPose(c, 'happy');
      this.later(() => this.setPose(c, 'idle'), 1600);
      this.schedule(c, rand(3000, 7000));
    }
  }

  tapCat(c) {
    if (this.decorating) return;
    sfx('boop');
    this.opts.onCatTap?.(c.cat);
    const was = c.pose;
    this.setPose(c, 'happy');
    c.el.classList.remove('hop'); void c.el.offsetWidth; c.el.classList.add('hop');
    this.later(() => { c.el.classList.remove('hop'); if (c.pose === 'happy') this.setPose(c, was === 'sleep' ? 'idle' : was); }, 1800);
    this.bubble(c, pick(c.cat.taps || ['Mrrp.']));
    popHeart(this.inner, c.x, c.y - CAT.h, '💕');
  }

  bubble(c, text) {
    this.inner.querySelector('.r-bubble')?.remove();
    const b = el(`<div class="r-bubble"><b>${esc(c.cat.name)}</b> ${esc(text)}</div>`);
    this.inner.appendChild(b);
    const w = 150;
    b.style.width = w + 'px';
    b.style.left = Math.max(4, Math.min(ROOM.w - w - 4, c.x - w / 2)) + 'px';
    b.style.top = Math.max(4, c.y - CAT.h - 6) + 'px';
    this.later(() => b.remove(), 3200);
  }

  // ------------------------------------------------------------------ decorating
  setDecorating(on) {
    this.decorating = on;
    this.el.classList.toggle('decorating', on);
    if (!on) this.select(null);
  }

  select(id) {
    this.selected = id;
    for (const [k, n] of Object.entries(this.items)) n.classList.toggle('selected', k === id);
    this.opts.onSelect?.(id);
  }

  dragStart(e, id) {
    if (!this.decorating) return;
    e.preventDefault();
    const node = this.items[id], start = { ...app.save.home.items[id] }, px = e.clientX, py = e.clientY;
    let moved = false;
    node.setPointerCapture(e.pointerId);
    node.classList.add('dragging');
    const move = (ev) => {
      const dx = (ev.clientX - px) / this.scale, dy = (ev.clientY - py) / this.scale;
      if (Math.hypot(dx, dy) > 3) moved = true;
      placeItem(app.save, app.content.home, id, start.x + dx, start.y + dy);
      this.positionItem(id, app.save.home.items[id]);
    };
    const up = () => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
      node.classList.remove('dragging');
      if (moved) { persist(); sfx('tap'); this.refreshPerch(id); this.opts.onMove?.(id); }
      this.select(id);
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
  }

  /** A cat on a moved item moves with it; on a removed item it hops down to the floor. */
  refreshPerch(id) {
    const pos = app.save.home.items[id];
    for (const c of this.cats.filter((k) => k.perch === id)) {
      if (pos) this.setOnPerch(c, { id, it: itemById(app.content.home, id), pos });
      else { c.perch = null; const f = this.floorPoint(); this.setAt(c, f.x, f.y); this.setPose(c, 'idle'); }
    }
  }

  /** Adds or removes an item's sprite after buying, storing or placing it again. */
  syncItem(id) {
    if (!this.inArea(id)) return;
    const pos = app.save.home.items[id];
    if (pos && !this.items[id]) this.drawItem(id, pos);
    if (!pos && this.items[id]) { this.items[id].remove(); delete this.items[id]; }
    this.refreshPerch(id);
  }

  // ------------------------------------------------------------------ housekeeping
  later(fn, ms) {
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms);
    this.timers.add(t);
  }

  clearTimers() { for (const t of this.timers) clearTimeout(t); this.timers.clear(); }

  destroy() {
    this.clearTimers();
    removeEventListener('resize', this.onResize);
    this.el.remove();
  }
}
