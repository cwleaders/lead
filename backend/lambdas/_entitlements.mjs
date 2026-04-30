/* CW Leaders Studio — Entitlements Engine
   Single source of truth for what each plan can do.
   Imported by auth-me, presign-upload, and every gated Lambda. */

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

export const TIERS = {
  // ── Anonymous / not signed in ────────────────────────────────────────────
  anonymous: {
    label: 'Anonymous',
    monthly: 0,
    yearly: 0,
    files: {
      lifetimeBytes:    100 * MB,        // 100MB total
      perFileBytes:     100 * MB,
      linkExpiryHours:  24,
      passwordProtect:  false,
      customDomain:     false,
      analytics:        false,
      brandedReceipt:   false
    },
    lead: {
      maxRecordingMinutes: 5,
      resolution:          '720p',
      watermark:           true,
      aiStoryboard:        false,
      kineticOverlay:      false,
      vmapBundle:          false,
      glassboard:          false,
      cloudSync:           false
    },
    myhire: {
      canPostJobs:       false,
      activeApplicants:  0,
      skillCheckCreate:  false,
      atsPipeline:       false,
      talentCRM:         false
    },
    command: {
      maxMonitoredSeats: 0,
      realtimeCanvas:    false,
      alerts:            false,
      complianceLogs:    false
    },
    aiCredits:        100,        // monthly credits for cloud AI calls
    teamSeatsIncluded: 1,
    sso:               false,
    customDomain:      false,
    prioritySupport:   false
  },

  // ── Free (signed in, no payment) ─────────────────────────────────────────
  free: {
    label: 'Free',
    monthly: 0,
    yearly: 0,
    files: {
      lifetimeBytes:    2 * GB,
      perFileBytes:     1 * GB,
      linkExpiryHours:  168,            // 7 days
      passwordProtect:  false,
      customDomain:     false,
      analytics:        false,
      brandedReceipt:   false
    },
    lead: {
      maxRecordingMinutes: 30,
      resolution:          '1080p',
      watermark:           false,
      aiStoryboard:        false,
      kineticOverlay:      false,
      vmapBundle:          false,
      glassboard:          false,
      cloudSync:           false
    },
    myhire: {
      canPostJobs:       false,
      activeApplicants:  0,
      skillCheckCreate:  false,
      atsPipeline:       false,
      talentCRM:         false
    },
    command: {
      maxMonitoredSeats: 0,
      realtimeCanvas:    false,
      alerts:            false,
      complianceLogs:    false
    },
    aiCredits:        500,
    teamSeatsIncluded: 1,
    sso:               false,
    customDomain:      false,
    prioritySupport:   false
  },

  // ── Studio ($4.99 one-time / $2.99/mo) ───────────────────────────────────
  studio: {
    label: 'Studio',
    monthly: 2.99,
    yearly: 29,
    oneTime: 4.99,
    files: {
      lifetimeBytes:    25 * GB,
      perFileBytes:     5 * GB,
      linkExpiryHours:  168,
      passwordProtect:  false,
      customDomain:     false,
      analytics:        true,
      brandedReceipt:   false
    },
    lead: {
      maxRecordingMinutes: 60,
      resolution:          '1080p',
      watermark:           false,
      aiStoryboard:        false,
      kineticOverlay:      false,
      vmapBundle:          false,
      glassboard:          false,
      cloudSync:           false
    },
    myhire: {
      canPostJobs:       true,
      activeApplicants:  5,
      skillCheckCreate:  false,
      atsPipeline:       false,
      talentCRM:         false
    },
    command: {
      maxMonitoredSeats: 0,
      realtimeCanvas:    false,
      alerts:            false,
      complianceLogs:    false
    },
    aiCredits:        1000,
    teamSeatsIncluded: 1,
    sso:               false,
    customDomain:      false,
    prioritySupport:   false
  },

  // ── Creator ($9.99/mo or $79/yr) ─────────────────────────────────────────
  creator: {
    label: 'Creator',
    monthly: 9.99,
    yearly: 79,
    files: {
      lifetimeBytes:    250 * GB,
      perFileBytes:     50 * GB,
      linkExpiryHours:  720,           // 30 days
      passwordProtect:  true,
      customDomain:     false,
      analytics:        true,
      brandedReceipt:   true
    },
    lead: {
      maxRecordingMinutes: 240,        // 4 hours
      resolution:          '4K',
      watermark:           false,
      aiStoryboard:        true,
      kineticOverlay:      true,
      vmapBundle:          true,
      glassboard:          true,
      cloudSync:           false
    },
    myhire: {
      canPostJobs:       true,
      activeApplicants:  25,
      skillCheckCreate:  true,
      atsPipeline:       false,
      talentCRM:         false
    },
    command: {
      maxMonitoredSeats: 1,            // personal productivity
      realtimeCanvas:    false,
      alerts:            false,
      complianceLogs:    false
    },
    aiCredits:        10000,
    teamSeatsIncluded: 1,
    sso:               false,
    customDomain:      false,
    prioritySupport:   false
  },

  // ── Pro ($19.99/mo or $149/yr) ───────────────────────────────────────────
  pro: {
    label: 'Pro',
    monthly: 19.99,
    yearly: 149,
    files: {
      lifetimeBytes:    1024 * GB,     // 1TB
      perFileBytes:     100 * GB,
      linkExpiryHours:  -1,            // permanent
      passwordProtect:  true,
      customDomain:     true,
      analytics:        true,
      brandedReceipt:   true
    },
    lead: {
      maxRecordingMinutes: -1,         // unlimited
      resolution:          '4K',
      watermark:           false,
      aiStoryboard:        true,
      kineticOverlay:      true,
      vmapBundle:          true,
      glassboard:          true,
      cloudSync:           true
    },
    myhire: {
      canPostJobs:       true,
      activeApplicants:  -1,           // unlimited
      skillCheckCreate:  true,
      atsPipeline:       true,
      talentCRM:         true
    },
    command: {
      maxMonitoredSeats: 5,
      realtimeCanvas:    true,
      alerts:            true,
      complianceLogs:    false
    },
    aiCredits:        50000,
    teamSeatsIncluded: 1,
    sso:               false,
    customDomain:      true,
    prioritySupport:   true
  },

  // ── Teams ($14.99/seat/mo, min 3) ────────────────────────────────────────
  teams: {
    label: 'Teams',
    monthly: 14.99,
    yearly: 119,
    minSeats: 3,
    files: {
      lifetimeBytes:    -1,            // pooled, unlimited per-account
      perFileBytes:     100 * GB,
      linkExpiryHours:  -1,
      passwordProtect:  true,
      customDomain:     true,
      analytics:        true,
      brandedReceipt:   true
    },
    lead: {
      maxRecordingMinutes: -1,
      resolution:          '4K',
      watermark:           false,
      aiStoryboard:        true,
      kineticOverlay:      true,
      vmapBundle:          true,
      glassboard:          true,
      cloudSync:           true
    },
    myhire: {
      canPostJobs:       true,
      activeApplicants:  -1,
      skillCheckCreate:  true,
      atsPipeline:       true,
      talentCRM:         true
    },
    command: {
      maxMonitoredSeats: 10,           // included; per-seat overage available
      realtimeCanvas:    true,
      alerts:            true,
      complianceLogs:    true
    },
    aiCredits:        200000,          // pooled across team
    teamSeatsIncluded: 3,
    sso:               true,
    customDomain:      true,
    prioritySupport:   true
  },

  // ── Enterprise ($99/yr org + per-seat) ────────────────────────────────────
  enterprise: {
    label: 'Enterprise',
    monthly: 9.99,                     // per-seat (non-monitored)
    monthlyMonitored: 19.99,           // per-seat (Command active)
    yearlyOrgActivation: 99,
    files: {
      lifetimeBytes:    -1,
      perFileBytes:     -1,
      linkExpiryHours:  -1,
      passwordProtect:  true,
      customDomain:     true,
      analytics:        true,
      brandedReceipt:   true
    },
    lead: {
      maxRecordingMinutes: -1,
      resolution:          '4K',
      watermark:           false,
      aiStoryboard:        true,
      kineticOverlay:      true,
      vmapBundle:          true,
      glassboard:          true,
      cloudSync:           true
    },
    myhire: {
      canPostJobs:       true,
      activeApplicants:  -1,
      skillCheckCreate:  true,
      atsPipeline:       true,
      talentCRM:         true
    },
    command: {
      maxMonitoredSeats: -1,           // per-seat billed
      realtimeCanvas:    true,
      alerts:            true,
      complianceLogs:    true
    },
    aiCredits:        1000000,
    teamSeatsIncluded: -1,
    sso:               true,
    customDomain:      true,
    prioritySupport:   true,
    sovereignAI:       true,           // bring-your-own inference endpoint
    auditLogs:         true,
    soc2:              true
  }
};

