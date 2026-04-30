/* Agent registry and shared helpers.
   Each agent lives in its own folder under lambdas/agents/ but the runtime
   dispatches via this registry so we can ship one Lambda for the whole foundation. */

import { aiCall, extractJson } from './_ai.mjs';

export const AGENTS = {
  capture: {
    name: 'Capture',
    description: 'Auto-records when a meeting starts, then summarizes and tags the action items.',
    glyph: '🎬',
    needsConfig: true,
    schedulable: false,
    creditEstimate: 12,
    paramsSchema: {
      keywords: { label: 'Trigger keywords (calendar)', type: 'csv', placeholder: 'standup, planning, design review' },
      autoUpload: { label: 'Auto-upload to your account', type: 'bool', default: true },
    },
  },

  courier: {
    name: 'Courier',
    description: 'Watches a folder and shares the newest file with a recipient on a schedule.',
    glyph: '📦',
    needsConfig: true,
    schedulable: true,
    creditEstimate: 1,
    paramsSchema: {
      folder:     { label: 'Folder name (in your Send library)', type: 'text', placeholder: 'designs' },
      recipient:  { label: 'Send to (email or share group)', type: 'email', placeholder: 'client@studio.com' },
      cadence:    { label: 'How often', type: 'enum', options: ['daily','weekly','on-change'], default: 'weekly' },
      messageNote: { label: 'Note to include', type: 'text', placeholder: 'Latest draft, your eyes only' },
    },
  },

  triage: {
    name: 'Triage',
    description: 'Ranks new applicants against the role description and drafts a personal first reply.',
    glyph: '📋',
    needsConfig: true,
    schedulable: true,
    creditEstimate: 8,
    paramsSchema: {
      role:        { label: 'Role title to monitor', type: 'text', placeholder: 'Strategist and Operationalist 1' },
      mustHaves:   { label: 'Non-negotiable skills (csv)', type: 'csv', placeholder: 'AWS, Rust, ops' },
      cadence:     { label: 'How often', type: 'enum', options: ['hourly','daily'], default: 'daily' },
      autoReply:   { label: 'Draft replies (still requires your approval)', type: 'bool', default: true },
    },
  },

  coach: {
    name: 'Coach',
    description: 'End-of-day visual debrief: what you shipped, where you spent time, what to start with tomorrow.',
    glyph: '🎯',
    needsConfig: false,
    schedulable: true,
    creditEstimate: 6,
    paramsSchema: {
      cadence:    { label: 'Delivery time', type: 'enum', options: ['end-of-day','morning'], default: 'end-of-day' },
      tone:       { label: 'Tone', type: 'enum', options: ['encouraging','direct','data-only'], default: 'direct' },
    },
  },

  bridge: {
    name: 'Bridge',
    description: 'When something happens in one tool, do something in another. Universal cross-tool glue.',
    glyph: '🔗',
    needsConfig: true,
    schedulable: false,
    creditEstimate: 1,
    paramsSchema: {
      trigger:  { label: 'When this happens', type: 'enum', options: ['skillcheck-submitted','file-downloaded','recording-completed','application-received'], default: 'skillcheck-submitted' },
      action:   { label: 'Do this', type: 'enum', options: ['post-to-slack','send-email','create-mindmap-node'], default: 'send-email' },
      target:   { label: 'Where (URL or email)', type: 'text', placeholder: 'https://hooks.slack.com/...' },
    },
  },
};

/** Compose a stable agent ID for a user + agent name. */
export function agentRecordId(userId, agentName) {
  return `AGENT#${userId}#${agentName}`;
}

/** Compose a run record ID. */
export function runRecordId(runId) {
  return `AGENT_RUN#${runId}`;
}

/** Default config object for an agent (uses paramsSchema defaults). */
export function defaultParams(agentName) {
  const schema = AGENTS[agentName]?.paramsSchema || {};
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if ('default' in v) out[k] = v.default;
  }
  return out;
}

/** Public-safe view of the registry for the frontend. */
export function publicRegistry() {
  return Object.entries(AGENTS).map(([id, a]) => ({
    id,
    name: a.name,
    description: a.description,
    glyph: a.glyph,
    needsConfig: a.needsConfig,
    schedulable: a.schedulable,
    creditEstimate: a.creditEstimate,
    paramsSchema: a.paramsSchema,
  }));
}

/** Re-export AI helpers for agent handlers. */
export { aiCall, extractJson };
