/* lead.js — shared client-side library across all lead-portal pages.
   - Auth state (magic-link tokens stored in localStorage)
   - API client with Bearer JWT
   - Toast/notification helper
   - Modal helper
   - Firebase Google Sign-In (lazy-loaded only when user clicks the button) */

(function (global) {
  'use strict';

  const CFG = {
    api: global.LEAD_API || 'https://api.cwleaders.com',
    storeKey: 'lead.auth.v1'
  };

  // ---------- AUTH STATE ----------------------------------------------------
  const Auth = {
    get token() {
      try { return JSON.parse(localStorage.getItem(CFG.storeKey))?.jwt || null; } catch { return null; }
    },
    get user() {
      try { return JSON.parse(localStorage.getItem(CFG.storeKey))?.user || null; } catch { return null; }
    },
    set(jwt, user) {
      localStorage.setItem(CFG.storeKey, JSON.stringify({ jwt, user, at: Date.now() }));
      document.dispatchEvent(new CustomEvent('lead-auth-change', { detail: { user } }));
    },
    clear() {
      localStorage.removeItem(CFG.storeKey);
      document.dispatchEvent(new CustomEvent('lead-auth-change', { detail: { user: null } }));
    }
  };

  // ---------- API CLIENT ---------------------------------------------------
  /** ApiError preserves status + retryAfter so callers can react meaningfully. */
  class ApiError extends Error {
    constructor(message, { status, retryAfter, body } = {}) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.retryAfter = retryAfter;
      this.body = body;
    }
    get isRateLimit() { return this.status === 429; }
    get isCircuitOpen() { return this.status === 503; }
    get isAuthRequired() { return this.status === 401; }
  }

  async function api(path, { method = 'GET', body, auth = false, timeoutMs = 15000 } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (auth && Auth.token) headers.authorization = `Bearer ${Auth.token}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let r;
    try {
      r = await fetch(`${CFG.api}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new ApiError('Request timed out — check your connection and try again.', { status: 0 });
      }
      throw new ApiError('Couldn\'t reach the server. Check your connection and retry.', { status: 0 });
    }
    clearTimeout(timer);
    let data;
    try { data = await r.json(); } catch { data = {}; }
    if (!r.ok) {
      // 412 = ToS / Privacy out of date — global handler shows the re-accept modal.
      if (r.status === 412 && data.reason === 'tos_outdated') {
        showTosReacceptModal(data);
        const e = new ApiError('Terms updated — please re-accept.', { status: 412, body: data });
        throw e;
      }
      const retryAfter = Number(r.headers.get('retry-after')) || data.retryAfter;
      const msg = data.error
        || (r.status === 429 ? 'Too many attempts — please slow down.' : null)
        || (r.status === 503 ? 'Service temporarily unavailable, please retry in a moment.' : null)
        || `HTTP ${r.status}`;
      throw new ApiError(msg, { status: r.status, retryAfter, body: data });
    }
    return data;
  }

  /* ToS re-acceptance modal — A1/A2 from BANDAID phase 6.
     Triggered when the server returns 412 with reason=tos_outdated.
     The modal blocks all interaction (no ESC, no backdrop dismiss) until
     the user either accepts or signs out. */
  function showTosReacceptModal(detail) {
    if (document.getElementById('lead-tos-modal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'lead-tos-modal';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'lead-tos-modal-title');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,14,26,0.85);backdrop-filter:blur(12px);font-family:Inter,system-ui,sans-serif;color:#e8eaf2;';
    wrap.innerHTML =
      '<div style="max-width:520px;width:100%;background:rgba(22,30,54,0.97);border:1px solid rgba(255,255,255,0.06);border-radius:22px;padding:32px 28px 24px;box-shadow:0 30px 80px rgba(0,0,0,.5)">' +
        '<div style="font-size:11px;letter-spacing:0.32em;color:#c084fc;margin-bottom:8px">UPDATED TERMS</div>' +
        '<h2 id="lead-tos-modal-title" style="font-size:22px;line-height:1.15;letter-spacing:-0.02em;margin-bottom:12px;color:#e8eaf2">We updated our Terms.</h2>' +
        '<p style="color:#8a93b3;font-size:14px;line-height:1.55;margin-bottom:18px">' +
          'We updated our <a href="/terms" target="_blank" rel="noopener" style="color:#fbbf24;text-decoration:none;border-bottom:1px dotted currentColor">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener" style="color:#fbbf24;text-decoration:none;border-bottom:1px dotted currentColor">Privacy Policy</a>. ' +
          'You accepted v' + (detail?.accepted || '—') + ', current is v' + (detail?.current || '—') + '. ' +
          'Please review and accept to continue.' +
        '</p>' +
        '<label style="display:flex;align-items:flex-start;gap:10px;padding:14px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;cursor:pointer;margin-bottom:18px">' +
          '<input type="checkbox" id="lead-tos-cb" style="margin-top:2px" />' +
          '<span style="color:#e8eaf2;font-size:13px;line-height:1.5">I agree to the updated Terms of Service and Privacy Policy.</span>' +
        '</label>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
          '<button type="button" id="lead-tos-accept" disabled style="flex:1;padding:11px 18px;border-radius:999px;border:none;background:#fbbf24;color:#0a0e1a;font-weight:600;font-size:14px;cursor:pointer;opacity:0.5">Accept and continue</button>' +
          '<button type="button" id="lead-tos-signout" style="padding:11px 18px;border-radius:999px;border:1px solid rgba(255,255,255,0.08);background:transparent;color:#e8eaf2;font-size:14px;cursor:pointer">Sign me out</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    const cb = wrap.querySelector('#lead-tos-cb');
    const accept = wrap.querySelector('#lead-tos-accept');
    const signout = wrap.querySelector('#lead-tos-signout');

    cb.addEventListener('change', () => {
      accept.disabled = !cb.checked;
      accept.style.opacity = cb.checked ? '1' : '0.5';
      accept.style.cursor = cb.checked ? 'pointer' : 'not-allowed';
    });

    accept.addEventListener('click', async () => {
      accept.disabled = true; accept.textContent = 'Accepting…';
      try {
        await api('/auth/legal/accept', {
          method: 'POST',
          auth: true,
          body: { tos_version: detail?.current, privacy_version: detail?.current }
        });
        // Server returns a fresh JWT with updated tos_v claim; refresh
        wrap.remove();
        location.reload();
      } catch (err) {
        if (err.status === 412) {
          // Endpoint not yet wired — fall back to local update + reload
          // [CUSTOMIZE — wire /auth/legal/accept route to refresh the JWT]
          location.reload();
        } else {
          accept.disabled = false;
          accept.textContent = 'Accept and continue';
          toast(err.message || 'Failed to accept', 'error');
        }
      }
    });

    signout.addEventListener('click', () => {
      Auth.clear();
      wrap.remove();
      location.href = '/';
    });
  }

  // ---------- TOAST --------------------------------------------------------
  function toast(msg, kind = 'info', ms = 2800) {
    let host = document.getElementById('lead-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'lead-toast-host';
      // a11y: announce toasts to screen readers
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      host.setAttribute('aria-atomic', 'true');
      host.style.cssText = `
        position:fixed;top:80px;left:50%;transform:translateX(-50%);
        z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;`;
      document.body.appendChild(host);
    }
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `
      padding:12px 18px;border-radius:14px;font-size:13px;letter-spacing:0.02em;
      background:rgba(22,30,54,0.92);backdrop-filter:blur(14px);
      color:${kind==='error' ? '#ff5d73' : kind==='success' ? '#4ade80' : '#e8eaf2'};
      border:1px solid ${kind==='error' ? 'rgba(255,93,115,0.3)' : kind==='success' ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.08)'};
      box-shadow:0 18px 60px -20px rgba(0,0,0,0.6);
      animation:lead-toast-in 220ms cubic-bezier(0.2,0.9,0.2,1) both;
      pointer-events:auto;`;
    host.appendChild(t);
    setTimeout(() => {
      t.style.animation = 'lead-toast-out 200ms ease both';
      setTimeout(() => t.remove(), 250);
    }, ms);
  }

  // ---------- FIREBASE (Google Sign-In) -----------------------------------
  let _firebasePromise = null;
  async function loadFirebase() {
    if (!global.LEAD_FIREBASE_CONFIG || global.LEAD_FIREBASE_CONFIG.apiKey?.startsWith('REPLACE_ME')) {
      throw new Error('Google sign-in not configured yet');
    }
    if (_firebasePromise) return _firebasePromise;
    _firebasePromise = (async () => {
      const [{ initializeApp }, { getAuth, GoogleAuthProvider, signInWithPopup, signOut }] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js')
      ]);
      const app = initializeApp(global.LEAD_FIREBASE_CONFIG);
      const auth = getAuth(app);
      return { auth, GoogleAuthProvider, signInWithPopup, signOut };
    })();
    return _firebasePromise;
  }

  async function signInWithGoogle() {
    const fb = await loadFirebase();
    const provider = new fb.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    let result;
    try {
      result = await fb.signInWithPopup(fb.auth, provider);
    } catch (err) {
      // User cancelled the popup — not an error, just a no-op
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        const e = new Error('Sign-in cancelled');
        e.cancelled = true;
        throw e;
      }
      // Pop-up blocked
      if (err.code === 'auth/popup-blocked') {
        throw new Error('Pop-up blocked — allow pop-ups for cwleaders.com or use the email code instead.');
      }
      throw err;
    }
    const idToken = await result.user.getIdToken();
    const exchange = await api('/auth/firebase', { method: 'POST', body: { idToken } });
    Auth.set(exchange.jwt, exchange.user);
    return exchange.user;
  }

  // ---------- AUTH MODAL ---------------------------------------------------
  function openAuth({ onSuccess } = {}) {
    if (document.getElementById('lead-auth-modal')) return;
    const fbReady = global.LEAD_FIREBASE_CONFIG && !global.LEAD_FIREBASE_CONFIG.apiKey?.startsWith('REPLACE_ME');
    const wrap = document.createElement('div');
    wrap.id = 'lead-auth-modal';
    wrap.innerHTML = `
      <div class="lead-modal-bg"></div>
      <div class="lead-modal glass">
        <button class="lead-modal-close" aria-label="Close">×</button>
        <div class="lead-modal-eyebrow">SIGN IN</div>
        <h2>Welcome back.</h2>
        <p class="lead-modal-sub">One account works across all CW Leaders tools.</p>

        ${fbReady ? `
        <button type="button" class="lead-google-btn" id="lead-google-btn">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.997 10.997 0 0012 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 010-4.18V7.07H2.18a10.997 10.997 0 000 9.86l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
          </svg>
          <span>Continue with Google</span>
        </button>
        <div class="lead-divider"><span>or use email</span></div>
        ` : ''}

        <form id="lead-auth-step1" class="lead-modal-form">
          <input type="email" required placeholder="you@yourwork.com" autocomplete="email" />
          <button type="submit">Send code →</button>
        </form>
        <form id="lead-auth-step2" class="lead-modal-form" style="display:none">
          <div class="lead-modal-codeline">
            <div class="lead-modal-codedots">
              ${Array.from({length:6}).map((_,i)=>`<input type="text" inputmode="numeric" maxlength="1" data-idx="${i}" aria-label="Digit ${i+1}" />`).join('')}
            </div>
          </div>
          <button type="submit">Verify →</button>
          <button type="button" class="lead-modal-textbtn" id="lead-auth-back">use different email</button>
        </form>
      </div>`;
    document.body.appendChild(wrap);

    // Google Sign-In wiring (only if config present)
    const gbtn = wrap.querySelector('#lead-google-btn');
    if (gbtn) {
      gbtn.addEventListener('click', async () => {
        gbtn.disabled = true;
        gbtn.querySelector('span').textContent = 'Opening Google…';
        try {
          const user = await signInWithGoogle();
          toast(`Welcome, ${user.email}`, 'success');
          close();
          onSuccess?.(user);
        } catch (err) {
          if (err.cancelled || err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
            // User cancelled; quietly reset — no toast
          } else {
            toast(err.message || 'Google sign-in failed', 'error', 4000);
          }
          gbtn.disabled = false;
          gbtn.querySelector('span').textContent = 'Continue with Google';
        }
      });
    }

    const close = () => { wrap.remove(); };
    wrap.querySelector('.lead-modal-close').onclick = close;
    wrap.querySelector('.lead-modal-bg').onclick = close;
    // ESC key escape — Zero-Trap mandate
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const _origRemove = wrap.remove.bind(wrap);
    wrap.remove = () => { document.removeEventListener('keydown', onKey); _origRemove(); };
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }});

    let pendingEmail = '';
    const step1 = wrap.querySelector('#lead-auth-step1');
    const step2 = wrap.querySelector('#lead-auth-step2');
    const dots = [...wrap.querySelectorAll('.lead-modal-codedots input')];

    step1.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = step1.querySelector('button');
      const inp = step1.querySelector('input');
      const email = inp.value.trim().toLowerCase();
      btn.disabled = true; btn.textContent = 'Sending…';
      try {
        await api('/auth/request', { method: 'POST', body: { email }});
        pendingEmail = email;
        step1.style.display = 'none';
        step2.style.display = 'flex';
        dots[0].focus();
      } catch (err) {
        if (err.isRateLimit && err.retryAfter) {
          toast(`Please wait ${Math.ceil(err.retryAfter)}s and try again.`, 'error', 4000);
        } else {
          toast(err.message || 'send failed', 'error');
        }
      } finally {
        btn.disabled = false; btn.textContent = 'Send code →';
      }
    });

    dots.forEach((d, i) => {
      d.addEventListener('input', e => {
        d.value = d.value.replace(/\D/g, '').slice(0, 1);
        if (d.value && i < 5) dots[i+1].focus();
        if (dots.every(x => x.value)) step2.requestSubmit();
      });
      d.addEventListener('keydown', e => {
        if (e.key === 'Backspace' && !d.value && i > 0) dots[i-1].focus();
      });
      d.addEventListener('paste', e => {
        const txt = (e.clipboardData?.getData('text') || '').replace(/\D/g,'').slice(0,6);
        if (txt) {
          e.preventDefault();
          for (let j = 0; j < 6; j++) dots[j].value = txt[j] || '';
          (dots[Math.min(txt.length, 5)] || dots[0]).focus();
          if (dots.every(x => x.value)) step2.requestSubmit();
        }
      });
    });

    step2.addEventListener('submit', async e => {
      e.preventDefault();
      const code = dots.map(d => d.value).join('');
      if (code.length !== 6) return;
      const btn = step2.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Verifying…';
      try {
        const res = await api('/auth/verify', { method: 'POST', body: { email: pendingEmail, code }});
        Auth.set(res.jwt, res.user);
        toast(`Welcome, ${res.user.email}`, 'success');
        close();
        onSuccess?.(res.user);
      } catch (err) {
        if (err.isRateLimit && err.retryAfter) {
          toast(`Too many attempts. Wait ${Math.ceil(err.retryAfter)}s.`, 'error', 4000);
          // PRESERVE the typed code — user shouldn't have to retype while waiting
        } else if (err.status === 0) {
          // Network failure — preserve code so retry is one click
          toast(err.message, 'error');
        } else {
          toast(err.message || 'verify failed', 'error');
          dots.forEach(d => d.value = ''); dots[0].focus();
        }
      } finally {
        btn.disabled = false; btn.textContent = 'Verify →';
      }
    });

    wrap.querySelector('#lead-auth-back').onclick = () => {
      step2.style.display = 'none';
      step1.style.display = 'flex';
      step1.querySelector('input').focus();
    };

    // Inject a "Resend code" link on step 2 if missing — Zero-Trap exit route
    if (!wrap.querySelector('#lead-auth-resend')) {
      const resend = document.createElement('button');
      resend.type = 'button';
      resend.id = 'lead-auth-resend';
      resend.className = 'lead-modal-textbtn';
      resend.style.cssText = 'margin-left:12px';
      resend.textContent = 'resend code';
      let cooldownUntil = 0;
      resend.addEventListener('click', async () => {
        const now = Date.now();
        if (now < cooldownUntil) {
          toast(`Wait ${Math.ceil((cooldownUntil - now)/1000)}s before resending.`, 'info');
          return;
        }
        if (!pendingEmail) return;
        resend.disabled = true; resend.textContent = 'sending…';
        try {
          await api('/auth/request', { method: 'POST', body: { email: pendingEmail }});
          cooldownUntil = Date.now() + 30_000;
          toast('Code resent. Check your inbox.', 'success');
        } catch (err) {
          if (err.isRateLimit && err.retryAfter) {
            cooldownUntil = Date.now() + err.retryAfter * 1000;
            toast(`Wait ${Math.ceil(err.retryAfter)}s.`, 'error');
          } else {
            toast(err.message || 'resend failed', 'error');
          }
        } finally {
          resend.disabled = false; resend.textContent = 'resend code';
        }
      });
      const back = wrap.querySelector('#lead-auth-back');
      back?.parentNode?.insertBefore(resend, back.nextSibling);
    }
  }

  // ---------- CHECKOUT -----------------------------------------------------
  async function checkout(tier, opts = {}) {
    try {
      const body = { tier, ...opts };
      if (Auth.user?.email) body.email = Auth.user.email;
      const res = await api('/checkout/session', { method: 'POST', body, auth: true, timeoutMs: 12000 });
      // Validate before navigation — Zero-Trap mandate
      if (!res.url || typeof res.url !== 'string') {
        toast('Checkout could not start. Try again or contact hello@cwleaders.com.', 'error', 4500);
        return;
      }
      try {
        const u = new URL(res.url);
        // Only allow Stripe-hosted checkout (defense in depth — server already restricts)
        if (!/^(checkout\.stripe\.com|.*\.stripe\.com)$/i.test(u.hostname)) {
          toast('Unexpected checkout destination. Aborted.', 'error', 4500);
          return;
        }
      } catch {
        toast('Invalid checkout URL.', 'error', 4500);
        return;
      }
      window.location.href = res.url;
    } catch (err) {
      if (err.isCircuitOpen) {
        toast('Payments briefly unavailable. Try again in 30 seconds.', 'error', 5000);
      } else if (err.isRateLimit && err.retryAfter) {
        toast(`Slow down — please wait ${Math.ceil(err.retryAfter)}s.`, 'error', 4000);
      } else if (/stripe not configured/i.test(err.message)) {
        toast('Stripe not connected yet — keys pending', 'error', 4500);
      } else {
        toast(err.message || 'checkout failed', 'error');
      }
    }
  }

  // ---------- BURGER MENU --------------------------------------------------
  function wireBurger() {
    const b = document.getElementById('topnav-burger');
    if (!b || b.dataset.wired) return;
    const m = document.getElementById('topnav-menu');
    if (!m) return;
    b.dataset.wired = '1';
    b.addEventListener('click', () => {
      const open = m.classList.toggle('open');
      b.classList.toggle('open', open);
      b.setAttribute('aria-expanded', open);
    });
    // Close on link click (so taps on nav items hide the panel)
    m.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      m.classList.remove('open'); b.classList.remove('open');
      b.setAttribute('aria-expanded', 'false');
    }));
    // Close on outside tap
    document.addEventListener('click', e => {
      if (!m.contains(e.target) && !b.contains(e.target)) {
        m.classList.remove('open'); b.classList.remove('open');
        b.setAttribute('aria-expanded', 'false');
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireBurger);
  } else {
    wireBurger();
  }

  // ---------- COOKIE CONSENT BANNER ----------------------------------------
  const CONSENT_KEY = 'cw.consent';
  const CONSENT_VER = 1;
  function readConsent() {
    try { return JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null'); } catch { return null; }
  }
  function writeConsent(c) {
    try {
      const payload = { version: CONSENT_VER, at: new Date().toISOString(), ...c };
      localStorage.setItem(CONSENT_KEY, JSON.stringify(payload));
      document.dispatchEvent(new CustomEvent('lead-consent-change', { detail: payload }));
      return payload;
    } catch {}
  }
  function showConsentBanner() {
    if (document.getElementById('cw-consent-banner')) return;
    const wrap = document.createElement('div');
    wrap.id = 'cw-consent-banner';
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'Cookie and storage notice');
    wrap.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:9000;max-width:560px;margin:0 auto;padding:18px 22px;background:rgba(22,30,54,0.96);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,0.06);border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.45);font-family:Inter,system-ui,sans-serif;color:#e8eaf2;font-size:13px;line-height:1.55;';
    wrap.innerHTML =
      '<strong style="display:block;color:#e8eaf2;font-size:14px;margin-bottom:6px">We don\'t track you across the web.</strong>' +
      '<div style="color:#8a93b3;margin-bottom:14px">We use only strictly-necessary browser storage to keep you signed in and the apps working. No advertising. No cross-site tracking. Ever. <a href="/cookies" style="color:#fbbf24;text-decoration:none;border-bottom:1px dotted currentColor">Read more</a></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button type="button" id="cw-consent-ok" style="padding:8px 18px;border-radius:999px;border:none;background:#fbbf24;color:#0a0e1a;font-weight:600;font-size:13px;cursor:pointer">Got it</button>' +
        '<button type="button" id="cw-consent-manage" style="padding:8px 18px;border-radius:999px;border:1px solid rgba(255,255,255,0.08);background:transparent;color:#e8eaf2;font-size:13px;cursor:pointer">Manage details</button>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.querySelector('#cw-consent-ok').addEventListener('click', () => {
      writeConsent({ essential: true, analytics: false, marketing: false, method: 'banner-ok' });
      wrap.remove();
    });
    wrap.querySelector('#cw-consent-manage').addEventListener('click', () => {
      window.location.href = '/cookies';
    });
  }
  function maybeShowConsent() {
    const c = readConsent();
    if (!c || c.version !== CONSENT_VER) {
      // Defer 2 seconds so it doesn't compete with first-paint
      setTimeout(showConsentBanner, 2000);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeShowConsent);
  } else {
    maybeShowConsent();
  }

  // ---------- crypto.randomUUID fallback (Safari < 15.4, older browsers) ---
  if (!global.crypto?.randomUUID) {
    global.crypto = global.crypto || {};
    global.crypto.randomUUID = function () {
      const a = new Uint8Array(16);
      (global.crypto.getRandomValues || function(arr){ for(let i=0;i<arr.length;i++) arr[i]=Math.floor(Math.random()*256); })(a);
      a[6] = (a[6] & 0x0f) | 0x40; a[8] = (a[8] & 0x3f) | 0x80;
      const h = [...a].map(b => b.toString(16).padStart(2,'0'));
      return `${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10).join('')}`;
    };
  }

  // ---------- PERSONA PICKER ----------------------------------------------
  const PERSONAS = [
    { id: 'controller',  label: 'Manager',    sub: 'I lead a team',                     glyph: '🎯', accent: 'var(--c-creative)' },
    { id: 'subordinate', label: 'Team member', sub: 'I work with a team',                glyph: '🌿', accent: 'var(--c-theory)'   },
    { id: 'applicant',   label: 'Applicant',  sub: 'I\'m looking for my next role',     glyph: '🚀', accent: 'var(--c-frontend)' },
    { id: 'sharer',      label: 'File sharer', sub: 'I send files to clients & teams',  glyph: '📦', accent: 'var(--c-warning)'  },
    { id: 'recorder',    label: 'Creator',    sub: 'I record videos to teach or sell',  glyph: '🎬', accent: 'var(--c-backend)'  },
    { id: 'admin',       label: 'Org admin',  sub: 'I run things at company scale',     glyph: '🛡️', accent: 'var(--c-warning)'  },
  ];

  function openPersonaPicker({ onPick } = {}) {
    if (document.getElementById('lead-persona-modal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'lead-persona-modal';
    wrap.innerHTML = `
      <div class="lead-modal-bg"></div>
      <div class="lead-persona-card glass">
        <button class="lead-modal-close" aria-label="Close">×</button>
        <div class="lead-modal-eyebrow">PERSONALIZE</div>
        <h2>What brings you here?</h2>
        <p class="lead-modal-sub">Pick one and we'll tune Studio to your day. (You can change this anytime.)</p>
        <div class="lead-persona-grid">
          ${PERSONAS.map(p => `
            <button class="lead-persona-tile" data-persona="${p.id}">
              <span class="lead-persona-glyph" style="background:${p.accent};box-shadow:0 0 22px -2px ${p.accent}">${p.glyph}</span>
              <strong>${p.label}</strong>
              <small>${p.sub}</small>
            </button>
          `).join('')}
        </div>
        <button class="lead-persona-skip" type="button">Skip for now</button>
      </div>`;
    document.body.appendChild(wrap);
    function close() { wrap.remove(); }
    wrap.querySelector('.lead-modal-close').addEventListener('click', close);
    wrap.querySelector('.lead-modal-bg').addEventListener('click', close);
    wrap.querySelector('.lead-persona-skip').addEventListener('click', close);
    wrap.querySelectorAll('.lead-persona-tile').forEach(btn => {
      btn.addEventListener('click', async () => {
        const persona = btn.dataset.persona;
        btn.style.background = btn.querySelector('.lead-persona-glyph').style.background;
        btn.style.color = 'var(--void)';
        try {
          await api('/auth/profile', { method: 'POST', body: { persona } });
          if (Auth.user) Auth.user.persona = persona;
          document.dispatchEvent(new CustomEvent('lead-persona-change', { detail: { persona } }));
          toast(`Studio tuned for ${PERSONAS.find(p=>p.id===persona).label}.`, 'success');
          close();
          onPick?.(persona);
        } catch (err) {
          toast('Couldn\'t save: ' + err.message, 'error', 4000);
        }
      });
    });
  }

  async function setPersona(personaId) {
    await api('/auth/profile', { method: 'POST', body: { persona: personaId } });
    if (Auth.user) Auth.user.persona = personaId;
    document.dispatchEvent(new CustomEvent('lead-persona-change', { detail: { persona: personaId } }));
  }

  // ---------- EXPORTS ------------------------------------------------------
  global.LEAD = { CFG, Auth, api, toast, openAuth, checkout, wireBurger, signInWithGoogle,
                  openPersonaPicker, setPersona, PERSONAS };
})(window);
