/* MyHire apply flow.
   - 4 steps with validation
   - Draft persistence in sessionStorage
   - File upload via /files/presign + direct PUT to S3 (reuses LEAD ecosystem)
   - JSON submission to /myhire/applications */

(() => {
  const API = window.LEAD_API || 'https://api.cwleaders.com';
  const form = document.getElementById('application-form');
  if (!form) return;

  const STORAGE_KEY = 'myhire-application-draft';
  const stepPanels = [...form.querySelectorAll('[data-step-panel]')];
  const stepItems = [...document.querySelectorAll('.stepper li')];
  const nextBtn = form.querySelector('[data-next-step]');
  const backBtn = form.querySelector('[data-back-step]');
  const submitBtn = form.querySelector('[data-submit-application]');
  const status = form.querySelector('.form-status');
  const reviewGrid = document.getElementById('review-grid');
  const roleChip = document.getElementById('role-chip');
  const honeypot = form.elements.companyWebsite;

  const params = new URLSearchParams(location.search);
  const roleFromQuery = params.get('role')?.trim() || '';
  const sourceFromQuery = params.get('source')?.trim() || '';
  const skillCheckFromQuery = params.get('skillCheck')?.trim() || params.get('sc') || '';

  let currentStep = 0;
  let resumeFileId = '';
  let coverFileId = '';

  // ---------- helpers --------------------------------------------------------
  function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function setStatus(msg, state = 'idle') {
    status.textContent = msg || '';
    if (msg) status.dataset.state = state;
    else delete status.dataset.state;
  }

  // ---------- draft ----------------------------------------------------------
  function saveDraft() {
    const snap = {};
    for (const f of form.elements) {
      if (!f.name || f.type === 'file' || f.type === 'submit' || f.type === 'button') continue;
      snap[f.name] = f.type === 'checkbox' ? f.checked : f.value;
    }
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snap)); } catch {}
  }
  function restoreDraft() {
    let raw;
    try { raw = sessionStorage.getItem(STORAGE_KEY); } catch { return; }
    if (!raw) return;
    try {
      const snap = JSON.parse(raw);
      for (const [k, v] of Object.entries(snap)) {
        const f = form.elements[k];
        if (!f || f.type === 'file') continue;
        if (f.type === 'checkbox') f.checked = !!v; else f.value = v;
      }
    } catch { try { sessionStorage.removeItem(STORAGE_KEY); } catch {} }
  }

  // ---------- step navigation ------------------------------------------------
  function fieldsInStep(idx) {
    return [...stepPanels[idx].querySelectorAll('input, select, textarea')]
      .filter(f => f.type !== 'hidden' && !f.disabled);
  }
  function validateStep(idx) {
    const fields = fieldsInStep(idx);
    for (const f of fields) {
      if (!f.checkValidity()) {
        f.reportValidity();
        f.focus();
        return false;
      }
    }
    return true;
  }
  function setStep(idx) {
    currentStep = idx;
    stepPanels.forEach((p, i) => { p.hidden = i !== idx; });
    stepItems.forEach((it, i) => {
      it.classList.toggle('is-active', i === idx);
      it.classList.toggle('is-done', i < idx);
    });
    backBtn.hidden = idx === 0;
    nextBtn.hidden = idx === stepPanels.length - 1;
    submitBtn.hidden = idx !== stepPanels.length - 1;
    if (idx === stepPanels.length - 1) renderReview();
    setStatus('');
  }

  // ---------- review ---------------------------------------------------------
  function renderReview() {
    const e = form.elements;
    const rows = [
      ['Name', `${e.firstName.value} ${e.lastName.value}`.trim()],
      ['Email', e.email.value],
      ['Phone', e.phone.value],
      ['Location', [e.city.value, e.state.value, e.country.value].filter(Boolean).join(', ')],
      ['LinkedIn', e.linkedin.value || '—'],
      ['Portfolio', e.portfolio.value || '—'],
      ['Target role', e.targetRole.value],
      ['Current title', e.currentTitle.value],
      ['Current company', e.currentCompany.value || '—'],
      ['Years experience', e.yearsExperience.value],
      ['Compensation', e.compensation.value || '—'],
      ['Availability', e.availability.value],
      ['Work auth', e.workAuthorization.value],
      ['Travel', e.travelPreference.value],
      ['Why CW Leaders', e.whyCwLeaders.value],
      ['Standout strength', e.standoutStrength.value || '—'],
      ['Resume', e.resume.files[0]?.name || (resumeFileId ? '✓ uploaded' : 'Not provided')],
      ['Cover letter', e.coverLetter.files[0]?.name || (coverFileId ? '✓ uploaded' : 'Not provided')]
    ];
    reviewGrid.innerHTML = rows.map(([label, val]) =>
      `<div class="review-item"><strong>${escHtml(label)}</strong><span>${escHtml(val || '—')}</span></div>`
    ).join('');
  }

  // ---------- file upload (via /files/presign) ------------------------------
  async function uploadField(input, tileId, nameId, metaId, progressId, hiddenIdField) {
    const file = input.files[0];
    if (!file) return null;
    const tile = document.getElementById(tileId);
    const nameEl = document.getElementById(nameId);
    const metaEl = document.getElementById(metaId);
    const progEl = document.getElementById(progressId);
    const progWrap = progEl.parentElement;
    progWrap.hidden = false;
    progEl.style.width = '0%';
    nameEl.textContent = file.name;
    metaEl.textContent = `Uploading… ${formatBytes(file.size)}`;
    try {
      const presign = await fetch(`${API}/files/presign`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(window.LEAD?.Auth?.token ? { authorization: `Bearer ${window.LEAD.Auth.token}` } : {})
        },
        body: JSON.stringify({ name: file.name, size: file.size, type: file.type || 'application/octet-stream' })
      }).then(r => r.json());
      if (!presign.uploadUrl && !presign.parts) throw new Error('No upload URL');

      // Single PUT only for now (resumes are tiny)
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', presign.uploadUrl);
        xhr.upload.onprogress = e => e.lengthComputable && (progEl.style.width = (e.loaded/e.total*100).toFixed(1) + '%');
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`));
        xhr.onerror = () => reject(new Error('network'));
        xhr.send(file);
      });

      await fetch(`${API}/files/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileId: presign.fileId })
      });

      progEl.style.width = '100%';
      tile.classList.add('has-file');
      metaEl.textContent = `✓ Uploaded · ${formatBytes(file.size)}`;
      form.elements[hiddenIdField].value = presign.fileId;
      return presign.fileId;
    } catch (err) {
      console.error(err);
      tile.classList.remove('has-file');
      metaEl.textContent = `Upload failed — ${err.message}. Tap to try again.`;
      progWrap.hidden = true;
      return null;
    }
  }

  function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`;
    return `${(n/1024/1024).toFixed(1)} MB`;
  }

  // ---------- submission -----------------------------------------------------
  async function submitApplication() {
    if (honeypot?.value) {
      location.assign('/thank-you/?submission=screened');
      return;
    }
    if (!validateStep(currentStep)) return;

    const e = form.elements;
    const payload = {
      firstName: e.firstName.value,
      lastName:  e.lastName.value,
      email:     e.email.value,
      phone:     e.phone.value,
      city:      e.city.value,
      state:     e.state.value,
      country:   e.country.value,
      linkedin:  e.linkedin.value,
      portfolio: e.portfolio.value,
      targetRole:     e.targetRole.value,
      currentTitle:   e.currentTitle.value,
      currentCompany: e.currentCompany.value,
      yearsExperience: Number(e.yearsExperience.value),
      compensation:    e.compensation.value,
      availability:      e.availability.value,
      workAuthorization: e.workAuthorization.value,
      travelPreference:  e.travelPreference.value,
      whyCwLeaders:     e.whyCwLeaders.value,
      standoutStrength: e.standoutStrength.value,
      resumeFileId:      e.resumeFileId.value,
      coverLetterFileId: e.coverLetterFileId.value,
      privacyConsent:  e.privacyConsent.checked,
      accuracyConsent: e.accuracyConsent.checked,
      sourcePage:      e.sourcePage.value,
      referrer:        e.referrer.value,
      role:            e.role.value,
      skillCheckToken: e.skillCheckToken.value
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    setStatus('Sending your application securely…', 'idle');

    // Timeout watchdog — Zero-Trap: never let "Sending..." persist
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await fetch(`${API}/myhire/applications`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });
      const result = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 429) {
          const wait = Number(r.headers.get('retry-after')) || result.retryAfter || 60;
          setStatus(`Too many submissions. Please wait ${Math.ceil(wait)}s before resubmitting.`, 'error');
        } else if (r.status === 503) {
          setStatus('Application service temporarily unavailable. Try again in a minute.', 'error');
        } else if (result.fields) {
          applyServerErrors(result.fields);
        } else if (result.error) {
          setStatus(result.error, 'error');
        } else {
          setStatus('Please check your entries and try again.', 'error');
        }
        return;
      }
      try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
      // Validate redirect target — Zero-Trap: never navigate to undefined/external
      let dest = result.redirectUrl || '/thank-you/';
      try {
        const u = new URL(dest, location.origin);
        if (u.origin !== location.origin) dest = '/thank-you/'; // refuse cross-origin
      } catch { dest = '/thank-you/'; }
      location.assign(dest);
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatus('The request timed out. Your draft is saved — try Submit again.', 'error');
      } else {
        setStatus("Couldn't reach the server. Your draft is saved — try again or email newapp@cwleaders.com.", 'error');
      }
    } finally {
      clearTimeout(timer);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit application →';
    }
  }

  function applyServerErrors(errors) {
    const [firstField, msg] = Object.entries(errors)[0] || [];
    if (firstField) {
      const f = form.elements[firstField];
      if (f) {
        for (let i = 0; i < stepPanels.length; i++) {
          if (stepPanels[i].contains(f)) { setStep(i); break; }
        }
        f.setCustomValidity(msg);
        f.reportValidity();
        f.focus();
      }
    }
    setStatus('Please correct the highlighted field and try again.', 'error');
  }

  // ---------- init -----------------------------------------------------------
  restoreDraft();
  if (roleFromQuery && !form.elements.targetRole.value) form.elements.targetRole.value = roleFromQuery;
  if (sourceFromQuery) form.elements.sourcePage.value = `/apply/?source=${sourceFromQuery}`;
  if (skillCheckFromQuery) form.elements.skillCheckToken.value = skillCheckFromQuery;
  if (roleChip && roleFromQuery) {
    roleChip.hidden = false;
    roleChip.textContent = `Applying for: ${roleFromQuery}`;
  }
  form.elements.referrer.value = document.referrer || '';
  saveDraft();

  form.addEventListener('input', e => {
    if (typeof e.target.setCustomValidity === 'function') e.target.setCustomValidity('');
    saveDraft();
  });
  form.addEventListener('change', e => {
    saveDraft();
    if (e.target.name === 'resume' && e.target.files[0]) {
      uploadField(e.target, 'resume-tile', 'resume-name', 'resume-meta', 'resume-progress', 'resumeFileId')
        .then(id => { resumeFileId = id || ''; });
    }
    if (e.target.name === 'coverLetter' && e.target.files[0]) {
      uploadField(e.target, 'cover-tile', 'cover-name', 'cover-meta', 'cover-progress', 'coverLetterFileId')
        .then(id => { coverFileId = id || ''; });
    }
    if (currentStep === stepPanels.length - 1) renderReview();
  });

  nextBtn.addEventListener('click', () => {
    if (!validateStep(currentStep)) return;
    setStep(Math.min(currentStep + 1, stepPanels.length - 1));
  });
  backBtn.addEventListener('click', () => {
    setStep(Math.max(currentStep - 1, 0));
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    await submitApplication();
  });

  setStep(0);
})();
