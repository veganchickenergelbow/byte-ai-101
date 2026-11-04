// Explain it: write (or dictate) an explanation, Byte checks it for key points on the device, you read the model answer and mark yourself.
// params: { theme } the theme filter ('all' or a theme id). Typed text lives only in this closure while a prompt is open and is
// cleared when the result shows or the screen closes: it is never put in the save, the stats, a URL or the network.
import { app, go, persist, themeById, byteCat } from '../app.js';
import { EXPLAIN, MARKS, MARK_LABEL, pickSession, scoreAnswer, wordCount, recordTry, finishPrompt } from '../core/explain.js';
import { esc, icon, themeIcon, catArt, confirmDialog } from '../ui.js';
import { sfx } from '../audio.js';

const HINT = 'Try: plain definition, example, limitation, why it matters. Dictation works too.';
const TOO_SHORT = 'Give it a bit more: aim for a few sentences.';
const NOTE = 'Key-point matching can miss good wording, so trust your own read.';
const MARK_BTN = { nailed: '', mostly: 'sky', needs: 'pink' };

export function render(root, params = {}) {
  const save = app.save;
  const items = app.content.explain || [];
  const qs = pickSession(items, save.explain, { theme: params.theme });
  if (!qs.length) { go('themes'); return null; }
  const buddy = byteCat();
  const run = { i: 0, prompts: 0, points: 0, fish: 0, started: false };
  let typed = '';   // the current answer, in memory only

  const header = () => {
    const q = qs[run.i];
    const t = themeById(q.theme) || themeById('mix');
    return `<div class="quiz-top row">
        <button class="icon-btn" data-quit aria-label="Leave Explain it">✕</button>
        <div class="bar grow" style="--c:var(--mint)"><i style="width:${(100 * run.i) / qs.length}%"></i></div>
      </div>
      <p class="mode-label">💬 Explain it</p>
      <div class="row quiz-meta">
        <span class="chip on-color" style="--c:${t.color}">${themeIcon(t)} ${esc(t.name)}</span>
        <span class="dots" title="Difficulty">${[1, 2, 3].map((d) => `<i class="${d <= (q.difficulty || 2) ? 'on' : ''}"></i>`).join('')}</span>
        <div class="spacer"></div><span class="small dim">${run.i + 1} / ${qs.length}</span>
      </div>
      <div class="ask">
        <div class="buddy">${catArt(buddy, 'idle')}</div>
        <div class="bubble">${esc(q.prompt)}</div>
      </div>`;
  };

  const wireQuit = () => { root.querySelector('[data-quit]').onclick = quit; };

  const drawWrite = () => {
    typed = '';
    root.scrollTop = 0;
    root.innerHTML = `${header()}
      <textarea class="explain-text" rows="7" placeholder="Type or dictate your explanation here" aria-label="Your explanation"></textarea>
      <div class="row explain-meta"><span class="small dim" data-count>0 words</span><div class="spacer"></div></div>
      <p class="small dim explain-hint">${esc(HINT)}</p>
      <p class="small explain-warn" data-warn role="status" hidden>${esc(TOO_SHORT)}</p>
      <div class="explain-foot">
        <button class="btn block big" data-check disabled>Check</button>
        <button class="btn block ghost" data-show>Show me the answer</button>
      </div>`;
    wireQuit();
    const ta = root.querySelector('.explain-text');
    const count = root.querySelector('[data-count]');
    const check = root.querySelector('[data-check]');
    const warn = root.querySelector('[data-warn]');
    ta.oninput = () => {
      typed = ta.value;
      const n = wordCount(typed);
      count.textContent = `${n} word${n === 1 ? '' : 's'}`;
      check.disabled = n === 0;
      warn.hidden = true;
    };
    check.onclick = () => {
      const q = qs[run.i];
      const res = scoreAnswer(q, typed);
      if (!res.scored) { sfx('wrong'); warn.hidden = false; return; }   // too short: nothing counts, nothing is spent
      sfx('select');
      ta.value = ''; typed = '';
      drawResult(q, res);
    };
    root.querySelector('[data-show]').onclick = () => {
      sfx('tap');
      ta.value = ''; typed = '';
      drawResult(qs[run.i], scoreAnswer(qs[run.i], ''));   // an unscored result: no key points, no fish
    };
  };

  const drawResult = (q, res) => {
    run.started = true;
    recordTry(save, q, res);   // only now has the prompt been checked or revealed, so only now is it a try
    persist();
    const pts = q.points.map((p, k) => `<li class="${res.scored ? (res.hits[k] ? 'hit' : 'miss') : ''}">
        <span class="pt-ico">${res.scored ? (res.hits[k] ? icon('check') : '➖') : '•'}</span><span>${esc(p.label)}</span></li>`).join('');
    const head = res.scored ? `${res.hit} of ${res.total} key points` : 'Here is a model answer';
    root.scrollTop = 0;
    root.innerHTML = `${header()}
      <div class="card explain-result">
        <h2>${esc(head)}</h2>
        ${res.scored ? '' : '<p class="small dim">Nothing is scored this time, so no fish. That is fine: read it, then mark yourself.</p>'}
        <ul class="explain-points">${pts}</ul>
        <div class="fb-factbox"><span class="fb-label">💡 Model answer</span><p class="fb-fact">${esc(q.model)}</p></div>
        <p class="small dim">${esc(NOTE)}</p>
      </div>
      <p class="mode-label">How did you do, really?</p>
      <div class="explain-marks">${MARKS.map((m) => `<button class="btn block ${MARK_BTN[m]}" data-mark="${m}">${MARK_LABEL[m]}</button>`).join('')}</div>`;
    wireQuit();
    root.querySelectorAll('[data-mark]').forEach((b) => (b.onclick = () => mark(q, res, b.dataset.mark)));
  };

  const mark = (q, res, m) => {
    root.querySelectorAll('[data-mark]').forEach((b) => (b.disabled = true));   // one tap only
    sfx('tap');
    const r = finishPrompt(save, q, res, m);
    persist();
    run.prompts++; run.fish += r.fish; run.points += res.scored ? res.hit : 0; run.started = false;
    if (r.fish) sfx('coin');
    if (run.i < qs.length - 1) { run.i++; drawWrite(); return; }
    drawDone();
  };

  const drawDone = () => {
    root.scrollTop = 0;
    root.innerHTML = `<div class="results-hero">
        <div class="hero-cat cheer">${catArt(buddy, 'happy')}</div>
        <h1 class="title center">Nicely explained!</h1>
        <p class="center dim">${esc(buddy.name)} liked hearing that. Saying it out loud is the best practice for the real round.</p>
      </div>
      <div class="tiles">
        <div class="tile" style="--c:var(--green)"><b>${run.points}</b><span>Key points</span></div>
        <div class="tile" style="--c:var(--yellow)"><b>+${run.fish}</b><span>${icon('fish')} Fish</span></div>
        <div class="tile" style="--c:var(--lav)"><b>${run.prompts}</b><span>Prompts</span></div>
      </div>
      <div class="results-actions"><button class="btn block big" data-again>Explain more</button>
        <button class="btn block ghost" data-home>Back to themes</button></div>`;
    root.querySelector('[data-again]').onclick = () => { sfx('tap'); go('explain', params); };
    root.querySelector('[data-home]').onclick = () => { sfx('tap'); go('themes'); };
  };

  const quit = async () => {
    sfx('tap');
    const ta = root.querySelector('.explain-text');
    if (run.i === 0 && !run.started && !(ta && ta.value)) { go('themes'); return; }
    if (await confirmDialog('Leave Explain it?', 'Nothing more is scored for this prompt. Prompts you already marked still count.', 'Leave', 'Keep going')) go('themes');
  };

  drawWrite();
  return () => { typed = ''; const ta = root.querySelector('.explain-text'); if (ta) ta.value = ''; };
}
