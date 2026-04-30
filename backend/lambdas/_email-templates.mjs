/* CW Leaders Studio — proprietary branded email templates.
   Designed for the dark Mind-Free aesthetic with Outlook 2007+ compatibility:
   - Table-based layout (no flexbox/grid — Outlook strips them)
   - All styles inline (Gmail strips <style> outside <head>)
   - Mobile-responsive via max-width
   - No web fonts (poor compat) — system stack with monospace for codes
   - Preheader text for inbox preview
   - Dark-mode aware (most clients respect explicit colors)
*/

// ─── Brand tokens (hex literals — never use CSS vars in email HTML) ────────
const C = {
  bg:        '#0a0e1a',
  surface:   '#11172a',
  elevated:  '#161e36',
  border:    '#252b48',
  text1:     '#e8eaf2',
  text2:     '#8a93b3',
  text3:     '#4a5176',
  blue:      '#4f8cff',
  purple:    '#c084fc',
  green:     '#4ade80',
  amber:     '#fbbf24',
  red:       '#ff5d73',
  gradient:  'linear-gradient(120deg,#4f8cff 0%,#c084fc 50%,#fbbf24 100%)',
};

const FONT_BODY = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', system-ui, sans-serif`;
const FONT_MONO = `ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace`;

// ─── Outer wrapper (every template uses this) ─────────────────────────────
function wrapper({ preheader = '', accent = C.purple, title = 'CW Leaders' }, contentHtml) {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT_BODY};color:${C.text1};-webkit-font-smoothing:antialiased;">
<!-- Preheader (hidden, shows in inbox preview) -->
<div style="display:none;max-height:0;overflow:hidden;color:transparent;font-size:1px;line-height:1px;mso-hide:all;">${esc(preheader)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:${C.surface};border-radius:18px;border:1px solid ${C.border};overflow:hidden;">

    <!-- Brand header bar (gradient strip + monogram) -->
    <tr><td style="background:${accent};height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>
    <tr><td style="padding:24px 28px 8px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="middle" style="padding-right:10px;">
            ${monogramSvg(accent)}
          </td>
          <td valign="middle" style="font-size:13px;letter-spacing:0.18em;font-weight:600;color:${C.text1};">CW LEADERS</td>
        </tr>
      </table>
    </td></tr>

    <!-- Body content slot -->
    <tr><td style="padding:8px 28px 28px 28px;color:${C.text1};font-family:${FONT_BODY};line-height:1.55;">
${contentHtml}
    </td></tr>

    <!-- Footer -->
    <tr><td style="padding:20px 28px 28px 28px;border-top:1px solid ${C.border};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-size:11px;color:${C.text3};line-height:1.5;">
            CW Leaders · Los Angeles, CA · Worldwide<br>
            <a href="https://lead.cwleaders.com" style="color:${C.text2};text-decoration:none;">lead.cwleaders.com</a>
            &nbsp;·&nbsp;
            <a href="mailto:hello@cwleaders.com" style="color:${C.text2};text-decoration:none;">hello@cwleaders.com</a>
          </td>
        </tr>
      </table>
    </td></tr>

  </table>

  <!-- Outside-card legal microline -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin-top:14px;">
    <tr><td style="font-size:10px;color:${C.text3};text-align:center;line-height:1.5;font-family:${FONT_BODY};">
      You're receiving this because you used CW Leaders Studio.<br>
      If this wasn't you, you can safely ignore this message.
    </td></tr>
  </table>

</td></tr></table>
</body></html>`;
}

function monogramSvg(accent) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="22" height="22" style="display:block;">
    <circle cx="8" cy="10" r="3" fill="${C.blue}"/>
    <circle cx="24" cy="10" r="3" fill="${accent}"/>
    <circle cx="16" cy="22" r="3" fill="${C.green}"/>
    <path d="M11 10h10M9.5 12.5L14 19.5M22.5 12.5L18 19.5" stroke="${C.text2}" stroke-width="1.4" stroke-linecap="round" fill="none"/>
  </svg>`;
}

