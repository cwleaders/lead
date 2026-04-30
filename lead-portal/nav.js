/* CW Leaders Studio — Unified Top Nav (web).
   One nav, every property. Auto-detects which property by hostname,
   highlights active tool, swaps account state, handles desktop/mobile.

   Drop-in: <header id="cw-nav"></header> + this script + nav.css.
   Depends on lead.js (window.LEAD for Auth, openAuth, openPersonaPicker).
*/

(function () {
  'use strict';

  // ─── PROPERTY DETECTION ─────────────────────────────────────────────
  const HOST = location.hostname;
  const PROPERTY = (() => {
    if (HOST.startsWith('lead.'))     return 'lead';
    if (HOST.startsWith('studio.'))   return 'studio';
    if (HOST.startsWith('upload.'))   return 'upload';
    if (HOST.startsWith('download.')) return 'download';
    if (HOST.startsWith('myhire.'))   return 'myhire';
    return 'lead';
  })();

  const PROPERTY_LABELS = {
    lead:     '',
    studio:   'STUDIO',
    upload:   'SEND',
    download: 'RECEIVE',
    myhire:   'MYHIRE'
  };

  // ─── DESTINATION CATALOG ────────────────────────────────────────────
  const URLS = {
    lead:     'https://lead.cwleaders.com',
    studio:   'https://studio.cwleaders.com',
    upload:   'https://upload.cwleaders.com',
    download: 'https://download.cwleaders.com',
    myhire:   'https://myhire.cwleaders.com',
    api:      'https://api.cwleaders.com',
    enterprise: 'https://lead.cwleaders.com/enterprise',
    pricing:  'https://studio.cwleaders.com#pricing',
    unlock:   'https://lead.cwleaders.com/unlock',
    command:  'https://lead.cwleaders.com/command',
    admin:    'https://lead.cwleaders.com/admin',
    download_auto: 'https://api.cwleaders.com/desktop/download?platform=auto',
  };

  const TOOLS = [
    { id: 'lead',     glyph: '🎬', label: 'Record',  sub: 'Screen + AI overlays',     href: URLS.lead     },
    { id: 'upload',   glyph: '📦', label: 'Send',    sub: 'Drop a file, get a link', href: URLS.upload   },
    { id: 'download', glyph: '📥', label: 'Receive', sub: 'Preview before download', href: URLS.download },
    { id: 'myhire',   glyph: '👥', label: 'Hire',    sub: 'Show your work',          href: URLS.myhire   },
  ];

  // ─── DOM HELPERS ────────────────────────────────────────────────────
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs && typeof attrs === 'object') {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class')      node.className = v;
        else if (k === 'html')  node.innerHTML = v;
        else if (k === 'text')  node.textContent = v;
        else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === true)    node.setAttribute(k, '');
        else                    node.setAttribute(k, v);
      }
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }
  function svgMonogram() {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 32 32');
    s.setAttribute('width', '22'); s.setAttribute('height', '22');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
    s.innerHTML =
      '<circle cx="8" cy="10" r="3"/><circle cx="24" cy="10" r="3"/>' +
      '<circle cx="16" cy="22" r="3"/>' +
      '<path d="M11 10h10M9.5 12.5L14 19.5M22.5 12.5L18 19.5" stroke-linecap="round"/>';
    return s;
  }
  function escAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }

  // ─── AUTH / STATE ───────────────────────────────────────────────────
  function user() { try { return window.LEAD?.Auth?.user || null; } catch { return null; } }
  function signedIn() { return !!user() && !!window.LEAD?.Auth?.token; }
  function signOut() {
    try { window.LEAD?.Auth?.clear(); } catch {}
    location.reload();
  }
  function openAuth() {
    if (window.LEAD?.openAuth) window.LEAD.openAuth({ onSuccess: () => location.reload() });
    else location.assign(URLS.studio);
  }
  function openPersona() {
    if (window.LEAD?.openPersonaPicker) window.LEAD.openPersonaPicker();
  }

  function isAdmin() {
    const u = user();
    // Heuristic: admin emails are configured server-side; we surface the link
    // for emails containing "admin" or matching known patterns. Real check is
    // server-side on /admin/snapshot.
    return !!u && (u.email || '').includes('admin');
  }
  function isController() {
    const u = user();
    return !!u && ['controller', 'admin'].includes(u.persona);
  }

  // ─── TOPBAR RENDER ──────────────────────────────────────────────────
  function renderTopbar() {
    const u = user();
    const top = el('header', { class: 'cw-topnav', role: 'navigation', 'aria-label': 'Primary' });

    // Brand
    const brandHref = u ? URLS.studio : URLS.lead;
    const brand = el('a', { class: 'cw-brand', href: brandHref, 'aria-label': 'CW Leaders home' });
    brand.appendChild(svgMonogram());
    brand.appendChild(el('span', { text: 'CW LEADERS' }));
    if (PROPERTY_LABELS[PROPERTY]) {
      brand.appendChild(el('span', { class: 'cw-brand-property', text: '/ ' + PROPERTY_LABELS[PROPERTY] }));
    }
    top.appendChild(brand);

    // Items list (desktop)
    const items = el('ul', { class: 'cw-nav-items' });

    // Tools mega-menu
    items.appendChild(buildToolsItem());
    // For Teams
    items.appendChild(buildLinkItem('For Teams', URLS.enterprise,
      location.pathname.startsWith('/enterprise') ? 'page' : null));
    // Pricing
    items.appendChild(buildLinkItem('Pricing', URLS.pricing));

    // Conditional: Get Studio (for anonymous/free) OR removed for paid
    if (!u || u.plan === 'free') {
      items.appendChild(buildLinkItem('Get Studio', URLS.download_auto, null, true));
    }

    top.appendChild(items);

    // Burger (mobile)
    const burger = el('button', {
      class: 'cw-burger',
      'aria-label': 'Open menu',
      'aria-expanded': 'false',
      'aria-controls': 'cw-drawer'
    },
      el('span'), el('span'), el('span')
    );
    burger.addEventListener('click', toggleDrawer);
    top.appendChild(burger);

    // Account / sign-in (right side)
    const accountWrap = el('div', { style: 'position:relative;' });
    accountWrap.appendChild(buildAccount());
    top.appendChild(accountWrap);

    return top;
  }

  function buildToolsItem() {
    const li = el('li', { class: 'cw-tools-item' });
    const btn = el('button', {
      class: 'cw-nav-link',
      'aria-haspopup': 'true',
      'aria-expanded': 'false'
    },
      'Tools',
      el('span', { class: 'cw-caret cw-caret-rot', text: '▾' })
    );
    li.appendChild(btn);

    const menu = el('div', { class: 'cw-megamenu', role: 'menu' });
    for (const t of TOOLS) {
      const isActive = (PROPERTY === t.id);
      const a = el('a', {
        class: 'cw-megaitem ' + (isActive ? 'cw-mega-active' : ''),
        href: t.href,
        role: 'menuitem'
      },
        el('span', { class: 'cw-mega-glyph', text: t.glyph }),
        el('span', { class: 'cw-mega-label', text: t.label }),
        el('span', { class: 'cw-mega-sub',   text: t.sub })
      );
      menu.appendChild(a);
    }
    const studioFooter = el('a', {
      class: 'cw-mega-footer',
      href: URLS.studio
    },
      el('span', null, 'All four tools on one canvas'),
      el('strong', null, 'Studio Hub →')
    );
    menu.appendChild(studioFooter);
    li.appendChild(menu);

    let openTimer, closeTimer;
    function openIt() {
      clearTimeout(closeTimer);
      menu.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
    }
    function closeIt() {
      closeTimer = setTimeout(() => {
        menu.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
      }, 220);
    }
    li.addEventListener('mouseenter', openIt);
    li.addEventListener('mouseleave', closeIt);
    btn.addEventListener('click', e => {
      e.preventDefault();
      const open = menu.classList.contains('is-open');
      if (open) { menu.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }
      else openIt();
    });
    return li;
  }

  function buildLinkItem(label, href, ariaCurrent, isCta) {
    const li = el('li');
    const a = el('a', {
      class: isCta ? 'cw-cta' : 'cw-nav-link',
      href,
      'aria-current': ariaCurrent
    }, label);
    li.appendChild(a);
    return li;
  }

  function buildAccount() {
    const u = user();
    if (!u || !signedIn()) {
      const btn = el('button', { class: 'cw-cta', type: 'button' }, 'Sign in');
      btn.addEventListener('click', openAuth);
      return btn;
    }

    // Account pill
    const initial = (u.email || '?')[0].toUpperCase();
    const pill = el('button', {
      class: 'cw-cta cw-account-pill',
      type: 'button',
      'aria-haspopup': 'true',
      'aria-expanded': 'false'
    });
    const avi = el('span', { class: 'cw-avi' });
    if (u.photoURL) {
      const img = el('img', { src: u.photoURL, alt: '', referrerpolicy: 'no-referrer' });
      avi.appendChild(img);
    } else {
      avi.textContent = initial;
    }
    pill.appendChild(avi);
    const localPart = (u.email || '').split('@')[0];
    pill.appendChild(el('span', { text: localPart }));
    if (u.plan && u.plan !== 'free') {
      pill.appendChild(el('span', { class: 'cw-tier-pill', text: u.plan }));
    }

    // Dropdown menu
    const menu = el('div', { class: 'cw-account-menu', role: 'menu' });
    const header = el('div', { class: 'cw-account-header' });
    header.appendChild(el('div', { class: 'cw-acct-name', text: u.displayName || localPart }));
    header.appendChild(el('div', { class: 'cw-acct-email', text: u.email || '' }));
    menu.appendChild(header);

    const items = [
      ['🏠', 'Studio dashboard',   URLS.studio],
      ['🎬', 'My recordings',      URLS.lead],
      ['📦', 'My files',           URLS.upload],
      ['📋', 'My applications',    URLS.myhire,        u.persona === 'applicant'],
      'divider',
      ['💳', 'Plan & billing',     URLS.pricing],
      ['🎭', 'Switch persona',     null, true, openPersona],
      ['🔑', 'Have a license key?',URLS.unlock],
      'divider',
      ['🎯', 'Mission Control',    URLS.command,       isController()],
      ['🛡️', 'Admin dashboard',    URLS.admin,         isAdmin()],
      'divider',
      ['💬', 'Help & contact',     'mailto:hello@cwleaders.com'],
      ['🚪', 'Sign out',           null, true, signOut, true],
    ];
    for (const it of items) {
      if (it === 'divider') { menu.appendChild(el('hr')); continue; }
      const [icon, label, href, isAction, action, danger] = it;
      const showWhen = it[3];   // boolean for conditional
      const conditional = it.length === 4 && typeof showWhen === 'boolean';
      if (conditional && !showWhen) continue;
      if (isAction && action) {
        const b = el('button', { class: danger ? 'cw-danger' : '', type: 'button' });
        b.appendChild(el('span', { class: 'cw-acct-icon', text: icon }));
        b.appendChild(document.createTextNode(label));
        b.addEventListener('click', () => { action(); closeAccountMenu(); });
        menu.appendChild(b);
      } else if (href) {
        const a = el('a', { href, class: danger ? 'cw-danger' : '' });
        a.appendChild(el('span', { class: 'cw-acct-icon', text: icon }));
        a.appendChild(document.createTextNode(label));
        menu.appendChild(a);
      }
    }

    let closeTimer;
    function openMenu() {
      clearTimeout(closeTimer);
      menu.classList.add('is-open');
      pill.setAttribute('aria-expanded', 'true');
    }
    function closeAccountMenu() {
      closeTimer = setTimeout(() => {
        menu.classList.remove('is-open');
        pill.setAttribute('aria-expanded', 'false');
      }, 200);
    }
    pill.addEventListener('mouseenter', openMenu);
    menu.addEventListener('mouseenter', openMenu);
    pill.addEventListener('mouseleave', closeAccountMenu);
    menu.addEventListener('mouseleave', closeAccountMenu);
    pill.addEventListener('click', e => {
      e.preventDefault();
      menu.classList.contains('is-open') ? (menu.classList.remove('is-open'), pill.setAttribute('aria-expanded', 'false'))
                                          : openMenu();
    });

    const wrap = el('span', { style: 'position:relative;display:inline-block' });
    wrap.appendChild(pill);
    wrap.appendChild(menu);
    return wrap;
  }

  // ─── DRAWER (mobile) ────────────────────────────────────────────────
  function renderDrawer() {
    const u = user();
    const drawer = el('div', { id: 'cw-drawer', class: 'cw-drawer', role: 'navigation', 'aria-label': 'Mobile menu' });

    // Tools section
    drawer.appendChild(el('div', { class: 'cw-drawer-section-header', text: 'Tools' }));
    for (const t of TOOLS) {
      const a = el('a', { href: t.href, 'aria-current': PROPERTY === t.id ? 'page' : null });
      a.appendChild(el('span', { class: 'cw-drawer-icon', text: t.glyph }));
      a.appendChild(document.createTextNode(t.label));
      drawer.appendChild(a);
    }
    const studioLink = el('a', { href: URLS.studio });
    studioLink.appendChild(el('span', { class: 'cw-drawer-icon', text: '🏠' }));
    studioLink.appendChild(document.createTextNode('Studio Hub'));
    drawer.appendChild(studioLink);

    drawer.appendChild(el('hr'));

    // Standalone links
    const teamsA = el('a', { href: URLS.enterprise });
    teamsA.appendChild(el('span', { class: 'cw-drawer-icon', text: '🛡️' }));
    teamsA.appendChild(document.createTextNode('For Teams'));
    drawer.appendChild(teamsA);

    const priceA = el('a', { href: URLS.pricing });
    priceA.appendChild(el('span', { class: 'cw-drawer-icon', text: '💳' }));
    priceA.appendChild(document.createTextNode('Pricing'));
    drawer.appendChild(priceA);

    if (!u || u.plan === 'free') {
      const dlA = el('a', { href: URLS.download_auto });
      dlA.appendChild(el('span', { class: 'cw-drawer-icon', text: '📥' }));
      dlA.appendChild(document.createTextNode('Get desktop app'));
      drawer.appendChild(dlA);
    }

    drawer.appendChild(el('hr'));

    // Account section
    if (!signedIn()) {
      const cta = el('a', { class: 'cw-cta-full', href: '#' });
      cta.textContent = 'Sign in';
      cta.addEventListener('click', e => { e.preventDefault(); closeDrawer(); openAuth(); });
      drawer.appendChild(cta);
    } else {
      const u2 = user();
      const initial = (u2.email || '?')[0].toUpperCase();
      const head = el('div', { class: 'cw-drawer-account-header' });
      const avi = el('span', { class: 'cw-avi' });
      if (u2.photoURL) avi.appendChild(el('img', { src: u2.photoURL, alt: '', referrerpolicy: 'no-referrer' }));
      else avi.textContent = initial;
      head.appendChild(avi);
      const info = el('div');
      info.appendChild(el('div', { class: 'cw-acct-name', text: u2.displayName || (u2.email || '').split('@')[0] }));
      info.appendChild(el('div', { class: 'cw-acct-email', text: u2.email }));
      head.appendChild(info);
      if (u2.plan && u2.plan !== 'free') {
        head.appendChild(el('span', { class: 'cw-tier-pill', text: u2.plan }));
      }
      drawer.appendChild(head);

      const acctItems = [
        ['🏠', 'Studio dashboard',   URLS.studio],
        ['🎬', 'My recordings',      URLS.lead],
        ['📦', 'My files',           URLS.upload],
        ['📋', 'My applications',    URLS.myhire,        u2.persona === 'applicant'],
        'divider',
        ['💳', 'Plan & billing',     URLS.pricing],
        ['🎭', 'Switch persona',     null, openPersona],
        ['🔑', 'Have a license key?',URLS.unlock],
        'divider',
        ['🎯', 'Mission Control',    URLS.command,       isController()],
        ['🛡️', 'Admin dashboard',    URLS.admin,         isAdmin()],
        'divider',
        ['💬', 'Help & contact',     'mailto:hello@cwleaders.com'],
        ['🚪', 'Sign out',           null, signOut, true],
      ];
      for (const it of acctItems) {
        if (it === 'divider') { drawer.appendChild(el('hr')); continue; }
        const [icon, label, href, action, danger] = it;
        const showWhen = it[3];
        const conditional = it.length === 4 && typeof showWhen === 'boolean';
        if (conditional && !showWhen) continue;
        if (action && !href) {
          const b = el('button', { class: danger ? 'cw-danger' : '', type: 'button' });
          b.appendChild(el('span', { class: 'cw-drawer-icon', text: icon }));
          b.appendChild(document.createTextNode(label));
          b.addEventListener('click', () => { closeDrawer(); action(); });
          drawer.appendChild(b);
        } else if (href) {
          const a = el('a', { href });
          a.appendChild(el('span', { class: 'cw-drawer-icon', text: icon }));
          a.appendChild(document.createTextNode(label));
          drawer.appendChild(a);
        }
      }
    }

    return drawer;
  }

  function toggleDrawer() {
    const drawer = document.getElementById('cw-drawer');
    const burger = document.querySelector('.cw-burger');
    if (!drawer) return;
    const open = drawer.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('cw-nav-locked', open);
  }
  function closeDrawer() {
    const drawer = document.getElementById('cw-drawer');
    const burger = document.querySelector('.cw-burger');
    if (drawer) drawer.classList.remove('is-open');
    if (burger) burger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('cw-nav-locked');
  }

  // ─── BOTTOM TAB BAR (mobile, signed-in only) ───────────────────────
  function renderBottomBar() {
    const bar = el('nav', { class: 'cw-bottombar', role: 'navigation', 'aria-label': 'Quick tools' });
    const tabs = [
      { id: 'studio',   icon: '🏠', label: 'Studio', href: URLS.studio   },
      { id: 'lead',     icon: '🎬', label: 'Record', href: URLS.lead     },
      { id: 'upload',   icon: '📦', label: 'Send',   href: URLS.upload   },
      { id: 'myhire',   icon: '👥', label: 'Hire',   href: URLS.myhire   },
    ];
    for (const t of tabs) {
      const a = el('a', { href: t.href, 'aria-current': PROPERTY === t.id ? 'page' : null });
      a.appendChild(el('span', { class: 'cw-tab-icon', text: t.icon }));
      a.appendChild(el('span', { text: t.label }));
      bar.appendChild(a);
    }
    if (signedIn()) bar.classList.add('is-visible');
    return bar;
  }

  // ─── COMPLIANCE FOOTER ──────────────────────────────────────────────
  function renderComplianceFooter() {
    const wrap = el('footer', {
      id: 'cw-compliance-footer',
      class: 'cw-compliance-footer',
      role: 'contentinfo'
    });
    const inner = el('div', { class: 'cw-cf-inner' });

    const left = el('div', { class: 'cw-cf-left' });
    const year = new Date().getFullYear();
    left.appendChild(el('span', { class: 'cw-cf-mark' }, '© ' + year + ' CW Leaders'));
    left.appendChild(el('span', { class: 'cw-cf-dot' }, '·'));
    left.appendChild(el('span', { class: 'cw-cf-tag' }, 'Made for visual thinkers'));

    const links = [
      ['Privacy',        URLS.lead + '/privacy'],
      ['Terms',          URLS.lead + '/terms'],
      ['Cookies',        URLS.lead + '/cookies'],
      ['Accessibility',  URLS.lead + '/accessibility'],
      ['DPA',            URLS.lead + '/dpa'],
      ['Sub-processors', URLS.lead + '/subprocessors'],
      ['Security',       'mailto:security@cwleaders.com']
    ];
    const right = el('nav', { class: 'cw-cf-right', 'aria-label': 'Legal & compliance' });
    for (const [label, href] of links) {
      const a = el('a', { class: 'cw-cf-link', href: href, rel: 'noopener' }, label);
      right.appendChild(a);
    }
    const dns = el('a', {
      class: 'cw-cf-link cw-cf-dns',
      href: 'mailto:privacy@cwleaders.com?subject=Do%20Not%20Sell%20or%20Share%20%E2%80%94%20California',
      rel: 'noopener'
    }, 'Do Not Sell or Share');
    right.appendChild(dns);

    inner.appendChild(left);
    inner.appendChild(right);
    wrap.appendChild(inner);
    return wrap;
  }

  function mountComplianceFooter() {
    if (document.getElementById('cw-compliance-footer')) return;
    try {
      document.body.appendChild(renderComplianceFooter());
    } catch (err) {
      console.error('[CWNav] compliance footer mount failed:', err);
    }
  }

  // ─── MOUNT ──────────────────────────────────────────────────────────
  function mount() {
    try {
      const host = document.getElementById('cw-nav');
      if (!host) {
        const auto = document.createElement('div');
        auto.id = 'cw-nav';
        document.body.insertBefore(auto, document.body.firstChild);
      }

      const target = document.getElementById('cw-nav');
      // Use compatible clear (replaceChildren is Chrome 86+; older fallback)
      while (target.firstChild) target.removeChild(target.firstChild);
      target.appendChild(renderTopbar());
      target.appendChild(renderDrawer());
      target.appendChild(renderBottomBar());
      mountComplianceFooter();
    } catch (err) {
      console.error('[CWNav] mount failed:', err);
      // Surface a minimal fallback nav so the page is never strandedwithout one
      const t = document.getElementById('cw-nav');
      if (t) {
        t.innerHTML =
          '<header style="position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:60;' +
          'display:flex;gap:18px;padding:10px 20px;border-radius:999px;background:rgba(22,30,54,0.92);' +
          'backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,0.06);font-family:Inter,system-ui;' +
          'color:#e8eaf2;font-size:13px;letter-spacing:0.04em;">' +
          '<a href="https://studio.cwleaders.com" style="color:#fbbf24;text-decoration:none;font-weight:600;letter-spacing:0.18em;">CW LEADERS</a>' +
          '<a href="https://lead.cwleaders.com"     style="color:#8a93b3;text-decoration:none;">Record</a>' +
          '<a href="https://upload.cwleaders.com"   style="color:#8a93b3;text-decoration:none;">Send</a>' +
          '<a href="https://download.cwleaders.com" style="color:#8a93b3;text-decoration:none;">Receive</a>' +
          '<a href="https://myhire.cwleaders.com"   style="color:#8a93b3;text-decoration:none;">Hire</a>' +
          '<a href="https://lead.cwleaders.com/enterprise" style="color:#8a93b3;text-decoration:none;">For Teams</a>' +
          '</header>';
      }
    }

    // Close drawer / menus on outside click
    document.addEventListener('click', (e) => {
      const drawer = document.getElementById('cw-drawer');
      const burger = document.querySelector('.cw-burger');
      if (drawer?.classList.contains('is-open')
          && !drawer.contains(e.target) && !burger.contains(e.target)) {
        closeDrawer();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDrawer();
    });

    // Hide nav on scroll-down, show on scroll-up (mobile only)
    let lastScroll = 0;
    let nav = target.querySelector('.cw-topnav');
    addEventListener('scroll', () => {
      const cur = scrollY;
      if (innerWidth > 880 || !nav) return;
      if (cur > lastScroll && cur > 100) nav.classList.add('is-hidden');
      else nav.classList.remove('is-hidden');
      lastScroll = cur;
    }, { passive: true });
  }

  function rerender() {
    if (document.getElementById('cw-nav')) mount();
  }

  // Re-render when auth state changes
  document.addEventListener('lead-auth-change', rerender);
  document.addEventListener('lead-persona-change', rerender);

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  // Public API for re-render and direct access
  window.CWNav = { mount, rerender, mountComplianceFooter, PROPERTY };
})();
