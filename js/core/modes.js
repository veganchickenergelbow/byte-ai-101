// The other ways to play: the Daily Byte, Brush-up (your mistakes), and Byte's daily challenge.
import { shuffle, prepare, seeded } from './round.js';
import { dayKey, STARTER } from './progress.js';

export const DAILY = { size: 5, fish: 10, weekBonus: 30, emoji: '💡' };
export const CHALLENGE = { size: 3, winFish: 15, winBond: 8, tryBond: 3 };
export const REVIEW_SIZE = 10;

/**
 * The same 5 questions for everyone on a given day: medium or hard where the theme has them, each from a different theme.
 * A theme with no questions at all is skipped (the next shuffled theme steps in), so a thin bank never crashes it.
 */
export function dailyRound(bank, day, themeIds) {
  const rng = seeded('daily-' + day);
  const out = [];
  for (const t of shuffle(themeIds, rng)) {
    if (out.length >= DAILY.size) break;
    const all = bank.filter((q) => q.category === t);
    const harder = all.filter((q) => (q.difficulty || 2) >= 2);
    const pool = harder.length ? harder : all;
    if (!pool.length) continue;
    out.push(prepare(pool[Math.floor(rng() * pool.length)], rng));
  }
  return out;
}

/** Records a finished daily and pays for it. @returns {{fish:number, weekBonus:number, stamps:number}} */
export function finishDaily(save, day, correct, total, now = Date.now()) {
  const first = !save.daily[day];
  save.daily[day] = { correct, total };
  if (!first) return { fish: 0, weekBonus: 0, stamps: weekStamps(save, now) };
  const stamps = weekStamps(save, now);
  const weekBonus = stamps === 7 ? DAILY.weekBonus : 0;
  save.fish += DAILY.fish + weekBonus;
  save.stats.fishEarned += DAILY.fish + weekBonus;
  return { fish: DAILY.fish, weekBonus, stamps };
}

/** The last 7 days (oldest first) with whether the daily was done. */
export function weekDays(save, now = Date.now()) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now - (6 - i) * 86400000);
    return { day: dayKey(d), label: d.toLocaleDateString('en-GB', { weekday: 'narrow' }), done: !!save.daily[dayKey(d)] };
  });
}
export const weekStamps = (save, now) => weekDays(save, now).filter((d) => d.done).length;

/** Up to 10 questions you got wrong, still waiting to be got right. */
export function reviewRound(bank, reviewIds, rng = Math.random, n = REVIEW_SIZE) {
  const byId = new Map(bank.map((q) => [q.id, q]));
  return shuffle(reviewIds.filter((id) => byId.has(id)), rng).slice(0, n).map((id) => prepare(byId.get(id), rng));
}

/** Days since 1970 for a "YYYY-MM-DD" key (calendar days, so the theme changes at local midnight). */
const dayNumber = (day) => { const [y, m, d] = day.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };

/** The theme Byte asks about on a given day: the themes take turns, one per day. */
export const challengeTheme = (day, themeIds) => themeIds[((dayNumber(day) % themeIds.length) + themeIds.length) % themeIds.length];

/** Today's challenge: Byte asks 3 tricky questions from the theme whose turn it is. Null if Byte or the themes are missing. */
export function todaysChallenge(save, cats, day, themeIds) {
  if (save.challenge?.day === day && themeIds.includes(save.challenge.theme)) return save.challenge;
  const cat = cats.find((c) => c.id === STARTER && save.cats[c.id]) || cats.find((c) => save.cats[c.id]);
  if (!cat || !themeIds.length) return null;
  save.challenge = { day, cat: cat.id, theme: challengeTheme(day, themeIds), done: false, won: false };
  return save.challenge;
}

/** 3 hard questions from the theme, topped up with medium and then easy ones if it has fewer (never repeats a question). */
export function challengeRound(bank, theme, rng = Math.random) {
  const all = bank.filter((q) => q.category === theme);
  const qs = [];
  for (const min of [3, 2, 1]) {
    for (const q of shuffle(all.filter((x) => (x.difficulty || 2) >= min), rng)) {
      if (qs.length < CHALLENGE.size && !qs.includes(q)) qs.push(q);
    }
  }
  return qs.slice(0, CHALLENGE.size).map((q) => prepare(q, rng));
}
