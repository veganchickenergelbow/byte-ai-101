// Theme picker: one big card per theme, plus the AI 101 Mix, and how many questions a round has.
import { app, go, persist } from '../app.js';
import { ROUND_SIZES, ROUND_SIZE } from '../core/round.js';
import { esc, themeIcon } from '../ui.js';
import { sfx } from '../audio.js';

let explainTheme = 'all';   // the Explain it theme filter (this visit only, not saved)

export function render(root) {
  const { themes, bank } = app.content;
  const s = app.save;
  const st = s.stats;
  const size = s.settings.roundSize || ROUND_SIZE;
  const totals = themes.filter((t) => t.id !== 'mix').map((t) => bank.filter((q) => q.category === t.id).length);
  // a themed round never has more questions than its theme holds, so say so when the chosen length is longer
  const noteFor = (n) => (totals.length && n > Math.min(...totals)
    ? `A themed round has at most as many questions as its theme (${Math.min(...totals)} to ${Math.max(...totals)}), so it plays them all once. The AI 101 Mix goes up to ${n}.` : '');
  const cards = themes.map((t) => {
    const total = t.id === 'mix' ? bank.length : bank.filter((q) => q.category === t.id).length;
    const th = t.id === 'mix' ? { answered: st.answered, correct: st.correct } : st.themes[t.id] || { answered: 0, correct: 0 };
    const acc = th.answered ? Math.round((100 * th.correct) / th.answered) + '% right' : 'New!';
    return `<button class="theme-card ${t.id === 'mix' ? 'wide' : ''}" data-t="${t.id}" style="--c:${t.color};--cd:${t.dark}">
      <span class="theme-ico">${themeIcon(t)}</span>
      <span class="theme-name">${esc(t.name)}</span>
      <span class="theme-blurb">${esc(t.blurb)}</span>
      <span class="theme-meta">${total} questions · ${acc}</span>
    </button>`;
  }).join('');
  const review = s.review.filter((id) => !s.retired.includes(id) && app.content.bank.some((q) => q.id === id)).length;
  root.innerHTML = `<div class="row"><button class="icon-btn" data-back aria-label="Back">←</button><h1 class="title">Pick a theme</h1></div>
    <div class="row seg-row"><span class="small dim">Questions per round</span><div class="spacer"></div>
      <div class="seg">${ROUND_SIZES.map((n) => `<button data-n="${n}" class="${n === size ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <p class="small dim round-note">${esc(noteFor(size))}</p>
    <button class="brush-up ${review ? '' : 'empty'}" data-review ${review ? '' : 'disabled'}>
      <span class="act-ico">🔁</span><span class="grow"><b>Brush up</b>
      <span class="small dim">${review ? `${review} question${review === 1 ? '' : 's'} you got wrong. Get them right to clear them!` : 'Nothing to brush up. Questions you get wrong will wait here.'}</span></span></button>
    ${explainCard()}
    <div class="theme-grid">${cards}</div>`;
  root.querySelector('[data-back]').onclick = () => { sfx('tap'); go('home'); };
  root.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => {
    sfx('select');
    s.settings.roundSize = +b.dataset.n;
    persist();
    root.querySelectorAll('[data-n]').forEach((x) => x.classList.toggle('on', x === b));
    root.querySelector('.round-note').textContent = noteFor(+b.dataset.n);
  }));
  wireExplain(root);
  root.querySelector('[data-review]').onclick = () => { sfx('tap'); go('quiz', { mode: 'review' }); };
  root.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { sfx('tap'); go('quiz', { theme: b.dataset.t }); }));
}

const explainBlurb = (n) => `Say it in your own words, 3 prompts a go. Byte checks your key points, then you mark yourself. (${n} prompt${n === 1 ? '' : 's'})`;
const explainCount = () => app.content.explain.filter((i) => explainTheme === 'all' || i.theme === explainTheme).length;

/** The Explain it card (styled like Brush up) and its theme chips. Disabled when data/explain.json has nothing in it. */
function explainCard() {
  const items = app.content.explain || [];
  if (!items.length) {
    return `<button class="brush-up explain-card empty" disabled><span class="act-ico">💬</span><span class="grow"><b>Explain it</b>
      <span class="small dim">Explain prompts are on their way. Come back soon.</span></span></button>`;
  }
  const themes = app.content.themes.filter((t) => t.id !== 'mix');
  if (explainTheme !== 'all' && !items.some((i) => i.theme === explainTheme)) explainTheme = 'all';
  const chip = (id, label, count) => `<button class="fchip ${id === explainTheme ? 'on' : ''}" data-ex="${id}" ${count ? '' : 'disabled'}>${label}</button>`;
  return `<button class="brush-up explain-card" data-explain><span class="act-ico">💬</span><span class="grow"><b>Explain it</b>
      <span class="small dim">${explainBlurb(explainCount())}</span></span></button>
    <div class="fchips" role="group" aria-label="Explain it themes">${chip('all', 'All', items.length)}${themes.map((t) => chip(t.id, `${themeIcon(t)} ${esc(t.name)}`, items.filter((i) => i.theme === t.id).length)).join('')}</div>`;
}

function wireExplain(root) {
  root.querySelector('[data-explain]')?.addEventListener('click', () => { sfx('tap'); go('explain', { theme: explainTheme }); });
  root.querySelectorAll('[data-ex]').forEach((b) => (b.onclick = () => {
    sfx('select');
    explainTheme = b.dataset.ex;
    root.querySelectorAll('[data-ex]').forEach((x) => x.classList.toggle('on', x === b));
    root.querySelector('[data-explain] .small').textContent = explainBlurb(explainCount());
  }));
}
