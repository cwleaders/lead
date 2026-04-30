/* studio.cwleaders.com — Unified dashboard logic
   - Pulls /auth/me for user, plan, entitlements, usage
   - Renders status strip, tool stats, plan-aware tool cards
   - Buy buttons → LEAD.checkout(plan)
   - Foundation agent launches (toast for now; full runtime in Sprint C) */

(() => {
  const API = window.LEAD_API || 'https://api.cwleaders.com';
  const $ = sel => document.querySelector(sel);
  const signedIn  = $('#signed-in');
  const signedOut = $('#signed-out');

  document.getElementById('yr').textContent = new Date().getFullYear();

  // Register service worker for PWA install
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // OS detection for the Download CTA
  (() => {
    const ua = navigator.userAgent.toLowerCase();
    let label = 'Download for your platform →';
    if (ua.includes('mac')) label = 'Download for Mac →';
    else if (ua.includes('win')) label = 'Download for Windows →';
    else if (ua.includes('linux')) label = 'Download for Linux →';
    const t = document.getElementById('dl-primary-text');
    if (t) t.textContent = label;
  })();

  // ───────── BOOT ────────────────────────────────────────────────────────
  async function boot() {
    if (!window.LEAD?.Auth?.token) {
      showSignedOut();
      return;
    }
    try {
      const data = await window.LEAD.api('/auth/me');
      renderSignedIn(data);
    } catch (err) {
      console.warn('auth/me failed', err);
      try { window.LEAD.Auth.clear(); } catch {}
      showSignedOut();
    }
  }

  // ───────── SIGNED-OUT ──────────────────────────────────────────────────
  function showSignedOut() {
    signedOut.hidden = false;
    signedIn.hidden  = true;
    const cta = document.getElementById('signed-out-cta');
    if (cta) cta.onclick = () => window.LEAD?.openAuth({ onSuccess: () => location.reload() });
    const nav = document.getElementById('account-link');
    if (nav) nav.onclick = e => {
      e.preventDefault();
      window.LEAD?.openAuth({ onSuccess: () => location.reload() });
    };
  }

  // ───────── SIGNED-IN ───────────────────────────────────────────────────
  function renderSignedIn(data) {
    signedOut.hidden = true;
    signedIn.hidden  = false;

    const user = data.user;
    const ent  = data.entitlements;
    const use  = data.usage;

    // Persona-aware hero (and prompt picker on first sign-in)
    if (!user.persona) {
      // Defer slightly so the rest of the dashboard renders first
      setTimeout(() => window.LEAD?.openPersonaPicker({
        onPick: () => { user.persona = window.LEAD.Auth.user?.persona; renderPersonaHero(user.persona, use); }
      }), 600);
    } else {
      renderPersonaHero(user.persona, use);
    }
    document.addEventListener('lead-persona-change', e => {
      renderPersonaHero(e.detail.persona, use);
    }, { once: false });

    // Persona switcher button
    const switchBtn = document.getElementById('persona-switch-btn');
    if (switchBtn && !switchBtn.dataset.wired) {
      switchBtn.dataset.wired = '1';
      switchBtn.addEventListener('click', () => window.LEAD?.openPersonaPicker());
    }

    // Top nav account button
    const nav = document.getElementById('account-link');
    if (nav) {
      const initial = (user.email || '?')[0].toUpperCase();
      nav.outerHTML =
        `<a href="#account" class="lead-account-btn" id="account-pill"><span class="avi">${initial}</span><span>${escapeHtml(user.email.split('@')[0])}</span></a>`;
    }

    // Greeting strip
    const aviEl = document.getElementById('status-avi');
    if (user.photoURL) {
      aviEl.innerHTML = `<img src="${user.photoURL}" alt="" referrerpolicy="no-referrer">`;
    } else {
      aviEl.textContent = (user.displayName || user.email)[0].toUpperCase();
    }
    document.getElementById('status-name').textContent =
      user.displayName ? `Welcome back, ${user.displayName.split(' ')[0]}.` : 'Welcome back.';
    document.getElementById('status-email').textContent = user.email;
    document.getElementById('account-email').textContent = user.email;

    // Plan badge
    const planLabel = ent.label || 'Free';
    document.getElementById('meter-plan').textContent = planLabel;
    if (user.plan === 'free' || user.plan === 'studio') {
      document.getElementById('upgrade-cta').textContent = 'Upgrade →';
    } else {
      document.getElementById('upgrade-cta').textContent = 'Manage plan →';
    }

    // Credits meter
    const creditsAllotted = use.aiCredits.monthlyAllotment;
    const creditsUsed = use.aiCredits.consumedThisMonth || 0;
    const creditsPct = Math.min(100, (creditsUsed / Math.max(1, creditsAllotted)) * 100);
    document.getElementById('meter-credits-bar').style.width = creditsPct + '%';
    document.getElementById('meter-credits').textContent =
      `${formatNum(creditsUsed)} / ${formatNum(creditsAllotted)}`;

    // Storage meter
    const storeUsed = use.files.usedBytes;
    const storeMax = ent.files.lifetimeBytes;
    if (storeMax === -1) {
      document.getElementById('meter-storage-bar').style.width = '12%';
      document.getElementById('meter-storage').textContent = `${formatBytes(storeUsed)} · unlimited`;
    } else {
      const storePct = Math.min(100, (storeUsed / storeMax) * 100);
      document.getElementById('meter-storage-bar').style.width = storePct + '%';
      document.getElementById('meter-storage').textContent =
        `${formatBytes(storeUsed)} / ${formatBytes(storeMax)}`;
    }

    // Tool stats
    document.getElementById('stat-send').textContent =
      `${use.files.count} files shared · ${use.files.downloads} downloads`;
    document.getElementById('stat-receive').textContent =
      use.files.downloads
        ? `${use.files.downloads} download${use.files.downloads === 1 ? '' : 's'} on your links`
        : 'Recipients see clean previews';
    document.getElementById('stat-lead').textContent =
      ent.lead.maxRecordingMinutes === -1
        ? 'Unlimited recording length'
        : `${ent.lead.maxRecordingMinutes}-minute recordings`;
    document.getElementById('stat-myhire').textContent =
      ent.myhire.canPostJobs
        ? `Post unlimited jobs · ${ent.myhire.activeApplicants === -1 ? 'unlimited' : ent.myhire.activeApplicants} applicants`
        : 'Browse open jobs · upgrade to post';

    // Command card — gate based on plan
    const cmdCard = document.getElementById('card-command');
    const cmdBadge = document.getElementById('command-badge');
    const cmdStat = document.getElementById('stat-command');
    const cmdSeats = ent.command.maxMonitoredSeats;
    if (cmdSeats === 0) {
      cmdCard.style.opacity = '0.55';
      cmdBadge.textContent = 'Pro';
      cmdStat.textContent = 'Upgrade to Creator+ to use Command';
      cmdCard.onclick = e => {
        e.preventDefault();
        document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' });
      };
    } else {
      cmdCard.style.opacity = '1';
      cmdBadge.textContent = ent.label;
      cmdStat.textContent = `${cmdSeats === -1 ? 'Unlimited' : cmdSeats} monitored seats`;
    }

    // Buy buttons — disable current plan, hide downgrades
    const planRank = { free: 0, studio: 1, creator: 2, pro: 3, teams: 4, enterprise: 5 };
    const myRank = planRank[user.plan] ?? 0;
    document.querySelectorAll('button.plan-buy[data-buy]').forEach(btn => {
      const targetPlan = btn.getAttribute('data-buy');
      const targetRank = planRank[targetPlan] ?? 0;
      if (targetPlan === user.plan) {
        btn.textContent = '✓ Current plan';
        btn.disabled = true;
        btn.style.opacity = '0.6';
      } else if (targetRank < myRank) {
        btn.textContent = 'Downgrade';
        btn.style.opacity = '0.7';
      }
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        if (window.LEAD?.checkout) window.LEAD.checkout(targetPlan);
      });
    });

    // Live agents — wired in renderAgents()
    refreshAgents();
    document.getElementById('refresh-agents').addEventListener('click', refreshAgents);

    // Account actions
    document.getElementById('copy-id').onclick = async () => {
      try {
        await navigator.clipboard.writeText(user.id);
        toast('Account ID copied');
      } catch { toast('Copy failed', 'error'); }
    };
    document.getElementById('sign-out').onclick = () => {
      try { window.LEAD?.Auth?.clear(); } catch {}
      location.reload();
    };
  }

  // ───────── AGENTS ──────────────────────────────────────────────────────
  let agentsCache = [];

  async function refreshAgents() {
    const grid = document.getElementById('agents-grid');
    if (!grid) return;
    try {
      const data = await window.LEAD.api('/agents');
      agentsCache = data.agents || [];
      renderAgents(agentsCache);
    } catch (err) {
      grid.innerHTML = `<p class="muted small" style="grid-column:1/-1;text-align:center;padding:20px">Couldn't load agents — ${escapeHtml(err.message)}</p>`;
    }
  }

  const GLYPH_COLOR = {
    capture: 'var(--c-creative)', courier: 'var(--c-frontend)',
    triage: 'var(--c-warning)', coach: 'var(--c-theory)', bridge: 'var(--c-backend)'
  };

  function renderAgents(agents) {
    const grid = document.getElementById('agents-grid');
    grid.innerHTML = agents.map(a => `
      <article class="agent-card glass ${a.armed ? 'armed' : ''}" data-agent="${a.id}">
        <span class="agent-status-pill">${a.armed ? '● ARMED' : 'OFF'}</span>
        <div class="agent-glyph" style="--g:${GLYPH_COLOR[a.id] || 'var(--c-warning)'}">${a.glyph}</div>
        <h3>${escapeHtml(a.name)}</h3>
        <p>${escapeHtml(a.description)}</p>
        <div class="agent-meta-row">
          <span>~${a.creditEstimate} credits/run</span>
          ${a.lastRunAt ? `<span>Last: ${formatRelative(Date.parse(a.lastRunAt)/1000)}</span>` : ''}
          ${a.runsCompleted ? `<span>${a.runsCompleted} run${a.runsCompleted===1?'':'s'}</span>` : ''}
        </div>
        <div class="agent-actions">
          ${a.armed ? `
            <button class="run" data-action="run">Run now</button>
            <button data-action="config">Configure</button>
            <button class="disarm" data-action="disarm">Disarm</button>
          ` : `
            <button data-action="config">Arm agent →</button>
          `}
          ${a.runsCompleted ? `<button data-action="runs">${a.runsCompleted} run${a.runsCompleted===1?'':'s'}</button>` : ''}
        </div>
      </article>
    `).join('');

    grid.querySelectorAll('.agent-card').forEach(card => {
      const id = card.dataset.agent;
      const a  = agents.find(x => x.id === id);
      card.querySelectorAll('button[data-action]').forEach(b => {
        b.addEventListener('click', () => {
          const action = b.dataset.action;
          if (action === 'config') openAgentModal(a, 'config');
          if (action === 'run')    runAgentNow(a);
          if (action === 'disarm') disarmAgent(a);
          if (action === 'runs')   openAgentModal(a, 'runs');
        });
      });
    });
  }

  function openAgentModal(agent, mode) {
    const modal = document.getElementById('agent-modal');
    const content = document.getElementById('agent-modal-content');
    content.innerHTML = `
      <div class="am-head">
        <div class="am-glyph" style="--g:${GLYPH_COLOR[agent.id]}">${agent.glyph}</div>
        <div>
          <div class="am-title">${escapeHtml(agent.name)}</div>
          <div class="muted small">~${agent.creditEstimate} credits per run · ${agent.schedulable ? 'Can run on schedule' : 'On demand only'}</div>
        </div>
      </div>
      <p class="am-sub">${escapeHtml(agent.description)}</p>
    `;

    if (mode === 'config') renderConfigForm(content, agent);
    if (mode === 'runs')   renderRunsList(content, agent);

    modal.hidden = false;
  }

  function renderConfigForm(container, agent) {
    const params = agent.params || {};
    const fieldsHtml = Object.entries(agent.paramsSchema || {}).map(([key, schema]) => {
      const val = params[key] ?? schema.default ?? '';
      const id = `p_${agent.id}_${key}`;
      if (schema.type === 'bool') {
        return `<div class="am-field bool">
          <input type="checkbox" id="${id}" name="${key}" ${val ? 'checked' : ''} />
          <label for="${id}">${escapeHtml(schema.label)}</label>
        </div>`;
      }
      if (schema.type === 'enum') {
        const opts = (schema.options || []).map(o => `<option ${o===val?'selected':''}>${o}</option>`).join('');
        return `<div class="am-field">
          <label for="${id}">${escapeHtml(schema.label)}</label>
          <select id="${id}" name="${key}">${opts}</select>
        </div>`;
      }
      return `<div class="am-field">
        <label for="${id}">${escapeHtml(schema.label)}</label>
        <input type="${schema.type === 'email' ? 'email' : 'text'}" id="${id}" name="${key}" value="${escapeHtml(String(val))}" placeholder="${escapeHtml(schema.placeholder || '')}" />
      </div>`;
    }).join('');

    container.insertAdjacentHTML('beforeend', `
      <form class="am-form" id="am-form-${agent.id}">${fieldsHtml || '<p class="muted small">No configuration needed.</p>'}</form>
      <div class="am-actions">
        ${agent.armed ? `<button class="cancel" data-action="disarm">Disarm</button>` : ''}
        <button class="cancel" data-action="cancel">Cancel</button>
        <button class="primary" data-action="arm">${agent.armed ? 'Save changes' : 'Arm agent'}</button>
      </div>
    `);

    container.querySelector('button[data-action="cancel"]').addEventListener('click', closeAgentModal);
    container.querySelector('button[data-action="arm"]').addEventListener('click', async (e) => {
      const btn = e.target;
      btn.disabled = true; btn.textContent = 'Saving…';
      const form = container.querySelector(`#am-form-${agent.id}`);
      const params = {};
      [...form.elements].forEach(el => {
        if (!el.name) return;
        params[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      });
      try {
        await window.LEAD.api(`/agents/${agent.id}/arm`, { method: 'POST', body: { params, cadence: params.cadence || null } });
        toast(`${agent.name} armed.`, 'success');
        closeAgentModal();
        refreshAgents();
      } catch (err) {
        toast('Failed: ' + err.message, 'error', 4000);
        btn.disabled = false; btn.textContent = agent.armed ? 'Save changes' : 'Arm agent';
      }
    });
    const disarmBtn = container.querySelector('button[data-action="disarm"]');
    if (disarmBtn) disarmBtn.addEventListener('click', () => { closeAgentModal(); disarmAgent(agent); });
  }

  async function renderRunsList(container, agent) {
    container.insertAdjacentHTML('beforeend', `<div class="am-runs"><h3>RECENT RUNS</h3><div id="runs-body">Loading…</div></div>`);
    try {
      const data = await window.LEAD.api(`/agents/${agent.id}/runs`);
      const body = container.querySelector('#runs-body');
      if (!data.runs?.length) {
        body.innerHTML = '<p class="muted small">No runs yet.</p>'; return;
      }
      body.innerHTML = data.runs.map(r => `
        <div class="am-run-item">
          <div class="am-run-head">
            <span class="status ${r.status}">${r.status === 'success' ? '✓' : '✗'} ${r.status}</span>
            <span class="when">${formatRelative(Date.parse(r.startedAt)/1000)} · ${r.creditsUsed||0}c · ${r.provider||'?'}</span>
          </div>
          <div class="am-run-summary">${escapeHtml(r.summary || r.error || '(no summary)')}</div>
        </div>
      `).join('');
    } catch (err) {
      container.querySelector('#runs-body').innerHTML = `<p class="muted small">Failed: ${escapeHtml(err.message)}</p>`;
    }
  }

  async function runAgentNow(agent) {
    toast(`Running ${agent.name}…`, 'info', 8000);
    try {
      const r = await window.LEAD.api(`/agents/${agent.id}/run`, { method: 'POST', body: {} });
      const msg = r.summary || r.text || `${agent.name} done.`;
      toast(msg, r.status === 'success' ? 'success' : 'error', 6000);
      refreshAgents();
    } catch (err) {
      toast(`${agent.name} failed: ${err.message}`, 'error', 5000);
    }
  }

  async function disarmAgent(agent) {
    if (!confirm(`Disarm ${agent.name}?`)) return;
    try {
      await window.LEAD.api(`/agents/${agent.id}/disarm`, { method: 'POST', body: {} });
      toast(`${agent.name} disarmed.`);
      refreshAgents();
    } catch (err) {
      toast(`Failed: ${err.message}`, 'error');
    }
  }

  function closeAgentModal() { document.getElementById('agent-modal').hidden = true; }

  // ───────── PERSONA HEROES ──────────────────────────────────────────────
  function renderPersonaHero(persona, usage) {
    const host = document.getElementById('persona-hero');
    if (!host) return;
    if (!persona) { host.hidden = true; return; }
    host.hidden = false;
    const builder = HERO_BUILDERS[persona] || HERO_BUILDERS.controller;
    host.innerHTML = builder(usage);
    // Wire any inner action buttons
    host.querySelectorAll('a[data-tool], button[data-tool]').forEach(el => {
      // Already plain links, but we can intercept for telemetry later
    });
  }

  const HERO_BUILDERS = {
    controller: () => `
      <div class="ph-card" style="--ph-accent:var(--c-creative);--ph-accent-soft:rgba(192,132,252,0.08);--ph-accent-border:rgba(192,132,252,0.22)">
        <div class="ph-text">
          <span class="ph-eyebrow">MISSION CONTROL</span>
          <h2>See your team work,<br/><em>not their inbox.</em></h2>
          <p>Open the Command canvas to drop tasks where work actually happens — directly on a teammate's screen, with one click.</p>
          <div class="ph-actions">
            <a class="cta-pill" href="https://lead.cwleaders.com/command">Open Mission Control →</a>
            <a class="cta-pill ghost" href="#agents">Arm a coach agent</a>
          </div>
        </div>
        <div class="ph-visual mc-canvas">
          <svg class="mc-svg" viewBox="0 0 360 220">
            <defs><filter id="mcblur"><feGaussianBlur stdDeviation="1.4"/></filter></defs>
            <g stroke-width="1.4" fill="none" opacity="0.4">
              <path d="M180,110 C140,60 90,50 60,50" stroke="#4f8cff"/>
              <path d="M180,110 C220,55 280,55 310,55" stroke="#4ade80"/>
              <path d="M180,110 C130,150 80,170 50,180" stroke="#fbbf24"/>
              <path d="M180,110 C220,140 290,170 320,180" stroke="#ff5d73" stroke-dasharray="4 4"/>
            </g>
            <circle cx="180" cy="110" r="22" fill="#c084fc" opacity="0.3" class="pulse"/>
            <circle cx="180" cy="110" r="14" fill="#c084fc"/>
            <text x="180" y="114" text-anchor="middle" font-size="9" font-weight="700" fill="#0a0e1a">YOU</text>
            <circle cx="60"  cy="50"  r="11" fill="#4f8cff"/>
            <circle cx="310" cy="55"  r="11" fill="#4ade80"/>
            <circle cx="50"  cy="180" r="11" fill="#fbbf24"/>
            <circle cx="320" cy="180" r="13" fill="#ff5d73">
              <animate attributeName="r" values="13;17;13" dur="1.6s" repeatCount="indefinite"/>
            </circle>
          </svg>
        </div>
      </div>
    `,

    subordinate: () => `
      <div class="ph-card" style="--ph-accent:var(--c-theory);--ph-accent-soft:rgba(74,222,128,0.08);--ph-accent-border:rgba(74,222,128,0.22)">
        <div class="ph-text">
          <span class="ph-eyebrow">YOUR DAY</span>
          <h2>Pick up where you<br/><em>left off.</em></h2>
          <p>A clean visual log of what you shipped, what's next, and how much focus time you actually got. No stand-up needed.</p>
          <div class="ph-actions">
            <a class="cta-pill" href="https://lead.cwleaders.com">Open recorder</a>
            <a class="cta-pill ghost" href="#agents">Arm Coach agent</a>
          </div>
        </div>
        <div class="ph-visual">
          <div class="day-stream">
            <div class="day-row focused"><span class="dot"></span>09:14 · Focused on design.fig (62 min)</div>
            <div class="day-row"><span class="dot"></span>10:18 · Standup recap recorded</div>
            <div class="day-row focused"><span class="dot"></span>10:34 · Focused on api.ts (48 min)</div>
            <div class="day-row warning"><span class="dot"></span>11:24 · Switched 4× in 8 min</div>
            <div class="day-row focused"><span class="dot"></span>11:40 · Focused on api.ts (37 min)</div>
            <div class="day-row"><span class="dot"></span>12:18 · Lunch · 31 min</div>
          </div>
        </div>
      </div>
    `,

    applicant: () => `
      <div class="ph-card" style="--ph-accent:var(--c-frontend);--ph-accent-soft:rgba(79,140,255,0.08);--ph-accent-border:rgba(79,140,255,0.22)">
        <div class="ph-text">
          <span class="ph-eyebrow">YOUR APPLICATION</span>
          <h2>Show what you<br/><em>actually do.</em></h2>
          <p>Apply once, send a short Skill Check recording, get a real reply within five business days. No 7-round interview gauntlet.</p>
          <div class="ph-actions">
            <a class="cta-pill" href="https://myhire.cwleaders.com/positions/">Browse roles →</a>
            <a class="cta-pill ghost" href="https://lead.cwleaders.com">Get the recorder</a>
          </div>
        </div>
        <div class="ph-visual">
          <div class="app-stepper">
            <div class="app-step done"><div class="num">1</div><div class="info"><strong>Application sent</strong><span>2 days ago</span></div></div>
            <div class="app-step done"><div class="num">2</div><div class="info"><strong>Reviewed by hiring lead</strong><span>yesterday</span></div></div>
            <div class="app-step current"><div class="num">3</div><div class="info"><strong>Skill Check in progress</strong><span>10-min recording on your machine</span></div></div>
            <div class="app-step"><div class="num">4</div><div class="info"><strong>Decision call</strong><span>Once Skill Check is in</span></div></div>
          </div>
        </div>
      </div>
    `,

    sharer: () => `
      <div class="ph-card" style="--ph-accent:var(--c-warning);--ph-accent-soft:rgba(251,191,36,0.08);--ph-accent-border:rgba(251,191,36,0.22)">
        <div class="ph-text">
          <span class="ph-eyebrow">DROP ZONE</span>
          <h2>Drop a file.<br/><em>Get a link.</em></h2>
          <p>Branded short links, password protection, view tracking. Your files, your domain. Recipients see a real preview before they click.</p>
          <div class="ph-actions">
            <a class="cta-pill" href="https://upload.cwleaders.com">Open uploader →</a>
            <a class="cta-pill ghost" href="#agents">Arm Courier agent</a>
          </div>
        </div>
        <div class="ph-visual">
          <a class="share-drop" href="https://upload.cwleaders.com">
            <span class="glyph">
              <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M32 8v34"/><path d="M20 24l12-12 12 12"/><rect x="8" y="42" width="48" height="14" rx="3"/>
              </svg>
            </span>
            <strong style="color:var(--t1);font-size:14px">Click to send a file</strong>
            <span style="font-size:12px;color:var(--t3)">or drag a file into this window</span>
          </a>
        </div>
      </div>
    `,

    recorder: () => `
      <div class="ph-card" style="--ph-accent:var(--c-backend);--ph-accent-soft:rgba(255,93,115,0.08);--ph-accent-border:rgba(255,93,115,0.22)">
        <div class="ph-text">
          <span class="ph-eyebrow">RECORDING STUDIO</span>
          <h2>Hit record. <em>Show your work.</em></h2>
          <p>One-click capture, AI storyboards, kinetic overlays. Local-first — your recordings never leave your machine unless you choose.</p>
          <div class="ph-actions">
            <a class="cta-pill" href="https://api.cwleaders.com/desktop/download?platform=auto">Get the desktop app</a>
            <a class="cta-pill ghost" href="https://lead.cwleaders.com">Web recorder</a>
          </div>
        </div>
        <div class="ph-visual">
          <a class="rec-studio" href="https://lead.cwleaders.com" style="text-decoration:none">
            <div class="rec-record-button" aria-label="Start recording"></div>
            <div class="rec-meta">
              <strong>Ready when you are.</strong>
              <span>Last recording: 3 days ago · 7 min</span>
            </div>
          </a>
        </div>
      </div>
    `,

    admin: () => `
      <div class="ph-card" style="--ph-accent:var(--c-warning);--ph-accent-soft:rgba(251,191,36,0.08);--ph-accent-border:rgba(251,191,36,0.22)">
        <div class="ph-text">
          <span class="ph-eyebrow">ORG HEALTH</span>
          <h2>Your whole org,<br/><em>at a glance.</em></h2>
          <p>Active seats, compliance posture, AI spend, security alerts — one canvas, zero spreadsheets. SSO + audit logs included.</p>
          <div class="ph-actions">
            <a class="cta-pill" href="https://lead.cwleaders.com/admin">Open admin</a>
            <a class="cta-pill ghost" href="https://lead.cwleaders.com/enterprise">Enterprise pricing</a>
          </div>
        </div>
        <div class="ph-visual">
          <div class="org-grid">
            <div class="org-cell"><div class="label">ACTIVE SEATS</div><div class="val">—</div><div class="sub">connect SSO to populate</div></div>
            <div class="org-cell"><div class="label">CONSENT</div><div class="val">100%</div><div class="sub">all employees signed</div></div>
            <div class="org-cell warn"><div class="label">AI SPEND THIS MONTH</div><div class="val">$0</div><div class="sub">free tier covered</div></div>
            <div class="org-cell"><div class="label">ALERTS</div><div class="val">0</div><div class="sub">all green</div></div>
          </div>
        </div>
      </div>
    `,
  };

  // wire close affordances
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('agent-modal-close').addEventListener('click', closeAgentModal);
    document.querySelector('#agent-modal .modal-shell-bg').addEventListener('click', closeAgentModal);
  });

  // ───────── HELPERS ─────────────────────────────────────────────────────
  function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n/1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n/1024/1024).toFixed(1)} MB`;
    return `${(n/1024/1024/1024).toFixed(2)} GB`;
  }
  function formatNum(n) {
    if (n < 1000) return String(n);
    if (n < 10000) return `${(n/1000).toFixed(1)}K`;
    if (n < 1000000) return `${Math.round(n/1000)}K`;
    return `${(n/1000000).toFixed(1)}M`;
  }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function toast(msg, kind='info', ms=2800) {
    if (window.LEAD?.toast) return window.LEAD.toast(msg, kind, ms);
    alert(msg);
  }

  // Boot once LEAD library is ready
  if (window.LEAD) boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
