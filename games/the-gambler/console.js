// Decorative meter drums observe display text; never read or write game state.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
for (const id of ['balance', 'wager', 'win']) {
  const source = document.getElementById(id);
  const window = document.createElement('span');
  window.className = 'counter-window';
  source.before(window);
  window.append(source);
  const drums = document.createElement('span');
  drums.className = 'mechanical-digits';
  drums.setAttribute('aria-hidden', 'true');
  window.append(drums);
  let previous = '';
  function render() {
    const value = source.textContent;
    if (value === previous) return;
    const old = previous.padStart(value.length, '0');
    drums.replaceChildren(...[...value].map((character, index) => {
      const digit = document.createElement('span');
      digit.className = /\d/.test(character) ? 'number-drum' : 'meter-separator';
      const face = document.createElement('span');
      face.textContent = character;
      digit.append(face);
      if (/\d/.test(character) && previous && old[index] !== character && !reduced.matches && !document.getElementById('skip').checked) {
        const outgoing = document.createElement('span');
        outgoing.textContent = old[index];
        outgoing.className = 'outgoing-digit';
        digit.append(outgoing);
        face.animate([{transform:'translateY(-100%)'},{transform:'translateY(0)'}], {duration:180,easing:'ease-out'});
        outgoing.animate([{transform:'translateY(0)'},{transform:'translateY(100%)'}], {duration:180,easing:'ease-out'}).onfinish = () => outgoing.remove();
        // Offscreen browser animations may suspend; never retain a stale face.
        setTimeout(() => outgoing.remove(), 200);
      }
      return digit;
    }));
    previous = value;
  }
  new MutationObserver(render).observe(source, {childList:true,characterData:true,subtree:true});
  render();
}
for (const id of ['spin', 'less', 'more']) {
  const button = document.getElementById(id);
  const release = () => button.classList.remove('mechanically-pressed');
  button.addEventListener('pointerdown', event => {
    if (button.disabled) return;
    button.setPointerCapture(event.pointerId);
    button.classList.add('mechanically-pressed');
  });
  for (const event of ['pointerup','pointercancel','lostpointercapture','blur']) button.addEventListener(event, release);
  button.addEventListener('keydown', event => {if ([' ', 'Enter'].includes(event.key) && !button.disabled) button.classList.add('mechanically-pressed');});
  button.addEventListener('keyup', release);
}
