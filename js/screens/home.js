// Home: Byte's live room, your home level, decorating, and the big Play button.
import { app, go, persist, themeById, resetSave, byteCat } from '../app.js';
import { dayKey } from '../core/progress.js';
import { todaysChallenge, weekDays, DAILY, CHALLENGE } from '../core/modes.js';
import { makeCode, readCode, daysSinceBackup, BACKUP_NUDGE_DAYS } from '../core/backup.js';
import { levelFor, storeItem, unstoreItem, itemById } from '../core/home.js';
import { esc, icon, themeIcon, catArt, openSheet, confirmDialog, toast } from '../ui.js';
import { audio, sfx, MUSIC_STYLES } from '../audio.js';
import { openShop, openWindows } from './shop.js';
import { Room } from '../room.js';

export function header() {
  const s = app.save;
  return `<div class="topbar row">
    <div class="brand">Byte's <b>AI 101</b></div>
    <div class="spacer"></div>
    <span class="pill" title="Fish treats"><span class="ico">${icon('fish')}</span><span data-fish>${s.fish}</span></span>
    <span class="pill ${s.stats.dayStreak ? '' : 'off'}" title="Day streak"><span class="ico">${icon('flame')}</span>${s.stats.dayStreak}</span>
  </div>`;
}

/** Home level card: where you are and how many right answers until the next level. */
export function levelCard() {
  const lv = levelFor(app.save.stats.correct, app.content.home.levels);
  const pct = lv.next ? Math.round((100 * lv.have) / lv.need) : 100;
  return `<div class="level-card">
    <div class="row"><span class="lv-badge">${lv.index + 1}</span><b>${esc(lv.level.name)}</b><div class="spacer"></div>
      <span class="small dim">${lv.next ? `Next: ${esc(lv.next.name)}` : 'Top level!'}</span></div>
    <div class="bar" style="--c:var(--yellow)"><i style="width:${pct}%"></i></div>
    <span class="small dim">${lv.next ? `${lv.need - lv.have} more right answers` : 'Dream home! Well done!'}</span></div>`;
}

/** One gentle line under the room: what to do next. */
function nudge() {
  const s = app.save, byte = byteCat(), home = app.content.home;
  const fav = itemById(home, byte.favourite);
  if (s.stats.answered === 0) return "Right answers earn fish. Spend them on furniture for Byte's room.";
  if (s.stats.rounds >= 5 && daysSinceBackup(s) > BACKUP_NUDGE_DAYS) return 'Keep Byte safe: save a backup code in Settings.';
  if (fav && !s.home.owned.includes(fav.id)) return `Byte would love the ${esc(fav.name.toLowerCase())}. It's in the shop.`;
  return 'Tap Byte to say hello.';
}

/** Show the "Add to Home Screen" tip: on iOS, in a plain tab, after a first round, until dismissed. */
function installHint() {
  if (app.save.hints.install || app.save.stats.rounds < 1) return false;
  if (navigator.standalone === true || matchMedia('(display-mode: standalone)').matches) return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1);
}

/** Which areas are open (the balcony needs its art and its home level). */
function openAreas() {
  const lv = levelFor(app.save.stats.correct, app.content.home.levels).index;
  return (app.content.home.areas || [{ id: 'room', name: 'Living room' }]).filter((a) => !a.level || a.level - 1 <= lv);
}

/** Who is in the area being shown: Byte, wherever you are looking (the living room, or the balcony once it is open). */
function catsIn() {
  return app.content.cats.filter((c) => app.save.cats[c.id]);
}

