// End of a round: score, fish breakdown, day streak and home progress, then a new friendship heart and any level-up.
import { app, go, byteCat, themeById } from '../app.js';
import { esc, icon, themeIcon, catArt, openSheet } from '../ui.js';
import { sfx } from '../audio.js';
import { levelCard } from './home.js';
import { heartProgress, unlockedAccessories } from '../core/bonds.js';
import { weekDays, DAILY } from '../core/modes.js';

export function render(root, r) {
  const buddy = byteCat();
  const t = themeById(r.theme);
  const title = r.perfect ? 'Purrfect round!' : r.correct >= r.total * 0.7 ? 'Great round!' : r.correct >= r.total * 0.4 ? 'Nice work!' : 'Every question counts!';
  const daily = r.daily, ch = r.challenge;
  const total = r.fish + r.bonus + r.cosy + (daily ? daily.fish + daily.weekBonus : 0) + (ch ? ch.fish : 0);
  const hp = heartProgress(app.save.bonds[buddy.id]);
  const again = r.mode === 'review' ? (app.save.review.length ? '🔁 Brush up again' : '')
    : r.mode ? '' : `${t ? themeIcon(t) + ' ' : ''}Play again`;
  root.innerHTML = `
    <div class="results-hero">
      <div class="hero-cat cheer">${catArt(buddy, 'happy')}</div>
      <h1 class="title center">${title}</h1>
      <p class="center dim">${ch ? (ch.won ? `You beat ${esc(buddy.name)}'s challenge!` : `${esc(buddy.name)} says: so close! Try again tomorrow.`) : `${esc(buddy.name)} is very proud of you. Read back over the facts to make them stick.`}</p>
    </div>
    <div class="tiles">
      <div class="tile" style="--c:var(--green)"><b>${r.correct}/${r.total}</b><span>Correct</span></div>
      <div class="tile" style="--c:var(--yellow)"><b>+${total}</b><span>${icon('fish')} Fish</span></div>
      <div class="tile" style="--c:var(--pink)"><b>${r.dayStreak}</b><span>${icon('flame')} Day streak</span></div>
    </div>
    <div class="card breakdown">
      <div class="row"><span>Right answers</span><div class="spacer"></div><b>+${r.fish} ${icon('fish')}</b></div>
      <div class="row"><span>Round bonus</span><div class="spacer"></div><b>+${r.roundBonus} ${icon('fish')}</b></div>
      ${r.perfect ? `<div class="row"><span>Perfect round!</span><div class="spacer"></div><b>+${r.perfectBonus} ${icon('fish')}</b></div>` : ''}
      ${r.cosy ? `<div class="row"><span>Cosy Byte (favourite in the room)</span><div class="spacer"></div><b>+${r.cosy} ${icon('fish')}</b></div>` : ''}
      ${daily && daily.fish ? `<div class="row"><span>${DAILY.emoji} Daily Byte</span><div class="spacer"></div><b>+${daily.fish} ${icon('fish')}</b></div>` : ''}
      ${daily && daily.weekBonus ? `<div class="row"><span>A full week of stamps!</span><div class="spacer"></div><b>+${daily.weekBonus} ${icon('fish')}</b></div>` : ''}
      ${ch && ch.won ? `<div class="row"><span>Challenge won</span><div class="spacer"></div><b>+${ch.fish} ${icon('fish')}</b></div>` : ''}
      ${r.bestStreak >= 3 ? `<div class="row dim"><span>Best run this round</span><div class="spacer"></div><b>${r.bestStreak} in a row</b></div>` : ''}
    </div>
    ${daily ? `<div class="card stamps"><span class="small dim">This week's Daily Bytes</span>
      <div class="stamp-row">${weekDays(app.save).map((d) => `<span class="stamp ${d.done ? 'on' : ''}"><i>${d.done ? DAILY.emoji : ''}</i>${d.label}</span>`).join('')}</div>
      <span class="small dim">Seven in a week earns ${DAILY.weekBonus} bonus fish.</span></div>` : ''}
    <div class="card bond-card row"><div class="bond-pic">${catArt(buddy, 'idle')}</div>
      <div class="grow"><b>${esc(buddy.name)}</b> <span class="hearts">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= hp.hearts ? 'on' : ''}">♥</i>`).join('')}</span>
        <div class="bar" style="--c:var(--pink)"><i style="width:${hp.need ? (100 * hp.have) / hp.need : 100}%"></i></div>
        <span class="small dim">${hp.need ? `${hp.need - hp.have} more right answers together for the next heart` : 'Best friends forever!'}</span></div></div>
    ${levelCard()}
    <div class="spacer"></div>
    <button class="btn big block" data-home>Continue</button>
    ${again ? `<button class="btn ghost block" data-again>${again}</button>` : ''}`;
  sfx('done');
  root.querySelector('[data-home]').onclick = () => { sfx('tap'); go('home'); };
  root.querySelector('[data-again]')?.addEventListener('click', () => { sfx('tap'); go('quiz', r.mode ? { mode: r.mode } : { theme: r.theme }); });
  // celebrations, one after another: a new heart, then a home level
  const queue = [];
  if (r.hearts) queue.push((done) => heartUp(buddy, r.hearts, done));
  if (r.levelUp != null) queue.push((done) => levelUp(r.levelUp, done));
  const nextUp = () => { const f = queue.shift(); if (f && app.current === 'results') f(nextUp); };
  setTimeout(nextUp, 700);
}

/** A new friendship heart, and the accessory it unlocks. */
function heartUp(cat, hearts, onDone) {
  const acc = unlockedAccessories(app.save, cat.id, app.content.accessories).find((a) => a.hearts === hearts);
  sfx('done');
  openSheet((sh, close) => {
    sh.innerHTML = `<div class="hero-cat cheer">${catArt(cat, 'happy')}</div>
      <h2 class="center">${esc(cat.name)} loves you a little more</h2>
      <p class="center hearts big">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= hearts ? 'on' : ''}">♥</i>`).join('')}</p>
      ${acc ? `<p class="center">Unlocked: <b>${acc.emoji} ${esc(acc.name)}</b>. Dress ${esc(cat.name)} up in the Byte tab!</p>` : ''}
      <button class="btn block">Aww!</button>`;
    sh.querySelector('.btn').onclick = () => { sfx('tap'); close(); };
  }, { center: true, onClose: onDone });
}

/** "Your home grew!": the new level, and what it unlocks (furniture and window views). */
function levelUp(index, onDone) {
  const home = app.content.home, n = index + 1;
  const items = home.items.filter((it) => it.level === n).map((it) => it.name);
  const views = home.windows.filter((w) => w.level === n).map((w) => w.name + ' window view');
  const areas = (home.areas || []).filter((a) => a.level === n).map((a) => `The ${a.name.toLowerCase()} is open!`);
  const news = [...areas, ...items, ...views];
  sfx('done');
  openSheet((sh, close) => {
    sh.innerHTML = `<div class="lv-big">${n}</div>
      <h2 class="center">Your home grew!</h2>
      <p class="center">Welcome to <b>${esc(home.levels[index].name)}</b>.</p>
      ${news.length ? `<div class="card"><span class="small dim">New in the shop</span>${news.map((x) => `<p>✨ ${esc(x)}</p>`).join('')}</div>` : ''}
      <button class="btn block">Lovely!</button>`;
    sh.querySelector('.btn').onclick = () => { sfx('tap'); close(); };
  }, { center: true, onClose: onDone });
}
