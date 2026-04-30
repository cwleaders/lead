/* Lightweight in-memory circuit breaker for outbound HTTP calls.
   Per-Lambda-instance state — Lambda isolation means each instance learns
   independently, which is fine for our scale (graceful degradation > coordination).

   Usage:
     import { withBreaker, fetchWithTimeout } from './_breaker.mjs';
     const data = await withBreaker('gemini', async () => {
       const r = await fetchWithTimeout('https://...', { ... }, 8000);
       if (!r.ok) throw new Error('upstream ' + r.status);
       return r.json();
     });
*/

const STATE = new Map(); // name -> { failures, openedAt, status }

const DEFAULT = {
  failureThreshold: 5,        // open after N consecutive failures
  cooldownMs: 30_000,         // stay open this long before half-open probe
  halfOpenSuccessReset: 1     // 1 successful probe → close
};

function get(name) {
  let s = STATE.get(name);
  if (!s) {
    s = { failures: 0, openedAt: 0, status: 'closed', config: { ...DEFAULT } };
    STATE.set(name, s);
  }
  return s;
}

export function configureBreaker(name, opts = {}) {
  const s = get(name);
  s.config = { ...DEFAULT, ...opts };
}

export function breakerStatus(name) {
  const s = get(name);
  const now = Date.now();
  if (s.status === 'open' && (now - s.openedAt) >= s.config.cooldownMs) {
    s.status = 'half-open';
  }
  return { name, status: s.status, failures: s.failures, openedAt: s.openedAt };
}

export async function withBreaker(name, fn, opts = {}) {
  const s = get(name);
  const cfg = { ...s.config, ...opts };
  s.config = cfg;

  // Re-check status (auto-transition open → half-open on cooldown elapsed)
  breakerStatus(name);

  if (s.status === 'open') {
    const err = new Error(`circuit_open:${name}`);
    err.code = 'CIRCUIT_OPEN';
    err.breaker = name;
    throw err;
  }

  try {
    const result = await fn();
    // Success path
    if (s.status === 'half-open') {
      s.status = 'closed';
      s.failures = 0;
    } else {
      s.failures = 0;
    }
    return result;
  } catch (err) {
    s.failures += 1;
    if (s.failures >= cfg.failureThreshold) {
      s.status = 'open';
      s.openedAt = Date.now();
      console.warn(`[breaker:${name}] OPEN after ${s.failures} failures: ${err.message}`);
    }
    throw err;
  }
}

/** fetch() with AbortController-backed timeout. Throws on timeout. */
export async function fetchWithTimeout(url, init = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
