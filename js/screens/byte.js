// The Byte tab: Byte's profile, straight away. Picture (tap for a line), story, favourite, friendship hearts, wardrobe.
import { app, persist, byteCat } from '../app.js';
import { itemById } from '../core/home.js';
import { heartProgress, unlockedAccessories } from '../core/bonds.js';
import { esc, catArt, popHeart } from '../ui.js';
import { sfx } from '../audio.js';

const itemName = (id) => itemById(app.content.home, id)?.name || id;

export function render(root) {
  const cat = byteCat(), s = app.save, id = cat.id;
  const since = s.cats[id]?.since ? new Date(s.cats[id].since).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const draw = () => {
    const cosy = s.home.items[cat.favourite];
    const hp = heartProgress(s.bonds[id]);
    const open = unlockedAccessories(s, id, app.content.accessories);
    const wardrobe = app.content.accessories.map((a) => {
      const has = open.includes(a);
      return `<button class="wear ${s.wear[id] === a.id ? 'on' : ''}" data-wear="${a.id}" ${has ? '' : 'disabled'} title="${esc(a.name)}"
        aria-label="${esc(a.name)}${has ? '' : ` (unlocks at ${a.hearts} heart${a.hearts === 1 ? '' : 's'})`}">
        ${has ? (app.content.art.accessories ? `<img class="px" src="assets/img/accessories/${a.id}.png" alt="">` : a.emoji) : '♥'.repeat(a.hearts)}</button>`;
    }).join('');
    root.innerHTML = `<h1 class="title center">Byte</h1>
      <div class="care-pic" data-tap>${catArt(cat, 'happy')}</div>
      <div class="center"><p class="small dim">${esc(cat.coat)}${since ? ` · home since ${since}` : ''}</p></div>
      <p class="center">${esc(cat.bio)}</p>
      <div class="card friend">
        <div class="row"><span>Friendship</span><div class="spacer"></div><span class="hearts">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= hp.hearts ? 'on' : ''}">♥</i>`).join('')}</span></div>
        <div class="bar" style="--c:var(--pink)"><i style="width:${hp.need ? (100 * hp.have) / hp.need : 100}%"></i></div>
        <span class="small dim">${hp.need ? `Every right answer grows your friendship: ${hp.need - hp.have} more for the next heart. Each heart unlocks something to wear.` : 'Best friends forever!'}</span>
        <div class="wardrobe"><button class="wear ${s.wear[id] ? '' : 'on'}" data-wear="">None</button>${wardrobe}</div>
      </div>
      <div class="card row"><span>♥ Favourite</span><div class="spacer"></div>
        <b>${esc(itemName(cat.favourite))}</b>&nbsp;<span class="chip" style="--c:${cosy ? 'var(--good-bg)' : 'var(--line)'}">${cosy ? 'In the room' : 'Not in the room'}</span></div>
      <div class="card says"><span class="small dim">Things Byte says</span>${(cat.taps || []).map((t) => `<p>“${esc(t)}”</p>`).join('')}</div>
      <p class="center small dim">${cosy ? 'Byte is extra cosy, which earns you a bonus fish every round.' : `Put the ${esc(itemName(cat.favourite).toLowerCase())} in the room to make Byte extra cosy (a bonus fish every round).`}</p>`;
    root.querySelectorAll('[data-wear]').forEach((b) => (b.onclick = () => {
      sfx('select');
      if (b.dataset.wear) s.wear[id] = b.dataset.wear; else delete s.wear[id];
      persist();
      const top = root.scrollTop;
      draw();
      root.scrollTop = top;
    }));
    const pic = root.querySelector('[data-tap]');
    pic.onclick = (e) => {
      const box = pic.getBoundingClientRect();
      sfx('boop');
      pic.classList.remove('cheer'); void pic.offsetWidth; pic.classList.add('cheer');
      popHeart(pic, e.clientX - box.left, e.clientY - box.top);
    };
  };
  draw();
}
