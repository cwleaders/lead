/* upload.cwleaders.com — Mind-Free uploader
   Flow:
     1. user drops/picks/pastes file(s)
     2. POST /files/presign  → { uploadUrl, fileId, downloadUrl, parts? }
     3. PUT (or multipart PUT) the bytes directly to S3
     4. POST /files/complete → { downloadUrl, receiptUrl }
     5. card flips to copy-link state
*/

const CFG = {
  api:  window.LEAD_API  || 'https://api.cwleaders.com',
  cdn:  window.LEAD_CDN  || 'https://download.cwleaders.com',
  partSize: 8 * 1024 * 1024, // 8MB multipart threshold
  multipartAt: 16 * 1024 * 1024
};

const $ = sel => document.querySelector(sel);
const dropEl    = $('#drop');
const canvasEl  = $('#canvas');
const gridEl    = $('#grid');
const overlay   = $('#overlay');
const pickBtn   = $('#pick');
const fileInput = $('#file-input');
const newBtn    = $('#new-upload');

// ---------- input wiring --------------------------------------------------
pickBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => handleFiles(e.target.files));
newBtn.addEventListener('click', () => fileInput.click());

const upgradeLink = document.getElementById('upgrade-link');
if (upgradeLink) upgradeLink.addEventListener('click', e => {
  e.preventDefault();
  if (window.LEAD) window.LEAD.openAuth({ onSuccess: () => {
    const meta = document.getElementById('meta');
    if (meta) meta.textContent = '✓ You\'re signed in · 5 GB free · your files stay forever';
  }});
});

let dragDepth = 0;
['dragenter', 'dragover'].forEach(evt =>
  document.addEventListener(evt, e => {
    e.preventDefault();
    if (evt === 'dragenter') dragDepth++;
    overlay.classList.add('active');
  })
);
['dragleave', 'drop'].forEach(evt =>
  document.addEventListener(evt, e => {
    e.preventDefault();
    if (evt === 'dragleave') {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) overlay.classList.remove('active');
    } else {
      dragDepth = 0;
      overlay.classList.remove('active');
    }
  })
);
document.addEventListener('drop', e => {
  if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
});
document.addEventListener('paste', e => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) handleFiles(files);
});

// ---------- core upload pipeline ------------------------------------------
function handleFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  if (canvasEl.classList.contains('hidden')) {
    canvasEl.classList.remove('hidden');
    dropEl.style.display = 'none';
  }
  files.forEach(uploadFile);
}

async function uploadFile(file) {
  const card = createCard(file);
  gridEl.prepend(card.el);
  const abortController = new AbortController();
  card.bindAbort(abortController);

  try {
    // 1. presign
    const presign = await api('/files/presign', {
      method: 'POST',
      body: { name: file.name, size: file.size, type: file.type || 'application/octet-stream' },
      signal: abortController.signal
    });

    // 2. upload bytes
    card.bindAbort(abortController);
    if (file.size >= CFG.multipartAt && presign.parts) {
      await multipartUpload(file, presign, card, abortController.signal);
    } else {
      await singleUpload(file, presign, card, abortController.signal);
    }

    // 3. complete
    const done = await api('/files/complete', {
      method: 'POST',
      body: { fileId: presign.fileId, etags: card.etags },
      signal: abortController.signal
    });

    card.complete(done.downloadUrl || `${CFG.cdn}/${presign.fileId}`);
  } catch (err) {
    if (err.name === 'AbortError' || err.aborted) {
      card.cancelled();
    } else {
      console.error(err);
      // Offer retry — Zero-Trap mandate
      card.fail(err.userMessage || err.message || 'Upload failed', () => {
        card.el.remove();
        uploadFile(file);
      });
    }
  }
}

async function singleUpload(file, presign, card, signal) {
  await xhrPut(presign.uploadUrl, file, p => card.progress(p), signal);
  card.etags = null;
}

async function multipartUpload(file, presign, card, signal) {
  const etags = [];
  const totalParts = presign.parts.length;
  let totalSent = 0;
  for (let i = 0; i < totalParts; i++) {
    if (signal?.aborted) {
      const e = new Error('aborted'); e.aborted = true; throw e;
    }
    const part = presign.parts[i];
    const start = i * CFG.partSize;
    const end = Math.min(start + CFG.partSize, file.size);
    const chunk = file.slice(start, end);
    const etag = await xhrPut(part.url, chunk, p => {
      card.progress((totalSent + p * chunk.size) / file.size);
    }, signal);
    totalSent += chunk.size;
    etags.push({ partNumber: part.partNumber, etag });
  }
  card.etags = etags;
}

