// Byte's home: levels earned by right answers, furniture bought with fish and placed anywhere.

export const ROOM = { w: 270, h: 380 };

/** save.home: owned item ids, where each placed one is ({x, y} anchor in room px; absent = stored), and the window view. */
export function defaultHome() {
  return { owned: [], items: {}, window: 'town', placedStarter: false };
}

/** @returns {{index:number, level:object, next:object|null, have:number, need:number}} index is 0-based */
export function levelFor(correct, levels) {
  let index = 0;
  levels.forEach((l, i) => { if (correct >= l.at) index = i; });
  const level = levels[index], next = levels[index + 1] || null;
  return { index, level, next, have: correct - level.at, need: next ? next.at - level.at : 0 };
}

export const itemById = (home, id) => home.items.find((i) => i.id === id);

/** Puts starter items in their home spots the first time (and for saves from before furniture existed). */
export function ensureStarter(save, homeData) {
  const h = save.home;
  if (h.placedStarter) return;
  for (const id of homeData.starter) {
    if (!h.owned.includes(id)) h.owned.push(id);
    const it = itemById(homeData, id);
    if (!h.items[id]) h.items[id] = { ...it.home };
  }
  h.placedStarter = true;
}

/** @returns {{ok:boolean, reason?:string}} reason: owned | level | fish */
export function buyItem(save, homeData, id, levelIndex) {
  const it = itemById(homeData, id);
  if (save.home.owned.includes(id)) return { ok: false, reason: 'owned' };
  if (it.level - 1 > levelIndex) return { ok: false, reason: 'level' };
  if (save.fish < it.price) return { ok: false, reason: 'fish' };
  save.fish -= it.price;
  save.stats.fishSpent = (save.stats.fishSpent || 0) + it.price;
  save.home.owned.push(id);
  save.home.items[id] = { ...it.home };      // straight into its usual spot; the player can drag it anywhere
  return { ok: true };
}

/** Moves a placed item, kept inside the room (anchor rules as in home.json). */
export function placeItem(save, homeData, id, x, y) {
  const it = itemById(homeData, id);
  const half = it.w;                           // the sprite is drawn at 2x, so half its drawn width = it.w
  const cx = Math.round(Math.max(half * 0.4, Math.min(ROOM.w - half * 0.4, x)));
  const cy = it.layer === 'ceiling' || it.layer === 'wall'
    ? Math.round(Math.max(0, Math.min(ROOM.h - it.h * 2, y)))
    : Math.round(Math.max(it.h * 2, Math.min(ROOM.h, y)));
  save.home.items[id] = { x: cx, y: cy };
}

export function storeItem(save, id) { delete save.home.items[id]; }
export function unstoreItem(save, homeData, id) {
  if (save.home.owned.includes(id) && !save.home.items[id]) save.home.items[id] = { ...itemById(homeData, id).home };
}

/** Cats whose favourite item is in the room: they make the home cosy (a fish bonus each round). Only Byte now. */
export function cosyCats(save, cats) {
  return cats.filter((c) => save.cats[c.id] && save.home.items[c.favourite]);
}