/** Get the entitlements object for a given plan, falling back safely. */
export function entitlementsFor(plan) {
  return TIERS[plan] || TIERS.free;
}

/** Quick check helper: does this plan have a feature? */
export function can(plan, tool, feature) {
  const t = entitlementsFor(plan);
  return !!t[tool]?.[feature];
}

/** Calculate the upload cap (bytes) for a plan. -1 = unlimited. */
export function uploadCap(plan) {
  return entitlementsFor(plan).files.perFileBytes;
}

/** Check whether a recording length is within plan limits. */
export function canRecordMinutes(plan, minutes) {
  const cap = entitlementsFor(plan).lead.maxRecordingMinutes;
  return cap === -1 || minutes <= cap;
}

/** Public-safe view (strip nothing — entitlements are public knowledge). */
export function publicEntitlements(plan) {
  const t = entitlementsFor(plan);
  return {
    plan,
    label: t.label,
    files:    t.files,
    lead:     t.lead,
    myhire:   t.myhire,
    command:  t.command,
    aiCredits:        t.aiCredits,
    teamSeatsIncluded: t.teamSeatsIncluded,
    sso:              t.sso,
    customDomain:     t.customDomain,
    prioritySupport:  t.prioritySupport
  };
}

/** Normalize a Stripe price ID → plan name via env var PRICE_TO_PLAN_JSON */
export function planFromPriceId(priceId) {
  try {
    const map = JSON.parse(process.env.PRICE_TO_PLAN_JSON || '{}');
    return map[priceId] || null;
  } catch { return null; }
}