/** The Daily Byte and today's challenge from Byte. */
function activities() {
  const s = app.save, today = dayKey(new Date());
  const done = s.daily[today];
  const stamps = weekDays(s).map((d) => `<i class="${d.done ? 'on' : ''}"></i>`).join('');
  const ch = todaysChallenge(s, app.content.cats, today, app.content.themeIds);
  const cat = ch && byteCat();
  const t = ch && themeById(ch.theme);
  return `<div class="activities">
    <button class="activity ${done ? 'done' : ''}" data-daily ${done ? 'disabled' : ''}>
      <span class="act-ico">${DAILY.emoji}</span><span class="grow"><b>Daily Byte</b>
      <span class="small dim">${done ? `Done: ${done.correct}/${done.total}. Back tomorrow!` : `5 questions · +${DAILY.fish} ${icon('fish')}`}</span>
      <span class="mini-stamps">${stamps}</span></span></button>
    ${cat ? `<button class="activity ${ch.done ? 'done' : ''}" data-challenge ${ch.done ? 'disabled' : ''}>
      <span class="act-cat">${catArt(cat, ch.won ? 'happy' : 'idle')}</span><span class="grow"><b>${esc(cat.name)}'s challenge</b>
      <span class="small dim">${ch.done ? (ch.won ? 'Won! A new one tomorrow.' : 'Not this time. Tomorrow!') : `${CHALLENGE.size} tricky ${esc(t.name)} questions · +${CHALLENGE.winFish} ${icon('fish')}`}</span></span></button>` : ''}
  </div>`;
}

export function render(root) {
  const s = app.save;
  const last = themeById(s.lastTheme) || themeById('mix');
  const areas = openAreas();
  const area = areas.some((a) => a.id === s.home.area) ? s.home.area : 'room';
  root.innerHTML = `${header()}${levelCard()}
    ${areas.length > 1 ? `<div class="seg wide area-tabs">${areas.map((a) => `<button data-area="${a.id}" class="${a.id === area ? 'on' : ''}">${a.id === 'balcony' ? '🌿' : '🛋️'} ${esc(a.name)}</button>`).join('')}</div>` : ''}
    <div class="room-host"></div>
    <div class="home-panel"></div>`;
  root.querySelectorAll('[data-area]').forEach((b) => (b.onclick = () => { sfx('tap'); s.home.area = b.dataset.area; persist(); go('home'); }));
  const panel = root.querySelector('.home-panel');
  const refreshFish = () => { const f = root.querySelector('[data-fish]'); if (f) f.textContent = s.fish; };

  const drawPlayPanel = () => {
    room.setDecorating(false);
    panel.innerHTML = `<p class="nudge">${nudge()}</p>
      ${activities()}
      <button class="btn big block" data-play>Play</button>
      <div class="row two">
        <button class="btn ghost" data-quick>${themeIcon(last)} Quick · ${s.settings.roundSize || 10}</button>
        <button class="btn yellow" data-decorate>🛋️ Decorate</button>
      </div>
      <button class="icon-btn settings-btn">${icon('gear')} Settings</button>
      ${installHint() ? `<div class="card install-hint"><p class="small">Give Byte a proper home: tap Share, then Add to Home Screen. Safari can tidy away progress in a plain tab.</p>
        <button class="btn sm ghost" data-hint-install>Got it</button></div>` : ''}`;
    panel.querySelector('[data-hint-install]')?.addEventListener('click', () => { sfx('tap'); s.hints.install = true; persist(); go('home'); });
    panel.querySelector('[data-play]').onclick = () => { sfx('tap'); go('themes'); };
    panel.querySelector('[data-daily]')?.addEventListener('click', () => { sfx('tap'); go('quiz', { mode: 'daily' }); });
    panel.querySelector('[data-challenge]')?.addEventListener('click', () => { sfx('tap'); go('quiz', { mode: 'challenge' }); });
    panel.querySelector('[data-quick]').onclick = () => { sfx('tap'); go('quiz', { theme: last.id }); };
    panel.querySelector('[data-decorate]').onclick = () => { sfx('tap'); room.setDecorating(true); drawDecorPanel(null); };
    panel.querySelector('.settings-btn').onclick = () => { sfx('tap'); openSettings(); };
  };

  const drawDecorPanel = (selected) => {
    if (!room.decorating) return;
    const stored = s.home.owned.filter((id) => !s.home.items[id] && (itemById(app.content.home, id)?.area || 'room') === area);
    const sel = selected && itemById(app.content.home, selected);
    panel.innerHTML = `<p class="nudge">${sel ? `<b>${esc(sel.name)}</b> · drag it anywhere` : 'Drag furniture anywhere. Tap a piece to select it.'}</p>
      ${sel ? `<button class="btn ghost block" data-store>Put ${esc(sel.name.toLowerCase())} away</button>` : ''}
      ${stored.length ? `<div class="stored"><span class="small dim">Put away:</span>${stored.map((id) => `<button class="stored-item" data-place="${id}" title="${esc(itemById(app.content.home, id).name)}"><img class="px" src="assets/img/room/furniture/${id}.png" alt=""></button>`).join('')}</div>` : ''}
      <div class="row two">
        <button class="btn yellow" data-shop>${icon('fish')} Shop</button>
        ${area === 'room' ? '<button class="btn sky" data-window>🪟 Window</button>' : ''}
      </div>
      <button class="btn big block" data-done>Done</button>`;
    panel.querySelector('[data-done]').onclick = () => { sfx('tap'); drawPlayPanel(); };
    panel.querySelector('[data-shop]').onclick = () => { sfx('tap'); openShop(area, (id) => { room.syncItem(id); refreshFish(); room.select(id); }); };
    panel.querySelector('[data-window]')?.addEventListener('click', () => { sfx('tap'); openWindows(() => room.draw()); });
    panel.querySelector('[data-store]')?.addEventListener('click', () => {
      sfx('tap'); storeItem(s, selected); persist(); room.syncItem(selected); room.select(null);
    });
    panel.querySelectorAll('[data-place]').forEach((b) => (b.onclick = () => {
      sfx('select'); unstoreItem(s, app.content.home, b.dataset.place); persist(); room.syncItem(b.dataset.place); room.select(b.dataset.place);
    }));
  };

  const room = new Room(root.querySelector('.room-host'), { area, cats: catsIn(), onSelect: (id) => drawDecorPanel(id) });
  drawPlayPanel();
  if (!s.welcomed) welcome();
  return () => room.destroy();
}