// ─── Reusable visual components ────────────────────────────────────────────
function eyebrow(text, color = C.purple) {
  return `<div style="font-size:11px;letter-spacing:0.32em;color:${color};text-transform:uppercase;font-weight:600;margin-bottom:14px;">${esc(text)}</div>`;
}
function h1(text) {
  return `<h1 style="font-size:26px;line-height:1.15;letter-spacing:-0.02em;font-weight:700;color:${C.text1};margin:0 0 14px 0;">${esc(text)}</h1>`;
}
function p(text, opts = {}) {
  const color = opts.muted ? C.text2 : C.text1;
  const mt = opts.mt ?? 14;
  return `<p style="font-size:15px;line-height:1.6;color:${color};margin:0 0 ${mt}px 0;">${text}</p>`;
}
function button(label, href, color = C.amber) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px 0;">
    <tr><td style="background:${color};border-radius:999px;">
      <a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:600;color:${C.bg};text-decoration:none;letter-spacing:0.02em;">${esc(label)}</a>
    </td></tr>
  </table>`;
}
function code(value, opts = {}) {
  const color = opts.color || C.amber;
  const size = opts.size || 36;
  return `<div style="background:${C.elevated};border:1px solid ${C.border};border-radius:14px;padding:22px 16px;text-align:center;margin:18px 0;">
    <div style="font-family:${FONT_MONO};font-size:${size}px;letter-spacing:0.18em;font-weight:700;color:${color};">${esc(value)}</div>
  </div>`;
}
function divider() {
  return `<div style="height:1px;background:${C.border};margin:18px 0;line-height:1px;font-size:0;">&nbsp;</div>`;
}
function row(label, value) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
    <tr>
      <td style="width:38%;padding:8px 12px 8px 0;font-size:11px;letter-spacing:0.16em;color:${C.text3};text-transform:uppercase;vertical-align:top;">${esc(label)}</td>
      <td style="font-size:14px;color:${C.text1};vertical-align:top;">${value}</td>
    </tr>
  </table>`;
}
function pill(text, color = C.purple) {
  return `<span style="display:inline-block;background:${color};color:${C.bg};padding:3px 10px;border-radius:999px;font-size:10px;letter-spacing:0.18em;font-weight:600;text-transform:uppercase;">${esc(text)}</span>`;
}
function quote(text) {
  return `<div style="border-left:3px solid ${C.purple};padding:8px 14px;background:${C.elevated};border-radius:0 10px 10px 0;color:${C.text2};font-size:14px;line-height:1.6;margin:14px 0;white-space:pre-wrap;">${esc(text)}</div>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
  );
}

// ─── TEMPLATE 1 · Magic-link sign-in code ─────────────────────────────────
export function magicLinkEmail({ code: signInCode, displayName }) {
  const greeting = displayName ? `Hey ${displayName.split(' ')[0]},` : 'Hey there,';
  const html = wrapper({
    preheader: `Your CW Leaders sign-in code: ${signInCode}`,
    accent: C.purple,
    title: 'Your sign-in code',
  }, [
    eyebrow('Sign in', C.purple),
    h1('Welcome back.'),
    p(`${greeting} here's your one-time sign-in code:`, { muted: true }),
    code(signInCode, { color: C.amber, size: 38 }),
    p('Paste it into the sign-in screen — valid for 15 minutes. We never ask for this code over email or chat.', { muted: true, mt: 4 }),
    divider(),
    p(`<span style="color:${C.text3};font-size:12px;">Didn't try to sign in? You can safely ignore this — no account changes happen until the code is used.</span>`, { mt: 0 }),
  ].join(''));
  return {
    subject: `Your CW Leaders sign-in code: ${signInCode}`,
    html,
    text: `Your CW Leaders sign-in code is: ${signInCode}\n\nValid for 15 minutes. If you didn't request it, ignore this email.\n\n— CW Leaders\nlead.cwleaders.com`
  };
}

