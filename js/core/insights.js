// Summaries for the Stats screen, worked out from save.stats (pure, so they can be tested).
import { dayKey } from './progress.js';
import { heartsFor } from './bonds.js';

export const KIND_LABEL = { mc: 'Multiple choice', tf: 'True or false', estimate: 'Number questions', order: 'Which came first?', compare: 'Higher or lower' };
export const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const MIN_FOR_RANKING = 10;     // answers in a theme before it can be called strongest / weakest

export const pct = (b) => (b && b.a ? Math.round((100 * b.c) / b.a) : null);

/** The last `n` days, oldest first: { day, label, weekday, a, c }. */
export function lastDays(st, n = 14, now = Date.now()) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now - (n - 1 - i) * 86400000);
    const key = dayKey(d), b = st.byDay?.[key] || { a: 0, c: 0 };
    return { day: key, label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), weekday: d.toLocaleDateString('en-GB', { weekday: 'narrow' }), a: b.a, c: b.c };
  });
}

export function summary(save, content, now = Date.now()) {
  const st = save.stats;
  const days = Object.entries(st.byDay || {});
  const best = days.reduce((m, [day, b]) => (b.c > (m?.c ?? -1) ? { day, ...b } : m), null);
  const themes = content.themes.filter((t) => t.id !== 'mix')
    .map((t) => ({ t, ...(st.themes[t.id] || { answered: 0, correct: 0 }) }))
    .filter((x) => x.answered >= MIN_FOR_RANKING)
    .map((x) => ({ ...x, pct: Math.round((100 * x.correct) / x.answered) }))
    .sort((a, b) => b.pct - a.pct);
  const recentAcc = st.recent.length ? Math.round((100 * st.recent.reduce((a, b) => a + b, 0)) / st.recent.length) : null;
  const dailies = Object.values(save.daily || {});
  const fortnight = lastDays(st, 14, now);
  return {
    accuracy: st.answered ? Math.round((100 * st.correct) / st.answered) : 0,
    recentAcc,
    avgSec: st.timed ? st.timeMs / st.timed / 1000 : null,
    fastestSec: st.fastestMs ? st.fastestMs / 1000 : null,
    minutes: Math.round((st.timeMs || 0) / 60000),
    daysPlayed: days.filter(([, b]) => b.a > 0).length,
    bestDay: best && best.c > 0 ? best : null,
    strongest: themes[0] || null,
    weakest: themes.length > 1 ? themes[themes.length - 1] : null,
    dailies: dailies.length,
    perfectDailies: dailies.filter((d) => d.total && d.correct === d.total).length,
    challenges: st.challenges || { played: 0, won: 0 },
    furniture: save.home.owned.length,
    furnitureTotal: content.home.items.length,
    hearts: Object.keys(save.cats).reduce((n, id) => n + heartsFor(save.bonds?.[id]), 0),
    fortnight,
    fortnightTotal: fortnight.reduce((m, d) => ({ a: m.a + d.a, c: m.c + d.c }), { a: 0, c: 0 }),
  };
}
