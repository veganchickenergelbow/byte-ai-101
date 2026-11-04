// Generated questions: "Which came first?" (put 3 dated AI milestones in order) and "Higher or lower" (pick the bigger of two).
// Both are marked `special: true` (made up on the spot, so they skip the Brush-up list and the "seen" list).
// Byte's AI 101 only has timeline data (every event is in the llm theme); `compare` is an empty list, so "Higher or lower"
// is never asked unless data/specials.json gains a group of measured things.
import { shuffle } from './round.js';

const MIN_GAP_YEARS = 1;     // events in one timeline at least this far apart (AI history is compact)
const MIN_RATIO = 1.15;      // compared values at least 15% apart
/** Rounds that get specials: the llm theme and the mixed round. Every other theme is plain multiple choice. */
export const SPECIAL_THEMES = ['llm', 'mix'];

const yearText = (y) => (y < 0 ? `${-y} BC` : String(y));
const numText = (v, unit) => `${v.toLocaleString('en-GB')} ${unit}`;
let uid = 0;

const eventsFor = (data, category) => (data?.timeline || []).filter((e) => !category || e.category === category);
const groupsFor = (data, category) => (data?.compare || []).filter((g) => (!category || g.category === category) && (g.items?.length || 0) >= 2);

/**
 * @param {Set<string>} [avoid] event names already used in this round: left out when enough other events remain
 * @returns {object|null} an "order" question, or null if the category has too few events
 */
export function makeTimeline(data, category, rng = Math.random, avoid = new Set()) {
  const all = eventsFor(data, category);
  const fresh = all.filter((e) => !avoid.has(e.name));
  for (const source of fresh.length >= 3 ? [fresh, all] : [all]) {
    const pool = shuffle(source, rng);
    const pickedEvents = [];
    for (const e of pool) {
      if (pickedEvents.every((p) => Math.abs(p.year - e.year) >= MIN_GAP_YEARS && p.name !== e.name)) pickedEvents.push(e);
      if (pickedEvents.length === 3) break;
    }
    if (pickedEvents.length < 3) continue;
    const sorted = [...pickedEvents].sort((a, b) => a.year - b.year);
    return {
      id: `sp_order_${++uid}`, special: true, kind: 'order', type: 'order', difficulty: 2,
      category: category || sorted[0].category,
      question: 'Which came first? Tap them in order, oldest first.',
      items: pickedEvents.map((e) => e.name),
      order: sorted.map((e) => e.name),
      fact: sorted.map((e) => `${e.name} (${yearText(e.year)})`).join(' → '),
    };
  }
  return null;
}

/** @returns {object|null} a two-option question ("Higher or lower"), or null if nothing fits the category */
export function makeCompare(data, category, rng = Math.random) {
  const groups = groupsFor(data, category);
  if (!groups.length) return null;
  const g = groups[Math.floor(rng() * groups.length)];
  for (let tries = 0; tries < 30; tries++) {
    const [a, b] = shuffle(g.items, rng);
    const hi = Math.max(a.value, b.value), lo = Math.min(a.value, b.value);
    if (hi / lo < MIN_RATIO) continue;
    return {
      id: `sp_cmp_${++uid}`, special: true, kind: 'compare', type: 'mc', difficulty: 2, fixedOrder: true,
      category: g.category,
      question: g.question,
      answers: [a.name, b.name],
      correct: a.value > b.value ? 0 : 1,
      fact: `${a.name}: ${numText(a.value, g.unit)} · ${b.name}: ${numText(b.value, g.unit)}`,
    };
  }
  return null;
}

/** Which kinds of special this category has data for: only those are ever requested. */
export function specialKinds(data, category) {
  const kinds = [];
  if (eventsFor(data, category).length >= 3) kinds.push('order');
  if (groupsFor(data, category).length) kinds.push('compare');
  return kinds;
}

/**
 * Swaps about one question in ten for a special one (never the first question), in llm and mixed rounds only. A theme
 * with no special data, or a round too short for one, comes back unchanged.
 * @param {object[]} qs the round (not mutated) @returns {object[]}
 */
export function addSpecials(qs, theme, data, rng = Math.random) {
  const out = qs.slice();
  if (!SPECIAL_THEMES.includes(theme)) return out;
  const cat = theme === 'mix' ? null : theme;
  const count = Math.floor(qs.length / 10 + 0.5);          // about 1 in 10
  const avoid = new Set();
  const slots = shuffle(Array.from({ length: Math.max(0, out.length - 1) }, (_, i) => i + 1), rng);   // never index 0
  for (let k = 0; k < count && slots.length; k++) {
    const kinds = specialKinds(data, cat);
    if (!kinds.length) break;
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const q = kind === 'order' ? makeTimeline(data, cat, rng, avoid) : makeCompare(data, cat, rng);
    if (!q) break;
    if (q.items) q.items.forEach((n) => avoid.add(n));
    out[slots.pop()] = q;
  }
  return out;
}

/** Was the tapped order right? */
export const orderIsRight = (q, tapped) => tapped.length === q.order.length && tapped.every((name, i) => name === q.order[i]);