// ─── TEMPLATE 2 · License delivery (after Stripe purchase) ────────────────
export function licenseDeliveryEmail({ displayName, licenses, downloadUrl = 'https://studio.cwleaders.com' }) {
  const firstName = (displayName || '').split(' ')[0] || 'there';
  const PLAN_LABELS = {
    basic: 'Studio', studio: 'Studio',
    powerhouse: 'Creator', creator: 'Creator',
    agentic: 'Pro', pro: 'Pro',
    teams: 'Teams', enterprise: 'Enterprise',
    enterprise_seat: 'Enterprise', enterprise_org: 'Enterprise org'
  };

  const tierAccent = (tier) => ({
    basic: C.amber, studio: C.amber,
    powerhouse: C.purple, creator: C.purple,
    agentic: C.green, pro: C.green,
    teams: C.blue, enterprise: C.amber, enterprise_seat: C.amber, enterprise_org: C.amber
  }[tier] || C.amber);

  const licenseBlocks = licenses.map(l => `
    <div style="background:${C.elevated};border:1px solid ${C.border};border-radius:14px;padding:18px 20px;margin:12px 0;">
      <div style="margin-bottom:10px;">${pill(PLAN_LABELS[l.tier] || l.tier, tierAccent(l.tier))}</div>
      <div style="font-family:${FONT_MONO};font-size:22px;letter-spacing:0.16em;font-weight:700;color:${C.text1};word-break:break-all;">
        ${esc(l.key)}
      </div>
    </div>`).join('');

  const html = wrapper({
    preheader: `Your CW Leaders license ${licenses.length > 1 ? 'keys are' : 'key is'} ready.`,
    accent: C.green,
    title: 'Welcome to CW Leaders Studio',
  }, [
    eyebrow('You\'re in', C.green),
    h1('Welcome to Studio.'),
    p(`Hey ${esc(firstName)} — thanks for going pro. Your license ${licenses.length > 1 ? 'keys are' : 'key is'} below.`, { muted: true }),
    licenseBlocks,
    p('Paste the key into Studio on first launch. Same key works on Mac, Windows, and Linux — up to 3 machines per license.', { muted: true, mt: 8 }),
    button('Open Studio →', downloadUrl, C.amber),
    divider(),
    p(`<strong style="color:${C.text1};">Need help?</strong> Reply to this email — a real person reads every message.`, { mt: 0 }),
    p(`<span style="color:${C.text3};font-size:12px;">Receipt &amp; subscription details are in your Stripe email. Manage anytime at <a href="https://studio.cwleaders.com" style="color:${C.text2};text-decoration:underline;">studio.cwleaders.com</a>.</span>`, { mt: 8 }),
  ].join(''));

  return {
    subject: `Your CW Leaders license key${licenses.length > 1 ? 's' : ''}`,
    html,
    text: `Welcome to CW Leaders Studio.\n\nYour license key${licenses.length > 1 ? 's' : ''}:\n${licenses.map(l => `  ${l.key}  (${l.tier})`).join('\n')}\n\nPaste your key into Studio on first launch. Same key works on Mac, Windows, and Linux — up to 3 machines per license.\n\n${downloadUrl}\n\n— CW Leaders`
  };
}

// ─── TEMPLATE 3 · Applicant confirmation (after MyHire submission) ─────────
export function applicantConfirmationEmail({ rec }) {
  const firstName = rec.personal.firstName;
  const role = rec.professional.targetRole;
  const submissionId = rec.submissionId;

  const html = wrapper({
    preheader: `Your application for ${role} is in.`,
    accent: C.blue,
    title: 'We received your application',
  }, [
    eyebrow('Application received', C.blue),
    h1(`Got it, ${esc(firstName)}.`),
    p(`Your application for <strong style="color:${C.text1};">${esc(role)}</strong> is in our queue.`, { muted: true }),
    p(`A real person reads every application — no automated screening, no black box. We'll reply within <strong style="color:${C.text1};">5 business days</strong>: yes, no, or "let's talk."`, { muted: true }),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.elevated};border:1px solid ${C.border};border-radius:14px;padding:0;margin:18px 0;">
      <tr><td style="padding:18px 20px;">
        <div style="font-size:10px;letter-spacing:0.24em;color:${C.text3};text-transform:uppercase;margin-bottom:6px;">What happens next</div>
        <ol style="margin:0;padding-left:18px;color:${C.text2};font-size:14px;line-height:1.65;">
          <li><strong style="color:${C.text1};">Review</strong> — within 5 business days, by a real human.</li>
          <li><strong style="color:${C.text1};">Optional Skill Check</strong> — short recorded task on your machine, ~10 min.</li>
          <li><strong style="color:${C.text1};">One conversation</strong> — if we both want to move forward, a single 45-min call.</li>
          <li><strong style="color:${C.text1};">Decision</strong> — same week, no ghosting.</li>
        </ol>
      </td></tr>
    </table>`,
    p(`<span style="color:${C.text3};font-size:12px;">Reference: <code style="font-family:${FONT_MONO};color:${C.text2};">${esc(submissionId)}</code> · Reply with this ID if you have questions.</span>`, { mt: 0 }),
    divider(),
    p(`<a href="https://myhire.cwleaders.com/positions/" style="color:${C.blue};text-decoration:none;font-weight:600;">Browse other open roles →</a>`, { mt: 0 }),
  ].join(''));

  return {
    subject: `We've got your application — ${role}`,
    html,
    text: `Got it, ${firstName}.\n\nYour application for ${role} is in. A real person reads every application within 5 business days.\n\nReference: ${submissionId}\n\n— CW Leaders`
  };
}

