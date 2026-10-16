// Presentation preference only; independent of the game session.
const root = document.documentElement;
let theme = 'burgundy';
try { theme = localStorage.getItem('gambler-theme') === 'midnight' ? 'midnight' : 'burgundy'; } catch {}
const button = document.createElement('button');
button.id = 'themeToggle';
button.type = 'button';
function render() {
  root.dataset.theme = theme;
  button.textContent = theme === 'burgundy' ? 'Casino Red · Switch to blue' : 'Midnight Blue · Switch to red';
  button.setAttribute('aria-label', theme === 'burgundy' ? 'Burgundy theme. Switch to midnight blue' : 'Midnight blue theme. Switch to burgundy');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'burgundy' ? '#4A0F1E' : '#101A35');
}
button.addEventListener('click', () => {
  theme = theme === 'burgundy' ? 'midnight' : 'burgundy';
  try { localStorage.setItem('gambler-theme', theme); } catch {}
  render();
});
render();
(document.querySelector('header') || document.querySelector('.title')).append(button);

