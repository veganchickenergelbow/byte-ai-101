// Picking a round of questions (no repeats until a theme runs dry) and the fish rewards.

export const ROUND_SIZE = 10;
export const ROUND_SIZES = [10, 20, 30];
export const REWARD = { roundDone: 3, perfect: 5, streakBonusFrom: 3, cosyPerCat: 1 };

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Adaptive difficulty: the share of easy / medium / hard questions, from how you've done lately.
export const RECENT_KEPT = 40;
const MIXES = [   // [min recent accuracy, easy, medium, hard]
  [0.85, 0.1, 0.3, 0.6],
  [0.7, 0.15, 0.4, 0.45],
  [0.5, 0.25, 0.45, 0.3],
  [0, 0.35, 0.45, 0.2],
];
const START_MIX = [0.2, 0.5, 0.3];   // until there are 10 recent answers to go on

/** @param {number[]} recent 1 = right, 0 = wrong, newest last @returns {{1:number,2:number,3:number}} question counts */
export function mixFor(recent, n = ROUND_SIZE) {
  let shares = START_MIX;
  if (recent.length >= 10) {
    const acc = recent.reduce((a, b) => a + b, 0) / recent.length;
    shares = MIXES.find(([min]) => acc >= min).slice(1);
  }
  const easy = Math.round(n * shares[0]), hard = Math.round(n * shares[2]);
  return { 1: easy, 2: n - easy - hard, 3: hard };
}

/**
 * @param {object[]} bank all questions
 * @param {string} theme a category id, or 'mix'
 * @param {Record<string,string[]>} seen ids already asked, stored under each question's own category so mix and themes share one list.
 *   Mutated only to migrate an old seen.mix and to reset when a pool runs dry (a theme's list, or every list for mix).
 *   Ids are added by markSeen as questions are answered, so quitting a round uses nothing up.
 * @param {{1:number,2:number,3:number}} [mix] how many of each difficulty (see mixFor); topped up from the rest if short
 * @returns {object[]} questions with shuffled answers ({answers, correct} rewritten), easy first. A round is never longer
 *   than the pool (a theme holds only about 25 questions, so a 30-question themed round is every question in it, once each).
 */
export function pickRound(bank, theme, seen, rng = Math.random, n = ROUND_SIZE, mix = mixFor([], n)) {
  if (seen.mix) {                  // old saves kept mix apart: file each id under its own category
    const cat = new Map(bank.map((q) => [q.id, q.category]));
    for (const id of seen.mix) if (cat.has(id)) markSeen(seen, { id, category: cat.get(id) });
    delete seen.mix;
  }
  const ids = new Set();           // one entry per question id, so a round can never repeat a question
  const pool = (theme === 'mix' ? bank : bank.filter((q) => q.category === theme)).filter((q) => !ids.has(q.id) && ids.add(q.id));
  n = Math.min(n, pool.length);    // cap the round at what the theme has
  if (n <= 0) return [];
  const used = new Set(theme === 'mix' ? Object.values(seen).flat() : seen[theme] || []);
  let fresh = pool.filter((q) => !used.has(q.id));
  if (fresh.length < n) {          // ran dry: start over, keeping the leftovers first
    if (theme === 'mix') for (const k of Object.keys(seen)) seen[k] = [];
    else seen[theme] = [];
    fresh = [...shuffle(fresh, rng), ...shuffle(pool.filter((q) => !fresh.includes(q)), rng)];
  } else {
    fresh = shuffle(fresh, rng);
  }
  const want = fitMix(mix, n);
  const picked = [];
  for (const d of [1, 2, 3]) picked.push(...fresh.filter((q) => (q.difficulty || 2) === d).slice(0, want[d]));
  for (const q of fresh) { if (picked.length >= n) break; if (!picked.includes(q)) picked.push(q); }   // every id in `fresh` is unique, so no repeats
  const round = picked.slice(0, n).sort((a, b) => (a.difficulty || 2) - (b.difficulty || 2));
  return round.map((q) => prepare(q, rng));
}

/** The same easy / medium / hard shares, scaled down to `n` questions when the round was capped (never more than n in total). */
export function fitMix(mix, n) {
  const total = mix[1] + mix[2] + mix[3];
  if (total <= n) return mix;
  const easy = Math.round((mix[1] * n) / total), hard = Math.round((mix[3] * n) / total);
  return { 1: easy, 2: Math.max(0, n - easy - hard), 3: hard };
}

/** Marks an answered question as seen, under its own category (mix and themes share it). */
export function markSeen(seen, q) {
  const list = (seen[q.category] ||= []);
  if (!list.includes(q.id)) list.push(q.id);
}

/** A copy of a question with its options shuffled (except True/False and number ladders, which read best in order). */
export function prepare(q, rng = Math.random) {
  if (q.fixedOrder) return { ...q };
  const order = shuffle(q.answers.map((_, i) => i), rng);
  return { ...q, answers: order.map((i) => q.answers[i]), correct: order.indexOf(q.correct) };
}

/** A small deterministic random generator from a string (the same day gives the same daily questions). */
export function seeded(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296);
}

/** Fish for one correct answer: 1/2/3 by difficulty, +1 once you're on a roll. `streak` includes this answer. */
export const fishFor = (q, streak) => (q.difficulty || 2) + (streak >= REWARD.streakBonusFrom ? 1 : 0);
