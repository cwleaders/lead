// CW Leaders Studio — desktop shell.
// Calls Tauri commands defined in src-tauri/src/.

const { invoke } = window.__TAURI__.core;
const { open: openExternal } = window.__TAURI__.shell;

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

const state = {
  license: null,
  hardware: null,
  recording: null,
  recStartedAt: 0,
  clockTimer: null,
};

// ───────── Boot ──────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadLicense(), loadHardware()]);
  applyLicenseUI();
  applyHardwareUI();
  wireOnboarding();
  wireLicenseModal();
  wireSidenav();
  wireRecord();
  wireSend();
  wireHire();
  wireAgents();
  wireSettings();
  await refreshRecordings();
});

// ───────── License ──────────────────────────────────────────────────────
async function loadLicense() {
  try { state.license = await invoke('license_status'); }
  catch (e) { console.warn('license_status', e); state.license = { valid: false, tier: 'free', features: [] }; }
}
function applyLicenseUI() {
  const tier = state.license?.tier || 'free';
  const pill = $('#tier-pill');
  pill.textContent = tier.toUpperCase();
  pill.className = 'pill ' + ({
    free:    'pill-warn',
    studio:  'pill-warn',
    creator: 'pill-creator',
    pro:     'pill-pro',
    teams:   'pill-teams',
    enterprise: 'pill-pro'
  })[tier] || 'pill-warn';

  const summary = $('#license-summary');
  if (summary) {
    summary.textContent = state.license?.valid
      ? `${tier.charAt(0).toUpperCase() + tier.slice(1)} · ${state.license.offline_grace_days} days offline grace`
      : 'Free — unlock more by entering a key.';
  }
}

// ───────── Hardware ─────────────────────────────────────────────────────
async function loadHardware() {
  try { state.hardware = await invoke('system_capability_probe'); }
  catch (e) { console.warn('hw probe', e); state.hardware = null; }
}
function applyHardwareUI() {
  if (!state.hardware) return;
  const h = state.hardware;
  const pretty = `${h.cpu_brand}\n${h.cpu_cores} cores · ${(h.total_memory_mb/1024).toFixed(1)} GB RAM\n${h.os} ${h.os_version}\nMode: ${h.recommended_mode.toUpperCase()} · ${h.recommended_fps} fps · ${h.recommended_resolution}`;
  const txt = $('#hardware-detail-text');   if (txt) txt.textContent = pretty;
  const set = $('#settings-hardware');      if (set) set.textContent = `${h.recommended_mode.toUpperCase()} mode · ${h.recommended_fps} fps · ${h.recommended_resolution} · ${(h.total_memory_mb/1024).toFixed(1)} GB`;
  const fps = $('#record-fps');             if (fps) fps.textContent = `${h.recommended_fps} fps`;
  const rez = $('#record-resolution');      if (rez) rez.textContent = h.recommended_resolution;
  const pill = $('#hardware-pill');         if (pill) pill.textContent = h.recommended_mode.toUpperCase();
}

// ───────── Onboarding ───────────────────────────────────────────────────
function wireOnboarding() {
  $('#continue-free').addEventListener('click', enterShell);
  $('#enter-license').addEventListener('click', () => openLicenseModal());
  $('#open-pricing').addEventListener('click', () => openExternal('https://studio.cwleaders.com#pricing'));
  // Auto-skip onboarding if a valid license is already present
  if (state.license?.valid) enterShell();
}
function enterShell() {
  $('#onboarding').hidden = true;
  $('#shell').hidden = false;
}

