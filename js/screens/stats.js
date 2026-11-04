// The tracker: totals, the last two weeks, accuracy by difficulty and question type, speed, habits, home, themes, mistakes.
import { app, themeById } from '../app.js';
import { esc, icon, themeIcon } from '../ui.js';
import { summary, pct, KIND_LABEL, DIFF_LABEL } from '../core/insights.js';
import { levelFor } from '../core/home.js';
import { DAILY } from '../core/modes.js';
import { explainSummary } from '../core/explain.js';

const tile = (v, label, c) => `<div class="tile" style="--c:${c}"><b>${v}</b><span>${label}</span></div>`;
const row = (label, value) => `<div class="stat-row"><span>${label}</span><b>${value}</b></div>`;
const secs = (s) => (s == null ? '–' : s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);
const day = (key) => new Date(key + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** A bar with its value written beside it (the bar alone never carries the number). */
function meter(label, b, color) {
  const p = pct(b);
  return `<div class="meter-row"><span class="m-label">${label}</span>
    <div class="bar" style="--c:${color}"><i style="width:${p ?? 0}%"></i></div>
    <span class="m-val">${p == null ? '–' : `${p}%`}<small>${b?.a ? ` of ${b.a}` : ''}</small></span></div>`;
}

/** Last 14 days: one column per day, right answers (bottom) and wrong ones stacked above; tap a day for its numbers. */
function fortnightChart(days) {
  const max = Math.max(1, ...days.map((d) => d.a));
  const cols = days.map((d, i) => {
    const hr = (100 * d.c) / max, hw = (100 * (d.a - d.c)) / max;
    return `<button class="fc-col" data-i="${i}" aria-label="${d.label}: ${d.a} answered, ${d.c} right">
      <span class="fc-stack">${d.a - d.c ? `<i class="fc-wrong" style="height:${hw}%"></i>` : ''}${d.c ? `<i class="fc-right" style="height:${hr}%"></i>` : ''}</span>
      <span class="fc-day">${d.weekday}</span></button>`;
  }).join('');
  return `<div class="fc" role="group" aria-label="Answers over the last 14 days">
      <span class="fc-max">${max}</span><div class="fc-cols">${cols}</div></div>
    <div class="fc-legend"><span><i class="sw right"></i>Right</span><span><i class="sw wrong"></i>Wrong</span>
      <span class="fc-tip small dim">Tap a day for its numbers.</span></div>`;
}

export function render(root) {
  const save = app.save, st = save.stats;
  const s = summary(save, app.content);
  const lv = levelFor(st.correct, app.content.home.levels);
  const themes = app.content.themes.filter((t) => t.id !== 'mix').map((t) => {
    const th = st.themes[t.id] || { answered: 0, correct: 0 };
    const p = th.answered ? Math.round((100 * th.correct) / th.answered) : 0;
    return `<div class="theme-row">
      <span class="t-ico">${themeIcon(t)}</span>
      <div class="grow"><div class="row"><b>${esc(t.name)}</b><div class="spacer"></div><span class="small dim">${th.correct}/${th.answered} · ${th.answered ? p + '%' : '–'}</span></div>
      <div class="bar" style="--c:${t.color}"><i style="width:${p}%"></i></div></div></div>`;
  }).join('');
  const mistakes = st.mistakes.slice(0, 15).map((m) => `<div class="mistake">
      <p><span class="small dim">${themeById(m.cat) ? themeIcon(themeById(m.cat)) : ''}</span> ${esc(m.q)}</p>
      <p class="small"><span class="no">${icon('cross')} ${esc(m.yours)}</span> <span class="yes">${icon('check')} ${esc(m.right)}</span></p></div>`).join('');
  const kinds = Object.keys(KIND_LABEL).filter((k) => st.byKind?.[k]?.a);
  const hasDiff = [1, 2, 3].some((d) => st.byDiff?.[d]?.a);
  const fresh = !Object.keys(st.byDay || {}).length && st.answered > 0;

  const ex = explainSummary(save, app.content.explain, app.content.themes);
  root.innerHTML = `<h1 class="title">Your stats</h1>
    <div class="tiles four">
      ${tile(st.answered, 'Answered', 'var(--sky)')}
      ${tile(st.correct, 'Right', 'var(--green)')}
      ${tile(st.answered - st.correct, 'Wrong', 'var(--red)')}
      ${tile(s.accuracy + '%', 'Accuracy', 'var(--lav)')}
    </div>
    <div class="tiles four">
      ${tile(st.rounds, 'Rounds', 'var(--ink)')}
      ${tile(st.perfect, 'Perfect', 'var(--yellow)')}
      ${tile(st.bestStreak, 'Best run', 'var(--pink)')}
      ${tile(`${st.dayStreak}<small>/${st.bestDayStreak}</small>`, 'Day streak', 'var(--pink)')}
    </div>
    ${fresh ? '<p class="small dim center">The detailed numbers below start counting from today.</p>' : ''}

    <h2>Last 14 days</h2>
    <div class="card">${fortnightChart(s.fortnight)}
      <p class="small fc-total">${s.fortnightTotal.a} answered · ${s.fortnightTotal.c} right${s.fortnightTotal.a ? ` · ${Math.round((100 * s.fortnightTotal.c) / s.fortnightTotal.a)}%` : ''}</p></div>

    <h2>How you're doing</h2>
    <div class="card stat-list">
      ${row('Recent accuracy <small>(last 40 answers)</small>', s.recentAcc == null ? '–' : s.recentAcc + '%')}
      ${s.strongest ? row('Strongest theme', `${themeIcon(s.strongest.t)} ${esc(s.strongest.t.name)} · ${s.strongest.pct}%`) : ''}
      ${s.weakest ? row('Most room to grow', `${themeIcon(s.weakest.t)} ${esc(s.weakest.t.name)} · ${s.weakest.pct}%`) : ''}
    </div>
    ${hasDiff ? `<div class="card meters-card"><span class="small dim">By difficulty</span>
      ${[1, 2, 3].map((d) => meter(DIFF_LABEL[d], st.byDiff?.[d], ['var(--green)', 'var(--yellow)', 'var(--pink)'][d - 1])).join('')}</div>` : ''}
    ${kinds.length ? `<div class="card meters-card"><span class="small dim">By question type</span>
      ${kinds.map((k) => meter(KIND_LABEL[k], st.byKind[k], 'var(--lav)')).join('')}</div>` : ''}

    <h2>Speed and habits</h2>
    <div class="card stat-list">
      ${row('Average answer time', secs(s.avgSec))}
      ${row('Fastest right answer', secs(s.fastestSec))}
      ${row('Time spent quizzing', s.minutes >= 60 ? `${Math.floor(s.minutes / 60)} h ${s.minutes % 60} min` : `${s.minutes} min`)}
      ${row('Days played', s.daysPlayed)}
      ${s.bestDay ? row('Best day', `${day(s.bestDay.day)} · ${s.bestDay.c} right`) : ''}
      ${row(`${DAILY.emoji} Daily Bytes`, `${s.dailies}${s.perfectDailies ? ` · ${s.perfectDailies} perfect` : ''}`)}
      ${row("Byte's challenges won", `${s.challenges.won} / ${s.challenges.played}`)}
      ${row('🔁 Brush up', `${st.mastered || 0} mastered · ${save.review.length} waiting`)}
    </div>

    <h2>Home and Byte</h2>
    <div class="card stat-list">
      ${row('Home level', `${lv.index + 1} · ${esc(lv.level.name)}`)}
      ${row('Furniture', `${s.furniture} / ${s.furnitureTotal}`)}
      ${row('Friendship with Byte', `${s.hearts} / 5 ♥`)}
      ${row(`${icon('fish')} Fish earned`, st.fishEarned)}
      ${row(`${icon('fish')} Fish spent`, st.fishSpent || 0)}
    </div>

    <h2>Explain it</h2>
    <div class="card stat-list">
      ${row('Prompts tried', ex.tried)}
      ${row('Average key points hit', ex.pct == null ? '–' : ex.pct + '%')}
      ${row('Your own marks', `${ex.marks.nailed} nailed · ${ex.marks.mostly} mostly · ${ex.marks.needs} needs work`)}
      ${row('Needs work in', ex.needsThemes.length ? ex.needsThemes.map((t) => `${themeIcon(t)} ${esc(t.name)}`).join(', ') : '–')}
    </div>

    <h2>By theme</h2>
    <div class="card themes-card">${themes}</div>
    <h2>Recent mistakes</h2>
    ${mistakes ? `<div class="card">${mistakes}</div>` : '<p class="dim">No mistakes yet. Suspiciously clever!</p>'}`;

  const tip = root.querySelector('.fc-tip');
  root.querySelectorAll('.fc-col').forEach((b) => (b.onclick = () => {
    const d = s.fortnight[+b.dataset.i];
    root.querySelectorAll('.fc-col').forEach((x) => x.classList.toggle('on', x === b));
    tip.textContent = d.a ? `${d.label}: ${d.a} answered, ${d.c} right (${Math.round((100 * d.c) / d.a)}%)` : `${d.label}: no questions`;
  }));
}