function welcome() {
  const byte = byteCat();
  openSheet((sh, close) => {
    sh.innerHTML = `<div class="hero-cat">${catArt(byte, 'happy')}</div>
      <h2 class="center">Welcome to Byte's AI 101</h2>
      <p class="center dim">${esc(byte.name)} has moved into a cosy corner with one cushion bed, and is here to help you get ready to explain AI. Here's how it works:</p>
      <ul class="howto">
        <li><span>${icon('star')}</span>Pick a theme and answer questions about how AI works and how to talk about it.</li>
        <li><span>💡</span>Every answer comes with a fact. Read it: that's the studying.</li>
        <li><span>💬</span>Explain it: say a concept in your own words, then compare it with Byte's model answer.</li>
        <li><span>${icon('fish')}</span>Right answers earn fish. Spend them on furniture, then drag it anywhere.</li>
        <li><span>${icon('heart')}</span>Right answers also grow your friendship with Byte, and the more you get right, the more the home grows.</li>
      </ul>
      <button class="btn block">Let's go</button>`;
    sh.querySelector('.btn').onclick = () => { sfx('tap'); close(); };
  }, { center: true, onClose: () => { app.save.welcomed = true; persist(); } });
}

function openSettings() {
  openSheet((sh, close) => {
    const draw = () => {
      const slider = (bus, label, ico) => `<label class="vol"><span>${ico} ${label}</span>
        <input type="range" min="0" max="100" step="5" value="${Math.round(audio.getVolume(bus) * 100)}" data-vol="${bus}"></label>`;
      sh.innerHTML = `<h2>Settings</h2>
        <div class="card vols">
          <span class="vol-label">🎶 Music style</span>
          <div class="seg wide">${MUSIC_STYLES.map(([id, label]) => `<button data-style="${id}" class="${audio.style === id ? 'on' : ''}">${label}</button>`).join('')}</div>
          ${slider('music', 'Music', '🎵')}${slider('sfx', 'Sounds', '🔔')}</div>
        ${app.storageOk ? '' : '<div class="card"><p class="small" style="color:var(--red)">This browser mode cannot save progress.</p></div>'}
        <div class="card backup"><b>Backup</b>
          <p class="small dim">${app.save.lastBackup ? `Last saved ${new Date(app.save.lastBackup).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.` : 'Not backed up yet.'} A backup code keeps your progress, home and stats safe, and moves them to a new phone.</p>
          <div class="row two"><button class="btn sm sky" data-backup>Save code</button><button class="btn sm ghost" data-restore>Restore</button></div></div>
        ${app.save.retired.length ? `<div class="card row"><span class="small">${app.save.retired.length} question${app.save.retired.length === 1 ? '' : 's'} hidden as too easy</span>
          <div class="spacer"></div><button class="btn sm ghost" data-unretire>Bring back</button></div>` : ''}
        <button class="btn ghost block" data-reset>Reset all progress</button>
        <p class="small dim center">Byte's AI 101 v1.0 · ${app.content.bank.length} questions</p>`;
      sh.querySelectorAll('[data-style]').forEach((b) => (b.onclick = () => {
        sfx('select');
        audio.setStyle(b.dataset.style, app.current);
        sh.querySelectorAll('[data-style]').forEach((x) => x.classList.toggle('on', x === b));
      }));
      sh.querySelectorAll('[data-vol]').forEach((r) => {
        r.oninput = () => audio.setVolume(r.dataset.vol, r.value / 100);
        r.onchange = () => { if (r.dataset.vol === 'sfx') sfx('select'); };
      });
      sh.querySelector('[data-backup]').onclick = () => { sfx('tap'); close(); openBackup(); };
      sh.querySelector('[data-restore]').onclick = () => { sfx('tap'); close(); openRestore(); };
      const unretire = sh.querySelector('[data-unretire]');
      if (unretire) unretire.onclick = () => { sfx('tap'); app.save.retired = []; persist(); toast('They\'re back in the mix'); draw(); };
      sh.querySelector('[data-reset]').onclick = async () => {
        close();
        if (await confirmDialog('Reset everything?', 'Your friendship with Byte, furniture, fish and stats will be gone. This cannot be undone.', 'Reset', 'Keep my progress', true)) {
          resetSave(); toast('Fresh start!'); go('home');
        }
      };
    };
    draw();
  });
}

/** Shows the backup code with Copy and Share (to Notes, Messages, email...). */
function openBackup() {
  const code = makeCode(app.save);
  const saved = () => { app.save.lastBackup = Date.now(); persist(); };
  openSheet((sh) => {
    sh.innerHTML = `<h2>Your backup code</h2>
      <p class="small dim">Keep it somewhere safe, like Notes. Paste it into Restore on any phone to get everything back.</p>
      <textarea class="code-box" readonly>${esc(code)}</textarea>
      <div class="row two"><button class="btn sky" data-copy>Copy</button>${navigator.share ? '<button class="btn yellow" data-share>Share</button>' : ''}</div>`;
    const box = sh.querySelector('.code-box');
    sh.querySelector('[data-copy]').onclick = async () => {
      sfx('tap');
      try { await navigator.clipboard.writeText(code); toast('Copied! Paste it into Notes.'); saved(); }
      catch { box.select(); toast('Select all and copy'); }
    };
    sh.querySelector('[data-share]')?.addEventListener('click', async () => {
      sfx('tap');
      try { await navigator.share({ title: "Byte's AI 101 backup", text: code }); saved(); } catch { /* cancelled */ }
    });
  });
}

/** Paste a backup code to replace this phone's progress. */
function openRestore() {
  openSheet((sh, close) => {
    sh.innerHTML = `<h2>Restore a backup</h2>
      <p class="small dim">Paste your backup code. This replaces the progress on this phone.</p>
      <textarea class="code-box" placeholder="BT1...."></textarea>
      <p class="small restore-msg" style="color:var(--red)"></p>
      <button class="btn block" data-restore-go>Restore</button>`;
    sh.querySelector("[data-restore-go]").onclick = async () => {
      let data;
      try { data = readCode(sh.querySelector('.code-box').value); }
      catch (e) { sh.querySelector('.restore-msg').textContent = e.message; sfx('wrong'); return; }
      close();
      if (await confirmDialog('Restore this backup?', `It has ${data.fish} fish and ${data.stats.correct} right answers. Your current progress will be replaced.`, 'Restore', 'Cancel')) {
        app.save = data;
        persist();
        toast('Welcome back!');
        go('home');
      }
    };
  });
}
