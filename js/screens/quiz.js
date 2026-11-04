// A round: pick an answer (or tap events in order), CHECK, see if you were right (with a fun fact), CONTINUE.
// params: { theme } for a normal round (with the odd "Which came first?" / "Higher or lower"), or
//         { mode: 'daily' } Daily Byte · { mode: 'review' } Brush up · { mode: 'challenge' } today's challenge from Byte.
import { app, go, persist, themeById, byteCat } from '../app.js';
import { pickRound, markSeen, mixFor, ROUND_SIZE } from '../core/round.js';
import { recordAnswer, finishRound, retireQuestion, dayKey } from '../core/progress.js';
import { dailyRound, reviewRound, challengeRound, todaysChallenge, finishDaily, CHALLENGE, DAILY } from '../core/modes.js';
import { addSpecials, orderIsRight } from '../core/specials.js';
import { addBond } from '../core/bonds.js';
import { esc, el, icon, themeIcon, catArt, confirmDialog } from '../ui.js';
import { sfx } from '../audio.js';

const PRAISE = ['Nice one!', 'Purrfect!', 'Byte approves!', 'You got it!', 'Spot on!', 'Pawsome!', 'Well reasoned!'];
const OOPS = ['Not quite', 'Close, but no fish', 'Oops!', 'So close!'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const LETTERS = 'ABCD';

/** The questions and the label for this way of playing. */
function buildRound(params, save) {
  const hidden = new Set(save.retired);
  const bank = hidden.size ? app.content.bank.filter((q) => !hidden.has(q.id)) : app.content.bank;
  const today = dayKey(new Date());
  if (params.mode === 'daily') return { qs: dailyRound(bank, today, app.content.themeIds), label: `${DAILY.emoji} Daily Byte`, day: today };
  if (params.mode === 'review') return { qs: reviewRound(bank, save.review), label: '🔁 Brush up' };
  if (params.mode === 'challenge') {
    const ch = todaysChallenge(save, app.content.cats, today, app.content.themeIds);
    const cat = byteCat();
    return { qs: challengeRound(bank, ch.theme), label: `${esc(cat.name)}'s challenge: ${esc(themeById(ch.theme).name)}`, challenge: ch };
  }
  const theme = themeById(params.theme) ? params.theme : 'mix';
  save.lastTheme = theme;
  const n = save.settings.roundSize || ROUND_SIZE;
  const qs = pickRound(bank, theme, save.seen, Math.random, n, mixFor(save.stats.recent, n));
  return { qs: addSpecials(qs, theme, app.content.specials), theme };
}

export function render(root, params) {
  const save = app.save;
  const round = buildRound(params, save);
  const { qs } = round;
  persist();   // today's challenge (and a refilled seen list) moved on
  if (!qs.length) { go('home'); return null; }

  const buddy = byteCat();
  const run = { i: 0, streak: 0, correct: 0, fish: 0, bestStreak: 0, chosen: -1, tapped: [], checked: false, hearts: null };

  const removeFeedback = () => document.querySelectorAll('.feedback').forEach((f) => f.remove());

  const draw = () => {
    removeFeedback();
    const q = qs[run.i];
    const qt = themeById(q.category) || themeById('mix');
    const tag = q.kind === 'order' ? '<span class="chip special">⏳ Which came first?</span>'
      : q.kind === 'compare' ? '<span class="chip special">⚖️ Higher or lower</span>' : '';
    const answers = q.type === 'order'
      ? `<div class="opts order">${q.items.map((name) => `<button class="opt" data-name="${esc(name)}"><span class="key"></span><span>${esc(name)}</span></button>`).join('')}</div>`
      : `<div class="opts">${q.answers.map((a, i) => `<button class="opt" data-i="${i}"><span class="key">${LETTERS[i]}</span><span>${esc(a)}</span></button>`).join('')}</div>`;
    root.innerHTML = `
      <div class="quiz-top row">
        <button class="icon-btn" data-quit aria-label="Leave round">✕</button>
        <div class="bar grow" style="--c:var(--mint)"><i style="width:${(100 * run.i) / qs.length}%"></i></div>
        <span class="streak ${run.streak >= 2 ? 'on' : ''}">${icon('flame')} ${run.streak}</span>
      </div>
      ${round.label ? `<p class="mode-label">${round.label}</p>` : ''}
      <div class="row quiz-meta">
        <span class="chip on-color" style="--c:${qt.color}">${themeIcon(qt)} ${esc(qt.name)}</span>${tag}
        <span class="dots" title="Difficulty">${[1, 2, 3].map((d) => `<i class="${d <= (q.difficulty || 2) ? 'on' : ''}"></i>`).join('')}</span>
        <div class="spacer"></div><span class="small dim">${run.i + 1} / ${qs.length}</span>
      </div>
      <div class="ask">
        <div class="buddy">${catArt(buddy, 'idle')}</div>
        <div class="bubble">${esc(q.question)}</div>
      </div>
      ${answers}
      <div class="quiz-foot"><button class="btn block big" data-check disabled>Check</button></div>`;
    run.chosen = -1; run.tapped = []; run.checked = false; run.shownAt = performance.now();
    root.querySelector('[data-quit]').onclick = quit;
    if (q.type === 'order') root.querySelectorAll('.opt').forEach((b) => (b.onclick = () => tapOrder(b.dataset.name)));
    else root.querySelectorAll('.opt').forEach((b) => (b.onclick = () => choose(+b.dataset.i)));
    root.querySelector('[data-check]').onclick = check;
  };

  const choose = (i) => {
    if (run.checked) return;
    sfx('select');
    run.chosen = i;
    root.querySelectorAll('.opt').forEach((b) => b.classList.toggle('sel', +b.dataset.i === i));
    root.querySelector('[data-check]').disabled = false;
  };

  /** Order questions: tap events oldest first; tapping a numbered one takes it (and anything after it) back. */
  const tapOrder = (name) => {
    if (run.checked) return;
    sfx('select');
    const at = run.tapped.indexOf(name);
    if (at >= 0) run.tapped.splice(at);
    else run.tapped.push(name);
    root.querySelectorAll('.opt').forEach((b) => {
      const k = run.tapped.indexOf(b.dataset.name);
      b.classList.toggle('sel', k >= 0);
      b.querySelector('.key').textContent = k >= 0 ? k + 1 : '';
    });
    root.querySelector('[data-check]').disabled = run.tapped.length !== qs[run.i].items.length;
  };

  const check = () => {
    if (run.checked) return;
    const q = qs[run.i];
    let ok;
    if (q.type === 'order') {
      if (run.tapped.length !== q.items.length) return;
      ok = orderIsRight(q, run.tapped);
      // record it like a two-option question: "the right order" vs "your order" (for the mistakes list)
      q.answers = [q.order.join(' → '), run.tapped.join(' → ')];
      q.correct = 0;
      run.chosen = ok ? 0 : 1;
    } else {
      if (run.chosen < 0) return;
      ok = run.chosen === q.correct;
    }
    run.checked = true;
    const r = recordAnswer(save, q, run.chosen, run.streak, performance.now() - run.shownAt);
    if (!q.special) markSeen(save.seen, q);   // only answered questions use one up
    run.streak = r.streak; run.bestStreak = Math.max(run.bestStreak, r.streak);
    if (ok) {
      run.correct++; run.fish += r.fish;
      run.hearts = addBond(save, buddy.id, 1) ?? run.hearts;   // every right answer grows the friendship with Byte
    }
    persist();
    sfx(ok ? 'right' : 'wrong');
    if (ok) setTimeout(() => sfx('coin'), 260);

    root.querySelectorAll('.opt').forEach((b) => {
      b.disabled = true;
      if (q.type === 'order') {
        const k = q.order.indexOf(b.dataset.name);
        b.querySelector('.key').textContent = k + 1;           // show the true order
        b.classList.add(run.tapped[k] === b.dataset.name ? 'right' : 'wrong');
      } else {
        const i = +b.dataset.i;
        if (i === q.correct) b.classList.add('right');
        else if (i === run.chosen) b.classList.add('wrong');
      }
    });
    const bud = root.querySelector('.buddy');
    bud.innerHTML = catArt(buddy, ok ? 'happy' : 'idle');
    bud.classList.add(ok ? 'cheer' : 'shake');
    const st = root.querySelector('.streak');
    st.className = 'streak' + (run.streak >= 2 ? ' on' : '');
    st.innerHTML = `${icon('flame')} ${run.streak}`;
    root.querySelector('.bar > i').style.width = (100 * (run.i + 1)) / qs.length + '%';

    const last = run.i === qs.length - 1;
    const rightText = q.type === 'order' ? q.order.join(' → ') : q.answers[q.correct];
    const fb = el(`<div class="feedback ${ok ? 'good' : 'bad'}" role="status">
      <div class="fb-body">
        <div class="row"><span class="fb-ico">${icon(ok ? 'check' : 'cross')}</span><h3>${ok ? pick(PRAISE) : pick(OOPS)}</h3>
          <div class="spacer"></div>${ok ? `<span class="fb-fish">+${r.fish} ${icon('fish')}</span>` : ''}</div>
        ${ok || q.type === 'order' ? '' : `<p class="fb-right">Answer: <b>${esc(rightText)}</b></p>`}
        ${q.fact ? `<div class="fb-factbox"><span class="fb-label">💡 Good to know</span><p class="fb-fact">${esc(q.fact)}</p></div>` : ''}
        ${ok && !q.special ? '<button class="too-easy" data-easy>Too easy? Hide this one for good</button>' : ''}
      </div>
      <button class="btn block big ${ok ? '' : 'red'}" data-next>${last ? 'Finish' : 'Continue'}</button>
    </div>`);
    // the panel sits over the bottom of the app; the emptied footer keeps the options scrollable above it
    document.getElementById('app').appendChild(fb);
    const foot = root.querySelector('.quiz-foot');
    foot.innerHTML = '';
    foot.style.height = fb.offsetHeight + 'px';
    fb.querySelector('[data-next]').onclick = next;
    const easy = fb.querySelector('[data-easy]');
    if (easy) easy.onclick = () => {
      sfx('select');
      retireQuestion(save, q.id);
      persist();
      easy.outerHTML = '<p class="too-easy done">Got it, you won\'t see that one again.</p>';
      foot.style.height = fb.offsetHeight + 'px';
    };
  };

  const next = () => {
    sfx('tap');
    if (run.i < qs.length - 1) { run.i++; draw(); return; }
    const res = finishRound(save, { correct: run.correct, total: qs.length }, app.content);
    const extra = {};
    if (round.day) extra.daily = finishDaily(save, round.day, run.correct, qs.length);
    if (round.challenge) {
      const won = run.correct === qs.length;
      Object.assign(round.challenge, { done: true, won });
      const cs = (save.stats.challenges ||= { played: 0, won: 0 });
      cs.played++; if (won) cs.won++;
      extra.challenge = { won, fish: won ? CHALLENGE.winFish : 0 };
      if (won) { save.fish += CHALLENGE.winFish; save.stats.fishEarned += CHALLENGE.winFish; }
      run.hearts = addBond(save, buddy.id, won ? CHALLENGE.winBond : CHALLENGE.tryBond) ?? run.hearts;
    }
    persist();
    go('results', {
      ...res, ...extra, correct: run.correct, total: qs.length, fish: run.fish, bestStreak: run.bestStreak,
      theme: round.theme, mode: params.mode || null, hearts: run.hearts,
    });
  };

  const quit = async () => {
    sfx('tap');
    if (run.i === 0 && !run.checked) { go('home'); return; }
    if (await confirmDialog('Leave this round?', 'Your answers so far still count, but you will miss the end-of-round bonus.', 'Leave', 'Keep playing')) go('home');
  };

  const onKey = (e) => {   // handy on desktop: 1-4 / A-D to pick, Enter to check or continue
    const q = qs[run.i];
    const k = e.key.toUpperCase();
    const i = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : LETTERS.indexOf(k);
    if (i >= 0 && q.type !== 'order' && i < q.answers.length) choose(i);
    else if (e.key === 'Enter') (document.querySelector('.feedback [data-next]') || root.querySelector('[data-check]:not(:disabled)'))?.click();
  };
  document.addEventListener('keydown', onKey);

  draw();
  return () => { document.removeEventListener('keydown', onKey); removeFeedback(); };
}
