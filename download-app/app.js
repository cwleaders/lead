/* download.cwleaders.com — Visual Receipt viewer
   URL shapes:
     /                 → empty state
     /{shareToken}     → fetch /files/{token} → render receipt + download button
*/

const CFG = {
  api: window.LEAD_API || 'https://api.cwleaders.com'
};

const views = {
  loading: document.getElementById('view-loading'),
  empty:   document.getElementById('view-empty'),
  file:    document.getElementById('view-file'),
  error:   document.getElementById('view-error')
};
function show(name) {
  Object.entries(views).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
}

const path = location.pathname.replace(/^\/+|\/+$/g, '');
const token = path.split('/')[0];

if (!token) {
  show('empty');
} else {
  loadFile(token);
}

async function loadFile(token) {
  show('loading');
  // Timeout watchdog — Zero-Trap: never let loading state persist forever
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const fromParam = new URLSearchParams(location.search).get('from') || document.referrer || '';
    const headers = {};
    if (fromParam) headers['x-lead-from'] = fromParam.slice(0, 200);
    const r = await fetch(`${CFG.api}/files/${encodeURIComponent(token)}`, { headers, signal: ctrl.signal });
    clearTimeout(timer);
    if (r.status === 404 || r.status === 410) return failWith('Link not found or already expired.');
    if (r.status === 429) return failWith('Too many requests — please wait a moment and refresh.');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const meta = await r.json();
    if (!meta || typeof meta !== 'object') return failWith('Received an empty response. Try again.');
    render(meta);
  } catch (err) {
    clearTimeout(timer);
    console.error(err);
    if (err.name === 'AbortError') {
      failWith('Server is slow to respond. Refresh to try again.');
    } else {
      failWith("Couldn't reach the server. Try again in a moment.");
    }
  }
}

function failWith(msg) {
  document.getElementById('errmsg').textContent = msg;
  show('error');
}

// Mobile menu wiring
(() => {
  const b = document.getElementById('topnav-burger');
  const m = document.getElementById('topnav-menu');
  if (b && m) b.addEventListener('click', () => {
    const open = m.classList.toggle('open');
    b.setAttribute('aria-expanded', open);
    b.classList.toggle('open', open);
  });
})();

function render(meta) {
  document.getElementById('filename').textContent = meta.name || 'file';
  document.getElementById('filesize').textContent = formatBytes(meta.size || 0);
  document.getElementById('filetype').textContent = (meta.type || 'application/octet-stream').split('/').pop().toUpperCase();
  document.getElementById('fileexp').textContent  = meta.expiresAt
    ? `expires ${formatRelative(meta.expiresAt)}`
    : 'permanent';

  const receipt = document.getElementById('receipt');
  const ext = (meta.name || '').split('.').pop().slice(0, 4).toUpperCase() || 'FILE';

  // Helper: graceful fallback to ext glyph if preview asset fails
  const fallbackToExt = () => { receipt.innerHTML = ''; receipt.textContent = ext; };

  if (meta.previewUrl && /^image\//.test(meta.type || '')) {
    const img = new Image();
    img.alt = meta.name || 'preview';
    img.onerror = fallbackToExt;
    img.src = meta.previewUrl;
    receipt.innerHTML = '';
    receipt.appendChild(img);
  } else if (meta.previewUrl && /^video\//.test(meta.type || '')) {
    const v = document.createElement('video');
    v.controls = true;
    v.preload = 'metadata';
    v.onerror = fallbackToExt;
    v.src = meta.previewUrl;
    receipt.innerHTML = '';
    receipt.appendChild(v);
  } else if (meta.previewUrl) {
    const img = new Image();
    img.onerror = fallbackToExt;
    img.src = meta.previewUrl;
    receipt.innerHTML = '';
    receipt.appendChild(img);
  } else {
    receipt.textContent = ext;
  }

  document.getElementById('dl-btn').addEventListener('click', async () => {
    const params = new URLSearchParams(location.search);
    const fromParam = params.get('from') || document.referrer || '';
    if (fromParam) {
      try { sessionStorage.setItem('lead.refchain', fromParam); } catch {}
    }
    // Validate destination URL — Zero-Trap: never navigate to undefined
    const target = (meta.downloadUrl && typeof meta.downloadUrl === 'string')
      ? meta.downloadUrl
      : `${CFG.api}/files/${encodeURIComponent(token)}/dl`;
    try {
      // sanity-check it parses
      new URL(target, location.origin);
      window.location.href = target;
    } catch {
      failWith('Download link is malformed. Refresh and try again.');
    }
  });

  // Personalize the "Send back" CTA with the original sender's token if present
  const back = document.getElementById('back-cta');
  if (back) {
    const params = new URLSearchParams(location.search);
    const url = new URL(back.href);
    url.searchParams.set('from', `dl:${token}`);
    if (params.get('utm_source')) url.searchParams.set('utm_source', params.get('utm_source'));
    back.href = url.toString();
  }

  show('file');
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n/1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n/1024/1024).toFixed(1)} MB`;
  return `${(n/1024/1024/1024).toFixed(2)} GB`;
}
function formatRelative(iso) {
  const d = new Date(iso); const ms = d - Date.now();
  if (ms <= 0) return 'now';
  const h = Math.floor(ms / 36e5);
  if (h < 24) return `in ${h}h`;
  return `in ${Math.floor(h/24)}d`;
}
