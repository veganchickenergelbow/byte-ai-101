// "Explain it": free-text answers checked for key points on the device. Pure functions, no DOM, no network.
// Typed text only ever lives in the screen's memory while it is written and checked; nothing here stores it.
export const EXPLAIN = { session: 3, minWords: 12, window: 8, fishPerPoint: 1, fishPerPrompt: 2 };
export const KINDS = ['define', 'example', 'limit', 'customer'];
export const MARKS = ['nailed', 'mostly', 'needs'];
export const MARK_LABEL = { nailed: 'Nailed it', mostly: 'Mostly', needs: 'Needs work' };

/** 1. lowercase, everything except a-z0-9 becomes a space, split on whitespace. */
export const normalise = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);

/** 2. longer than 4 letters: strip the first of ing / ed / es it ends in; otherwise longer than 3 and ending in s (not ss): strip the s. Then drop a final e, so store / stored / stores share a stem. */
export function stem(w) {
  let s = w;
  const suf = w.length > 4 && ['ing', 'ed', 'es'].find((x) => w.endsWith(x));
  if (suf) s = w.slice(0, -suf.length);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) s = w.slice(0, -1);
  return s.length > 3 && s.endsWith('e') ? s.slice(0, -1) : s;
}

export const stems = (text) => normalise(text).map(stem);
export const wordCount = (text) => normalise(text).length;

/** 3. a phrase matches if all its stemmed words occur inside some window of 8 consecutive answer words, in any order. */
export function phraseMatches(phrase, answerStems) {
  const need = [...new Set(stems(phrase))];
  if (!need.length) return false;
  if (need.length === 1) return answerStems.includes(need[0]);
  const n = answerStems.length;
  for (let i = 0; i < Math.max(1, n - EXPLAIN.window + 1); i++) {
    const win = new Set(answerStems.slice(i, i + EXPLAIN.window));
    if (need.every((w) => win.has(w))) return true;
  }
  return false;
}

/** 4. a point is hit if any phrase matches. Under 12 words nothing is scored. */
export function scoreAnswer(item, text) {
  const words = wordCount(text);
  const total = item.points.length;
  if (words < EXPLAIN.minWords) return { scored: false, words, hits: item.points.map(() => false), hit: 0, total };
  const a = stems(text);
  const hits = item.points.map((p) => (p.any || []).some((ph) => phraseMatches(ph, a)));
  return { scored: true, words, hits, hit: hits.filter(Boolean).length, total };
}

const shuffled = (arr, rng) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** A session of 3: "Needs work" prompts first, then never tried, then the oldest tried. `theme` null or 'all' means every theme. */
export function pickSession(items, explain, { theme = null, rng = Math.random, n = EXPLAIN.session } = {}) {
  const by = explain?.byId || {};
  const pool = (items || []).filter((it) => !theme || theme === 'all' || it.theme === theme);
  const needs = shuffled(pool.filter((it) => by[it.id]?.mark === 'needs'), rng);
  const never = shuffled(pool.filter((it) => !by[it.id]?.tries && by[it.id]?.mark !== 'needs'), rng);
  const rest = pool.filter((it) => by[it.id]?.tries && by[it.id]?.mark !== 'needs')
    .sort((a, b) => (by[a.id].at || 0) - (by[b.id].at || 0) || (a.id < b.id ? -1 : 1));
  return [...needs, ...never, ...rest].slice(0, n);
}

/** A prompt was checked or revealed: it counts as a try. Pays nothing yet (fish come with the self-mark, so leaving early costs nothing). */
export function recordTry(save, item, result, now = Date.now()) {
  const ex = save.explain;
  const e = (ex.byId[item.id] ||= { tries: 0, best: 0, last: 0, mark: '', at: 0 });
  if (!e.tries) ex.tried++;
  e.tries++;
  e.last = result.scored ? result.hit : 0;
  e.best = Math.max(e.best, e.last);
  e.at = now;
  return e;
}

/** The owner marks themself: the prompt is finished. Pays +1 fish per key point and +2 per prompt, only for a scored answer. */
export function finishPrompt(save, item, result, mark, now = Date.now()) {
  const ex = save.explain;
  if (!ex.byId[item.id]) recordTry(save, item, result, now);
  if (MARKS.includes(mark)) ex.byId[item.id].mark = mark;
  let fish = 0;
  if (result.scored) {
    ex.points += result.hit; ex.pointsPossible += result.total;
    fish = result.hit * EXPLAIN.fishPerPoint + EXPLAIN.fishPerPrompt;
    save.fish += fish; save.stats.fishEarned += fish;
  }
  return { fish };
}

/** Numbers for the Stats screen. */
export function explainSummary(save, items, themes) {
  const ex = save.explain;
  const ids = new Set((items || []).map((i) => i.id));
  const marks = { nailed: 0, mostly: 0, needs: 0 };
  const needsThemes = new Set();
  for (const [id, e] of Object.entries(ex.byId)) {
    if (!ids.has(id) || !MARKS.includes(e.mark)) continue;
    marks[e.mark]++;
    if (e.mark === 'needs') needsThemes.add(items.find((i) => i.id === id).theme);
  }
  return {
    tried: Object.values(ex.byId).filter((e) => e.tries > 0).length,
    pct: ex.pointsPossible ? Math.round((100 * ex.points) / ex.pointsPossible) : null,
    marks,
    needsThemes: (themes || []).filter((t) => needsThemes.has(t.id)),
  };
}

/** Problems with one data/explain.json item (empty list = fine). The content author validates against the same rules. */
export function validateItem(it, themeIds) {
  const bad = [];
  const need = (ok, msg) => { if (!ok) bad.push(msg); };
  need(typeof it.id === 'string' && /^ex_\w+$/.test(it.id), 'id');
  need(themeIds.includes(it.theme), 'theme');
  need([1, 2, 3].includes(it.difficulty), 'difficulty');
  need(typeof it.prompt === 'string' && it.prompt.length > 5 && it.prompt.length <= 140, 'prompt length');
  need(Array.isArray(it.points) && it.points.length >= 3 && it.points.length <= 5, 'needs 3 to 5 points');
  const pts = Array.isArray(it.points) ? it.points : [];
  need(new Set(pts.map((p) => p.kind)).size >= 3, 'covers at least 3 of the 4 kinds');
  for (const p of pts) {
    need(KINDS.includes(p.kind), 'kind ' + p.kind);
    need(typeof p.label === 'string' && p.label.length > 3 && p.label.length <= 60, 'label length: ' + p.label);
    need(Array.isArray(p.any) && p.any.length >= 1 && p.any.every((s) => typeof s === 'string' && normalise(s).length > 0), 'any phrases: ' + p.label);
  }
  const mw = typeof it.model === 'string' ? wordCount(it.model) : 0;
  need(mw >= 60 && mw <= 90, `model is ${mw} words (60 to 90)`);
  return bad;
}