// ─── TEMPLATE 4 · Internal hiring notification ────────────────────────────
export function internalHiringEmail({ rec }) {
  const fullName = `${rec.personal.firstName} ${rec.personal.lastName}`;
  const role = rec.professional.targetRole;
  const dlUrl = (token) => `https://download.cwleaders.com/${token}`;

  let bodyParts = [
    eyebrow('New application', C.amber),
    h1(`${esc(fullName)}`),
    `<div style="margin:-8px 0 18px 0;color:${C.text2};font-size:14px;">
      ${esc(role)} · ${esc(String(rec.professional.yearsExperience))} yrs · ${esc(rec.location.city)}, ${esc(rec.location.country)}
      ${rec.skillCheckToken ? `<br>${pill('Skill Check submitted', C.amber)}` : ''}
    </div>`,

    row('Email',     `<a href="mailto:${esc(rec.personal.email)}" style="color:${C.blue};text-decoration:none;">${esc(rec.personal.email)}</a>`),
    row('Phone',     esc(rec.personal.phone)),
    row('LinkedIn',  rec.personal.linkedin ? `<a href="${esc(rec.personal.linkedin)}" style="color:${C.blue};text-decoration:none;">${esc(rec.personal.linkedin)}</a>` : '—'),
    row('Portfolio', rec.personal.portfolio ? `<a href="${esc(rec.personal.portfolio)}" style="color:${C.blue};text-decoration:none;">${esc(rec.personal.portfolio)}</a>` : '—'),
    row('Current',   `${esc(rec.professional.currentTitle)} @ ${esc(rec.professional.currentCompany || '—')}`),
    row('Comp',      esc(rec.professional.compensation || '—')),
    row('Available', esc(rec.preferences.availability)),
    row('Work auth', esc(rec.preferences.workAuthorization)),
    row('Travel',    esc(rec.preferences.travelPreference)),

    divider(),
    `<div style="font-size:10px;letter-spacing:0.24em;color:${C.text3};text-transform:uppercase;margin:14px 0 6px 0;">Why CW Leaders</div>`,
    quote(rec.narrative.whyCwLeaders),
  ];

  if (rec.narrative.standoutStrength) {
    bodyParts.push(
      `<div style="font-size:10px;letter-spacing:0.24em;color:${C.text3};text-transform:uppercase;margin:14px 0 6px 0;">Standout strength</div>`,
      quote(rec.narrative.standoutStrength)
    );
  }

  if (rec.attachments.resume) {
    bodyParts.push(divider());
    bodyParts.push(`<div style="margin:8px 0;"><strong style="color:${C.text1};">📄 Resume:</strong> <a href="${esc(dlUrl(rec.attachments.resume.shareToken))}" style="color:${C.blue};text-decoration:none;">${esc(rec.attachments.resume.name)}</a></div>`);
  }
  if (rec.attachments.coverLetter) {
    bodyParts.push(`<div style="margin:8px 0;"><strong style="color:${C.text1};">📝 Cover letter:</strong> <a href="${esc(dlUrl(rec.attachments.coverLetter.shareToken))}" style="color:${C.blue};text-decoration:none;">${esc(rec.attachments.coverLetter.name)}</a></div>`);
  }

  bodyParts.push(divider());
  bodyParts.push(p(
    `<a href="mailto:${esc(rec.personal.email)}?subject=Re%3A%20${encodeURIComponent('Your CW Leaders application — ' + role)}" style="color:${C.green};text-decoration:none;font-weight:600;">Reply to ${esc(rec.personal.firstName)} →</a>`,
    { mt: 0 }
  ));
  bodyParts.push(p(
    `<span style="color:${C.text3};font-size:11px;">${esc(rec.submissionId)} · Submitted ${esc(rec.submittedAt)}</span>`,
    { mt: 6 }
  ));

  const html = wrapper({
    preheader: `${fullName} applied for ${role}`,
    accent: C.amber,
    title: `New application: ${fullName}`,
  }, bodyParts.join(''));

  return {
    subject: `New application: ${fullName} — ${role}`,
    html,
    text: `New application: ${fullName}\nRole: ${role}\nExperience: ${rec.professional.yearsExperience} yrs\nLocation: ${rec.location.city}, ${rec.location.country}\nEmail: ${rec.personal.email}\nPhone: ${rec.personal.phone}\n\nWhy CW Leaders:\n${rec.narrative.whyCwLeaders}\n\n${rec.attachments.resume ? 'Resume: https://download.cwleaders.com/' + rec.attachments.resume.shareToken + '\n' : ''}${rec.attachments.coverLetter ? 'Cover letter: https://download.cwleaders.com/' + rec.attachments.coverLetter.shareToken + '\n' : ''}\nReference: ${rec.submissionId}`
  };
}