/* xhrPut now supports AbortController + a stall timeout (no progress in 60s = fail) */
function xhrPut(url, body, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    let lastProgressAt = Date.now();
    const stallMs = 60_000;
    const stallTimer = setInterval(() => {
      if (Date.now() - lastProgressAt > stallMs) {
        clearInterval(stallTimer);
        try { xhr.abort(); } catch {}
        reject(new Error('Upload stalled — check your connection.'));
      }
    }, 5000);
    function cleanup() { clearInterval(stallTimer); }
    if (signal) {
      if (signal.aborted) { cleanup(); try { xhr.abort(); } catch {}; const e = new Error('aborted'); e.aborted = true; return reject(e); }
      signal.addEventListener('abort', () => { cleanup(); try { xhr.abort(); } catch {}; const e = new Error('aborted'); e.aborted = true; reject(e); });
    }
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) {
        lastProgressAt = Date.now();
        onProgress(e.loaded / e.total);
      }
    };
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.getResponseHeader('ETag')?.replace(/"/g, '') || '');
      } else if (xhr.status === 413) {
        reject(Object.assign(new Error('File too large for this plan.'), { userMessage: 'File too large for this plan.' }));
      } else {
        reject(new Error(`Upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => { cleanup(); reject(new Error('network')); };
    xhr.send(body);
  });
}

async function api(path, { method = 'GET', body, signal, timeoutMs = 15000 } = {}) {
  const headers = { 'content-type': 'application/json' };
  const tok = window.LEAD?.Auth?.token;
  if (tok) headers.authorization = `Bearer ${tok}`;
  const ctrl = signal ? null : new AbortController();
  const sig = signal || ctrl?.signal;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  let r;
  try {
    r = await fetch(`${CFG.api}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: sig
    });
  } catch (err) {
    if (timer) clearTimeout(timer);
    if (err.name === 'AbortError') {
      const e = new Error('Request timed out'); e.aborted = signal?.aborted; throw e;
    }
    throw new Error("Couldn't reach the server. Check your connection and retry.");
  }
  if (timer) clearTimeout(timer);
  let data;
  try { data = await r.json(); } catch { data = {}; }
  if (!r.ok) {
    const msg = data.error
      || (r.status === 413 ? 'File too large.' : null)
      || (r.status === 429 ? 'Too many uploads — slow down.' : null)
      || (r.status === 401 ? 'Sign in to upload larger files.' : null)
      || `Upload failed (HTTP ${r.status})`;
    const e = new Error(msg); e.userMessage = msg; e.status = r.status;
    throw e;
  }
  return data;
}

// ---------- card UI -------------------------------------------------------
function createCard(file) {
  const ext = file.name.split('.').pop().slice(0, 4).toUpperCase();
  const isImage = file.type.startsWith('image/');
  const el = document.createElement('article');
  el.className = 'card';
  el.innerHTML = `
    <div class="receipt">${isImage ? '' : ext}</div>
    <div class="filename" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
    <div class="filemeta">
      <span class="pill">${formatBytes(file.size)}</span>
      <span class="pill state">uploading…</span>
    </div>
    <div class="progress"><i></i></div>
  `;
  const bar = el.querySelector('.progress > i');
  const state = el.querySelector('.state');
  const receipt = el.querySelector('.receipt');

  if (isImage) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    receipt.appendChild(img);
  }

  return {
    el,
    etags: null,
    progress(p) {
      bar.style.width = Math.min(100, p * 100).toFixed(1) + '%';
    },
    complete(url) {
      bar.style.width = '100%';
      state.textContent = 'live';
      state.style.background = 'rgba(74,222,128,0.18)';
      state.style.color = 'var(--c-theory)';
      const linkrow = document.createElement('div');
      linkrow.className = 'linkrow';
      linkrow.innerHTML = `
        <input readonly value="${url}" />
        <button class="copy">Copy</button>
      `;
      const btn = linkrow.querySelector('.copy');
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(url);
          btn.classList.add('copied');
          btn.textContent = 'Copied';
          setTimeout(() => { btn.classList.remove('copied'); btn.textContent = 'Copy'; }, 1400);
        } catch {
          linkrow.querySelector('input').select();
          document.execCommand('copy');
        }
      });
      el.querySelector('.progress').replaceWith(linkrow);
    },
    fail(msg, onRetry) {
      el.classList.add('error');
      state.textContent = msg;
      bar.parentElement.style.display = 'none';
      // Attach a retry button — Zero-Trap mandate
      if (onRetry && !el.querySelector('.retrybtn')) {
        const row = document.createElement('div');
        row.className = 'linkrow';
        row.innerHTML = `<button class="retrybtn" type="button">Retry</button><button class="retrybtn ghost" type="button" data-x>Remove</button>`;
        const [retry, remove] = row.querySelectorAll('button');
        retry.addEventListener('click', () => onRetry());
        remove.addEventListener('click', () => el.remove());
        el.appendChild(row);
      }
    },
    cancelled() {
      el.classList.add('error');
      state.textContent = 'Cancelled';
      bar.parentElement.style.display = 'none';
      if (!el.querySelector('.retrybtn')) {
        const row = document.createElement('div');
        row.className = 'linkrow';
        row.innerHTML = `<button class="retrybtn ghost" type="button">Dismiss</button>`;
        row.querySelector('button').addEventListener('click', () => el.remove());
        el.appendChild(row);
      }
    },
    bindAbort(controller) {
      // Add a small "cancel" affordance to the in-flight card
      if (el.querySelector('.cancelbtn')) return;
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'cancelbtn';
      x.setAttribute('aria-label', 'Cancel upload');
      x.style.cssText = 'position:absolute;top:8px;right:8px;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,0.08);color:#e8eaf2;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;border:1px solid rgba(255,255,255,0.06);';
      x.textContent = '×';
      x.addEventListener('click', () => { try { controller.abort(); } catch {} });
      el.style.position = 'relative';
      el.appendChild(x);
    }
  };
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n/1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n/1024/1024).toFixed(1)} MB`;
  return `${(n/1024/1024/1024).toFixed(2)} GB`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
