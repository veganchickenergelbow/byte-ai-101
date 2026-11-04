// The save shape, answer and round bookkeeping, day streaks and home levels.
import { REWARD, RECENT_KEPT, fishFor } from './round.js';
import { defaultHome, levelFor, cosyCats } from './home.js';

/** Byte is the one and only cat, and is always at home. */
export const STARTER = 'byte';
const newCat = (now) => ({ since: now });

export const SAVE_VERSION = 1;
export const MISTAKES_KEPT = 30;
export const DAYS_KEPT = 60;
const MIN_TIMED_MS = 800;          // quicker than this is a double-tap, not a real answer

/** What kind of question it was, for the per-type stats. */
export const kindOf = (q) => q.kind || q.origType || 'mc';

export function defaultSave(now = Date.now()) {
  return {
    v: SAVE_VERSION,
    fish: 0,
    cats: { [STARTER]: newCat(now) },
    home: defaultHome(),
    seen: {},
    retired: [],                   // questions this player marked "too easy"
    review: [],                    // questions got wrong and not yet got right since: "Brush up" rounds
    daily: {},                     // Daily Byte results by day: { "2026-10-25": { correct, total } }
    challenge: null,               // today's challenge from Byte: { day, cat, theme, done, won }
    bonds: {},                     // friendship points by cat id (only Byte)
    wear: {},                      // accessory worn, by cat id
    stats: {
      answered: 0, correct: 0, rounds: 0, perfect: 0, fishEarned: 0,
      bestStreak: 0, dayStreak: 0, bestDayStreak: 0, lastDay: '',
      themes: {}, mistakes: [],
      recent: [],                  // last RECENT_KEPT answers, 1 = right: drives the difficulty mix
      byDay: {},                   // "2026-10-25": { a: answered, c: right, ms: time spent } (last DAYS_KEPT days)
      byDiff: {},                  // "1" | "2" | "3": { a, c }
      byKind: {},                  // mc | tf | estimate | order | compare: { a, c }
      timeMs: 0, timed: 0,         // time spent answering, and how many answers were timed
      fastestMs: 0,                // quickest right answer (ignoring sub-second taps)
      mastered: 0,                 // Brush-up questions finally got right
      fishSpent: 0,
      challenges: { played: 0, won: 0 },
    },
    explain: { byId: {}, tried: 0, points: 0, pointsPossible: 0 },   // Explain it: counts and self-marks only, never the typed text
    settings: { roundSize: 10 },
    lastTheme: 'mix',
    welcomed: false,
    hints: {},                     // one-off tips already dismissed: { install: true }
  };
}

/** Local calendar day, e.g. "2026-10-22". */
export function dayKey(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Fills in fields a newer version added; drops nothing. Byte is always at home. */
export function migrate(raw, now = Date.now()) {
  const base = defaultSave(now);
  if (!raw || typeof raw !== 'object') return base;
  const s = { ...base, ...raw, stats: { ...base.stats, ...(raw.stats || {}) }, settings: { ...base.settings, ...(raw.settings || {}) } };
  s.cats = { ...base.cats, ...(raw.cats && typeof raw.cats === 'object' ? raw.cats : {}) };
  s.home = { ...base.home, ...(raw.home || {}) };
  s.hints = { ...base.hints, ...(raw.hints || {}) };
  const ex = raw.explain && typeof raw.explain === 'object' ? raw.explain : {};
  s.explain = { ...base.explain, ...ex, byId: ex.byId && typeof ex.byId === 'object' && !Array.isArray(ex.byId) ? ex.byId : {} };
  for (const k of ['tried', 'points', 'pointsPossible']) if (!Number.isFinite(s.explain[k])) s.explain[k] = 0;
  return s;
}

/**
 * Records one answer. `streak` is the in-round run of correct answers before this one; `ms` how long it took.
 * @returns {{fish:number, streak:number}}
 */
export function recordAnswer(save, q, chosen, streak, ms = 0, now = Date.now()) {
  const st = save.stats;
  const ok = chosen === q.correct;
  const th = (st.themes[q.category] ||= { answered: 0, correct: 0 });
  st.answered++; th.answered++;
  const tally = (bucket, key) => { const b = (bucket[key] ||= { a: 0, c: 0 }); b.a++; if (ok) b.c++; return b; };
  const day = tally(st.byDay, dayKey(new Date(now)));
  tally(st.byDiff, String(q.difficulty || 2));
  tally(st.byKind, kindOf(q));
  if (ms >= MIN_TIMED_MS && ms < 10 * 60000) {
    st.timeMs += ms; st.timed++; day.ms = (day.ms || 0) + ms;
    if (ok && (!st.fastestMs || ms < st.fastestMs)) st.fastestMs = ms;
  }
  const days = Object.keys(st.byDay).sort();
  for (const old of days.slice(0, Math.max(0, days.length - DAYS_KEPT))) delete st.byDay[old];
  st.recent.push(ok ? 1 : 0);
  if (st.recent.length > RECENT_KEPT) st.recent.splice(0, st.recent.length - RECENT_KEPT);
  if (!q.special) {                // made-up specials (timelines, comparisons) have no fixed id to come back to
    const at = save.review.indexOf(q.id);
    if (!ok && at < 0) save.review.push(q.id);
    if (ok && at >= 0) { save.review.splice(at, 1); st.mastered++; }
  }
  if (!ok) {
    st.mistakes.unshift({ id: q.id, q: q.question, yours: q.answers[chosen], right: q.answers[q.correct], cat: q.category });
    st.mistakes.length = Math.min(st.mistakes.length, MISTAKES_KEPT);
    return { fish: 0, streak: 0 };
  }
  st.correct++; th.correct++;
  const s = streak + 1;
  st.bestStreak = Math.max(st.bestStreak, s);
  const fish = fishFor(q, s);
  save.fish += fish; st.fishEarned += fish;
  return { fish, streak: s };
}

/**
 * Called once a round is finished: pays the bonuses (including Byte's cosy bonus when its favourite item is in the room),
 * updates the day streak and notices a new home level. `content` = { cats, home (data/home.json) }.
 */
export function finishRound(save, { correct, total }, content, now = Date.now()) {
  const st = save.stats;
  st.rounds++;
  const perfect = total > 0 && correct === total;
  if (perfect) st.perfect++;
  const today = dayKey(new Date(now));
  const yesterday = dayKey(new Date(now - 86400000));
  if (st.lastDay !== today) st.dayStreak = st.lastDay === yesterday ? st.dayStreak + 1 : 1;
  st.lastDay = today;
  st.bestDayStreak = Math.max(st.bestDayStreak, st.dayStreak);

  const cosy = cosyCats(save, content.cats).length * REWARD.cosyPerCat;
  // longer rounds pay proportionally bigger end bonuses (a 30-question round = 3x a 10-question one)
  const scale = total / 10;
  const roundBonus = Math.round(REWARD.roundDone * scale);
  const perfectBonus = perfect ? Math.round(REWARD.perfect * scale) : 0;
  const bonus = roundBonus + perfectBonus;
  save.fish += bonus + cosy; st.fishEarned += bonus + cosy;
  const lv = levelFor(st.correct, content.home.levels).index;
  const levelUp = lv > save.home.level ? lv : null;
  save.home.level = Math.max(save.home.level ?? 0, lv);
  return { perfect, bonus, roundBonus, perfectBonus, cosy, dayStreak: st.dayStreak, levelUp };
}

/** "Too easy": this player never sees the question again (undo with save.retired = []). */
export function retireQuestion(save, id) {
  if (!save.retired.includes(id)) save.retired.push(id);
}
