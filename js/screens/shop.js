// The furniture shop and the window-view picker (bottom sheets opened from decorate mode).
import { app, persist } from '../app.js';
import { levelFor, buyItem } from '../core/home.js';
import { esc, icon, openSheet, toast } from '../ui.js';
import { sfx } from '../audio.js';

const levelName = (n) => app.content.home.levels[n - 1].name;

/** @param {(id:string)=>void} onBought called after a purchase, with the new item (already placed in its usual spot) */
export function openShop(area, onBought) {
  openSheet((sh) => {
    const draw = () => {
      const s = app.save, home = app.content.home;
      const lv = levelFor(s.stats.correct, home.levels).index;
      const rows = home.items.filter((it) => it.price > 0 && (it.area || 'room') === area).sort((a, b) => a.level - b.level || a.price - b.price).map((it) => {
        const owned = s.home.owned.includes(it.id);
        const locked = it.level - 1 > lv;
        const lovers = app.content.cats.filter((c) => c.favourite === it.id && s.cats[c.id]).map((c) => c.name);
        const hint = lovers.length ? `<span class="love done">♥ ${esc(lovers.join(' and '))}'s favourite</span>` : '';
        const btn = owned ? `<span class="chip" style="--c:var(--good-bg)">Owned</span>`
          : locked ? `<span class="chip lock">${icon('lock')} ${esc(levelName(it.level))}</span>`
          : `<button class="btn sm ${s.fish >= it.price ? 'yellow' : ''}" data-buy="${it.id}" ${s.fish >= it.price ? '' : 'disabled'}>${icon('fish')} ${it.price}</button>`;
        return `<div class="shop-row ${locked ? 'locked' : ''}">
          <div class="shop-pic"><img class="px" src="assets/img/room/furniture/${it.id}.png" alt=""></div>
          <div class="grow"><b>${esc(it.name)}</b><p class="small dim">${esc(it.line)}</p>${hint}</div>
          ${btn}</div>`;
      }).join('');
      sh.innerHTML = `<div class="row"><h2>${area === 'balcony' ? 'Garden shop' : 'Furniture shop'}</h2><div class="spacer"></div>
          <span class="pill"><span class="ico">${icon('fish')}</span>${s.fish}</span></div>
        <p class="small dim">New pieces go straight into the room. Drag them wherever you like.</p>
        <div class="shop-list">${rows}</div>`;
      sh.querySelectorAll('[data-buy]').forEach((b) => (b.onclick = () => {
        const id = b.dataset.buy;
        const r = buyItem(s, home, id, lv);
        if (!r.ok) { toast(r.reason === 'fish' ? 'Not enough fish yet' : 'Not available yet'); return; }
        persist();
        sfx('coin');
        const it = home.items.find((x) => x.id === id);
        toast(`${it.name} placed!`);
        onBought?.(id);
        draw();
      }));
    };
    draw();
  });
}

export function openWindows(onChange) {
  openSheet((sh, close) => {
    const s = app.save, home = app.content.home;
    const lv = levelFor(s.stats.correct, home.levels).index;
    sh.innerHTML = `<h2>Window view</h2>
      <div class="window-list">${home.windows.map((w) => {
        const locked = w.level - 1 > lv;
        return `<button class="window-opt ${s.home.window === w.id ? 'on' : ''}" data-win="${w.id}" ${locked ? 'disabled' : ''}>
          <img class="px" src="assets/img/room/window_${w.id}.png" alt="">
          <span><b>${esc(w.name)}</b>${locked ? `<br><span class="small dim">${icon('lock')} ${esc(levelName(w.level))}</span>` : ''}</span></button>`;
      }).join('')}</div>`;
    sh.querySelectorAll('[data-win]').forEach((b) => (b.onclick = () => {
      sfx('select');
      s.home.window = b.dataset.win;
      persist();
      onChange?.();
      close();
    }));
  });
}
