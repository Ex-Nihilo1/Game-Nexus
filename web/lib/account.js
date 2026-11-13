// The account corner of every page header: a Leaderboards link, and Sign in or the
// player's name with a menu. Load it after api.js; it fills .app-header itself.

(function () {
  if (typeof Nexus === 'undefined') return;

  const CHEVRON = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" ' +
    'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3.5l3 3 3-3"/></svg>';

  const here = () => location.pathname + location.search;
  const link = (path, text, className) => {
    const a = document.createElement('a');
    a.href = Nexus.root + path;
    a.textContent = text;
    if (className) a.className = className;
    return a;
  };

  function render(box, user) {
    box.textContent = '';
    if (!location.pathname.includes('/leaderboards/')) box.appendChild(link('leaderboards/', 'Leaderboards', 'text-link'));
    if (!Nexus.online) return;
    if (!user) {
      if (!location.pathname.includes('/account/')) {
        box.appendChild(link('account/?back=' + encodeURIComponent(here()), 'Sign in', 'button'));
      }
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'account-menu';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'account-button';
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = CHEVRON;
    button.prepend(document.createTextNode(user.displayName));

    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    const items = [
      link('leaderboards/?player=' + encodeURIComponent(user.displayName), 'Your stats'),
      link('account/', user.verified ? 'Account' : 'Account: confirm your email'),
    ];
    const signOut = document.createElement('button');
    signOut.type = 'button';
    signOut.textContent = 'Sign out';
    signOut.addEventListener('click', async () => {
      await Nexus.call('POST', 'auth/logout', {});
      Nexus.setUser(null);
    });
    items.push(signOut);
    for (const item of items) {
      item.setAttribute('role', 'menuitem');
      menu.appendChild(item);
    }

    const open = show => {
      menu.hidden = !show;
      button.setAttribute('aria-expanded', String(show));
    };
    button.addEventListener('click', e => {
      e.stopPropagation();
      open(menu.hidden);
      if (!menu.hidden) menu.querySelector('[role="menuitem"]').focus();
    });
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) open(false); });
    wrap.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !menu.hidden) {
        e.stopPropagation();
        open(false);
        button.focus();
      }
    });
    wrap.append(button, menu);
    box.appendChild(wrap);
  }

  function setup() {
    const header = document.querySelector('.app-header');
    if (!header) return;
    const box = document.createElement('div');
    box.className = 'account-controls';
    const theme = header.querySelector('.theme-controls');
    header.insertBefore(box, theme);
    render(box, null);
    Nexus.userReady.then(user => render(box, user));
    document.addEventListener('nexususer', e => render(box, e.detail));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