// ─── TEMPLATE 5 · Welcome / first-time-user (optional, future hook) ────────
export function welcomeEmail({ displayName, plan = 'free' }) {
  const firstName = (displayName || '').split(' ')[0] || 'there';
  const html = wrapper({
    preheader: 'Welcome to CW Leaders Studio — here\'s how to get started.',
    accent: C.purple,
    title: 'Welcome',
  }, [
    eyebrow('Welcome', C.purple),
    h1(`Hey ${esc(firstName)}.`),
    p(`Your CW Leaders account is live. Four tools, one identity, agentic AI built in.`, { muted: true }),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td valign="top" width="50%" style="padding:6px;">
          <div style="background:${C.elevated};border:1px solid ${C.border};border-radius:12px;padding:14px;">
            <div style="font-size:11px;letter-spacing:0.2em;color:${C.amber};font-weight:600;margin-bottom:4px;">RECORD</div>
            <div style="font-size:13px;color:${C.text1};">Mind-Free screen recording. <a href="https://lead.cwleaders.com" style="color:${C.blue};text-decoration:none;">Open →</a></div>
          </div>
        </td>
        <td valign="top" width="50%" style="padding:6px;">
          <div style="background:${C.elevated};border:1px solid ${C.border};border-radius:12px;padding:14px;">
            <div style="font-size:11px;letter-spacing:0.2em;color:${C.blue};font-weight:600;margin-bottom:4px;">SEND</div>
            <div style="font-size:13px;color:${C.text1};">Drop a file, get a link. <a href="https://upload.cwleaders.com" style="color:${C.blue};text-decoration:none;">Open →</a></div>
          </div>
        </td>
      </tr>
      <tr>
        <td valign="top" width="50%" style="padding:6px;">
          <div style="background:${C.elevated};border:1px solid ${C.border};border-radius:12px;padding:14px;">
            <div style="font-size:11px;letter-spacing:0.2em;color:${C.green};font-weight:600;margin-bottom:4px;">RECEIVE</div>
            <div style="font-size:13px;color:${C.text1};">See file previews before download. <a href="https://download.cwleaders.com" style="color:${C.blue};text-decoration:none;">Open →</a></div>
          </div>
        </td>
        <td valign="top" width="50%" style="padding:6px;">
          <div style="background:${C.elevated};border:1px solid ${C.border};border-radius:12px;padding:14px;">
            <div style="font-size:11px;letter-spacing:0.2em;color:${C.amber};font-weight:600;margin-bottom:4px;">HIRE</div>
            <div style="font-size:13px;color:${C.text1};">Show what you can do. <a href="https://myhire.cwleaders.com" style="color:${C.blue};text-decoration:none;">Open →</a></div>
          </div>
        </td>
      </tr>
    </table>`,
    divider(),
    button('Open your dashboard →', 'https://studio.cwleaders.com', C.amber),
    p(`<span style="color:${C.text3};font-size:12px;">Plan: <strong style="color:${C.text2};text-transform:capitalize;">${esc(plan)}</strong>. Upgrade any time at <a href="https://studio.cwleaders.com#pricing" style="color:${C.text2};text-decoration:underline;">studio.cwleaders.com</a>.</span>`, { mt: 12 }),
  ].join(''));

  return {
    subject: 'Welcome to CW Leaders Studio',
    html,
    text: `Welcome to CW Leaders Studio.\n\nFour tools, one account:\n• Record: lead.cwleaders.com\n• Send: upload.cwleaders.com\n• Receive: download.cwleaders.com\n• Hire: myhire.cwleaders.com\n\nDashboard: studio.cwleaders.com\n\n— CW Leaders`
  };
}
