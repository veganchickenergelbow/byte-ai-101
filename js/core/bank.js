// Turns the shared question bank (mc / tf / estimate, from BreakingEmbed) into plain multiple choice.

function seeded(str) {   // small deterministic rng per question, so distractors don't change between visits
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296);
}

const fmt = (n, unit) => (unit === 'year' ? String(n) : n.toLocaleString('en-GB') + (unit ? ' ' + unit : ''));

/** An estimate question as 4 options: the answer and 3 neighbours spaced well outside the old tolerance. */
function estimateToMc(q) {
  const rng = seeded(q.id);
  const step = q.step || 1;
  const span = (q.max ?? q.answer * 2) - (q.min ?? 0);
  let d = Math.max((q.tolerance || 0) * 2 + step, span / 10);
  d = Math.max(step, Math.round(d / step) * step);
  const ok = (v) => v !== q.answer && (q.min == null || v >= q.min) && (q.max == null || v <= q.max) && v >= 0;
  const cands = [-3, -2, -1, 1, 2, 3].map((k) => q.answer + k * d).filter(ok);
  const picks = [];
  while (picks.length < 3 && cands.length) picks.push(cands.splice(Math.floor(rng() * cands.length), 1)[0]);
  if (picks.length < 3) return null;
  const nums = [q.answer, ...picks].sort((a, b) => a - b);
  return { ...q, type: 'mc', origType: 'estimate', answers: nums.map((n) => fmt(n, q.unit)), correct: nums.indexOf(q.answer), fixedOrder: true };
}

export function normaliseQuestion(q) {
  if (q.type === 'mc') return q.answers?.length >= 2 ? q : null;
  if (q.type === 'tf') return { ...q, type: 'mc', origType: 'tf', answers: ['True', 'False'], correct: q.answer ? 0 : 1, fixedOrder: true };
  if (q.type === 'estimate') return estimateToMc(q);
  return null;
}

export const normaliseBank = (raw) => raw.map(normaliseQuestion).filter(Boolean);