// ───────── License modal ────────────────────────────────────────────────
function openLicenseModal() {
  $('#license-modal').hidden = false;
  setTimeout(() => $('#license-input').focus(), 100);
}
function closeLicenseModal() { $('#license-modal').hidden = true; }
function wireLicenseModal() {
  $('#license-modal-close').addEventListener('click', closeLicenseModal);
  $('#license-modal .modal-bg').addEventListener('click', closeLicenseModal);
  const input = $('#license-input');
  input.addEventListener('input', e => {
    const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
    e.target.value = v.match(/.{1,4}/g)?.join('-') || '';
  });
  $('#license-redeem').addEventListener('click', async () => {
    const btn = $('#license-redeem');
    const msg = $('#license-msg');
    btn.disabled = true; btn.textContent = 'Validating…';
    msg.textContent = ''; msg.className = 'msg';
    try {
      const result = await invoke('license_redeem', { key: input.value });
      state.license = result;
      applyLicenseUI();
      msg.textContent = `✓ Unlocked ${result.tier}.`;
      msg.className = 'msg success';
      setTimeout(() => { closeLicenseModal(); enterShell(); }, 800);
    } catch (e) {
      msg.textContent = String(e);
      msg.className = 'msg error';
    } finally {
      btn.disabled = false; btn.textContent = 'Unlock →';
    }
  });
}

// ───────── Sidenav ──────────────────────────────────────────────────────
function wireSidenav() {
  $$('.navbtn').forEach(btn => btn.addEventListener('click', () => {
    if (!btn.dataset.tab) return; // Studio Hub button doesn't switch panels
    const tab = btn.dataset.tab;
    $$('.navbtn').forEach(b => b.classList.toggle('active', b === btn));
    $$('#shell > .panel').forEach(p => p.hidden = p.dataset.panel !== tab);
  }));
  // Studio Hub external opener
  const studioBtn = document.getElementById('open-studio-hub');
  if (studioBtn) {
    studioBtn.addEventListener('click', () => openExternal('https://studio.cwleaders.com'));
  }
}

// ───────── Record ───────────────────────────────────────────────────────
function wireRecord() {
  $('#record-go').addEventListener('click', startRecording);
  $('#record-stop').addEventListener('click', stopRecording);
  $('#open-recordings').addEventListener('click', () => invoke('recordings_open_folder'));
}
async function startRecording() {
  const check = await invoke('capture_check').catch(() => null);
  if (!check?.ffmpeg_available) {
    return toast('ffmpeg is required for recording. Install it from ffmpeg.org or via Homebrew/Chocolatey, then restart Studio.', 'error', 7000);
  }
  try {
    const opts = {
      fps: state.hardware?.recommended_fps || 24,
      max_minutes: 0,
      include_audio: false,
    };
    const started = await invoke('capture_start', { opts });
    state.recording = started;
    state.recStartedAt = Date.now();
    $('#record-status').textContent = 'Recording';
    $('#record-status').classList.add('live');
    $('#record-clock').classList.add('live');
    $('#record-go').hidden = true;
    $('#record-stop').hidden = false;
    state.clockTimer = setInterval(updateClock, 200);
    toast('Recording started', 'success', 1800);
  } catch (e) {
    toast(String(e), 'error');
  }
}
function updateClock() {
  const elapsed = Math.floor((Date.now() - state.recStartedAt) / 1000);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  $('#record-clock').textContent = `${mm}:${ss}`;
}
async function stopRecording() {
  try {
    const result = await invoke('capture_stop');
    clearInterval(state.clockTimer);
    state.recording = null;
    $('#record-status').textContent = 'Saved';
    $('#record-status').classList.remove('live');
    $('#record-clock').classList.remove('live');
    $('#record-clock').textContent = '00:00';
    $('#record-go').hidden = false;
    $('#record-stop').hidden = true;
    toast(`Saved ${formatBytes(result.size_bytes)} · ${result.duration_secs}s`, 'success', 4000);
    refreshRecordings();
  } catch (e) {
    toast(String(e), 'error');
  }
}
async function refreshRecordings() {
  try {
    const recs = await invoke('recordings_list');
    const grid = $('#recordings-list');
    if (!recs.length) {
      grid.innerHTML = '<p class="muted small">Your recordings will appear here.</p>';
      return;
    }
    grid.innerHTML = recs.map(r => `
      <article class="rec-card">
        <div class="rec-name" title="${escapeHtml(r.path)}">${escapeHtml(r.name)}</div>
        <div class="rec-meta">${formatBytes(r.size_bytes)} · ${formatRelative(r.created_secs)}</div>
        <div class="rec-actions">
          <button data-action="upload" data-path="${escapeAttr(r.path)}">Share →</button>
          <button data-action="delete" data-path="${escapeAttr(r.path)}" class="danger">Delete</button>
        </div>
      </article>`).join('');
    grid.querySelectorAll('button[data-action]').forEach(b => {
      b.addEventListener('click', () => {
        const action = b.dataset.action;
        const path = b.dataset.path;
        if (action === 'upload') openExternal('https://upload.cwleaders.com');
        if (action === 'delete') deleteRec(path);
      });
    });
  } catch (e) { console.warn('recordings_list', e); }
}
async function deleteRec(path) {
  if (!confirm('Delete this recording? This cannot be undone.')) return;
  try { await invoke('recordings_delete', { path }); refreshRecordings(); toast('Deleted'); }
  catch (e) { toast(String(e), 'error'); }
}

