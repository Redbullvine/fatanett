// Artwork and presentation only. The engine's existing `scatter` ID is unchanged.
export const LUNA_ASSET = 'assets/luna_moon.png';
export function lunaScatterArtwork() {
  return `<img class="luna-art" src="${LUNA_ASSET}" alt="" decoding="async"><span class="luna-label">SCATTER</span>`;
}
export class LunaScatterCelebration {
  constructor({reels, skip}) {
    Object.assign(this, {reels, skip});
    this.seen = new Set();
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.motion.addEventListener('change', event => { if (event.matches) this.finish(); });
    this.banner = document.createElement('div');
    this.banner.className = 'luna-announcement';
    this.banner.hidden = true;
    this.banner.innerHTML = '<strong role="status">LUNA MOON — BONUS UNLOCKED!</strong><button type="button">Skip animation</button>';
    reels.closest('.machine').querySelector('.status').before(this.banner);
    this.banner.querySelector('button').onclick = () => this.finish();
  }
  finish() { this.active?.(); }
  clear() {
    this.finish();
    this.reels.querySelectorAll('.luna-unlocked').forEach(cell => cell.classList.remove('luna-unlocked'));
  }
  play(id) {
    if (this.seen.has(id)) return Promise.resolve(false);
    this.seen.add(id);
    if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value);
    this.finish();
    const cells = [...this.reels.querySelectorAll('[data-symbol="scatter"]')];
    const still = this.motion.matches || this.skip.checked;
    cells.forEach(cell => {cell.classList.add('luna-unlocked');cell.classList.toggle('luna-sparkling', !still);});
    this.banner.hidden = false;
    return new Promise(resolve => {
      let timer;
      const finish = () => {
        clearTimeout(timer);
        cells.forEach(cell => cell.classList.remove('luna-sparkling'));
        this.banner.hidden = true;
        this.active = null;
        resolve(true);
      };
      this.active = finish;
      timer = setTimeout(finish, still ? 350 : 1600);
    });
  }
}