// ───────── Send ─────────────────────────────────────────────────────────
function wireSend() {
  const zone = $('#send-dropzone');
  $('#send-browse').addEventListener('click', () => openExternal('https://upload.cwleaders.com'));
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) {
      toast(`Native upload coming next release. Opening web uploader for ${e.dataTransfer.files[0].name}`, 'info', 4500);
      openExternal('https://upload.cwleaders.com');
    }
  });
}

// ───────── Hire ─────────────────────────────────────────────────────────
function wireHire() {
  $('#open-hire').addEventListener('click', () => openExternal('https://myhire.cwleaders.com'));
}

// ───────── Agents ───────────────────────────────────────────────────────
function wireAgents() {
  $$('.agent-card[data-agent]').forEach(card => {
    card.querySelector('.agent-launch').addEventListener('click', () => {
      const agent = card.dataset.agent;
      const messages = {
        capture: 'Capture armed. Start a recording — I\'ll auto-tag the action items locally.',
        courier: 'Courier armed. Drop a file in Send and I\'ll handle scheduled delivery.',
        triage:  'Triage armed. Configure target jobs in Settings (next release).',
        coach:   'Coach armed. End-of-day debrief scheduled.',
        bridge:  'Bridge armed. Connect Slack/Notion/Webhooks in Settings (next release).',
      };
      toast(messages[agent] || 'Agent armed.', 'success', 4500);
    });
  });
}

// ───────── Settings ─────────────────────────────────────────────────────
function wireSettings() {
  $('#settings-redeem').addEventListener('click', openLicenseModal);
  $('#settings-clear-license').addEventListener('click', async () => {
    if (!confirm('Sign out of your license? You can re-enter your key any time.')) return;
    try {
      await invoke('license_clear');
      state.license = { valid: false, tier: 'free', features: [], offline_grace_days: 0 };
      applyLicenseUI();
      toast('License cleared');
    } catch (e) { toast(String(e), 'error'); }
  });
  $('#open-recordings-2').addEventListener('click', () => invoke('recordings_open_folder'));
  $('#check-updates').addEventListener('click', async () => {
    try {
      const result = await invoke('check_for_update');
      toast(result.message, result.available ? 'success' : 'info', 4000);
    } catch (e) { toast(String(e), 'error'); }
  });
}

// ───────── Helpers ──────────────────────────────────────────────────────
function toast(msg, kind='info', ms=2800) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toast-region').appendChild(el);
  setTimeout(() => el.remove(), ms);
}
function formatBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`;
  if (n < 1024*1024*1024) return `${(n/1024/1024).toFixed(1)} MB`;
  return `${(n/1024/1024/1024).toFixed(2)} GB`;
}
function formatRelative(secs) {
  const ago = Math.floor(Date.now()/1000) - secs;
  if (ago < 60) return 'just now';
  if (ago < 3600) return `${Math.floor(ago/60)}m ago`;
  if (ago < 86400) return `${Math.floor(ago/3600)}h ago`;
  return `${Math.floor(ago/86400)}d ago`;
}
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s); }
