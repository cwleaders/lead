/* Agent runtime — single Lambda that handles all agent operations.

   Routes (all auth-required):
     GET  /agents                        → registry (public meta) + user's armed agents
     POST /agents/{name}/arm             → arm or update an agent's config + schedule
     POST /agents/{name}/disarm          → disarm
     POST /agents/{name}/run             → manually trigger a run
     GET  /agents/{name}/runs            → recent run history (last 25)

   This is the foundation — Triage and Coach have real handlers, the other 3
   are armable stubs that ship in Sprint C.5 with their full execution logic. */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { ENV, ok, bad, oops, preflight, parseBody, authFromEvent, shortId } from './_shared.mjs';
import { AGENTS, publicRegistry, agentRecordId, defaultParams } from './_agents.mjs';
import { aiCall, extractJson } from './_ai.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));

// ───────── HANDLER ───────────────────────────────────────────────────────
export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;
  const auth = authFromEvent(event);
  if (!auth) return bad('sign in required', origin);

  const method = event.requestContext?.http?.method || 'GET';
  const path = event.rawPath || '';
  const agentName = event.pathParameters?.name;

  try {
    if (method === 'GET' && /\/agents\/?$/.test(path)) return await listAll(auth, origin);
    if (agentName && !AGENTS[agentName]) return bad(`unknown agent: ${agentName}`, origin);

    if (method === 'POST' && path.endsWith('/arm'))     return await armAgent(auth, agentName, parseBody(event), origin);
    if (method === 'POST' && path.endsWith('/disarm'))  return await disarmAgent(auth, agentName, origin);
    if (method === 'POST' && path.endsWith('/run'))     return await runAgent(auth, agentName, parseBody(event), origin);
    if (method === 'GET'  && path.endsWith('/runs'))    return await listRuns(auth, agentName, origin);

    return bad('route not found', origin);
  } catch (err) {
    console.error('agent-runtime', err);
    return oops(err.message, origin);
  }
};

// ───────── LIST ALL ──────────────────────────────────────────────────────
async function listAll(auth, origin) {
  const userId = auth.email.toLowerCase();
  const armed = await ddb.send(new QueryCommand({
    TableName: ENV.TABLE,
    KeyConditionExpression: 'pk = :p AND begins_with(sk, :s)',
    ExpressionAttributeValues: { ':p': `USER#${userId}`, ':s': 'AGENT#' },
  })).catch(() => ({ Items: [] }));

  const armedMap = {};
  for (const item of armed.Items || []) {
    armedMap[item.agentName] = {
      armed: !!item.armed,
      params: item.params || {},
      cadence: item.cadence || null,
      lastRunAt: item.lastRunAt || null,
      lastRunStatus: item.lastRunStatus || null,
      nextRunAt: item.nextRunAt || null,
      runsCompleted: item.runsCompleted || 0,
      creditsUsedTotal: item.creditsUsedTotal || 0,
    };
  }

  return ok({
    agents: publicRegistry().map(a => ({ ...a, ...(armedMap[a.id] || { armed: false }) })),
  }, origin);
}

// ───────── ARM ───────────────────────────────────────────────────────────
async function armAgent(auth, name, body, origin) {
  const userId = auth.email.toLowerCase();
  const params = { ...defaultParams(name), ...(body.params || {}) };
  const cadence = body.cadence || params.cadence || null;
  const now = new Date().toISOString();

  await ddb.send(new PutCommand({
    TableName: ENV.TABLE,
    Item: {
      pk: `USER#${userId}`,
      sk: `AGENT#${name}`,
      gsi1pk: `AGENT_SCHEDULE#${cadence || 'manual'}`,
      gsi1sk: `${userId}#${name}`,
      gsi2pk: `AGENT_OWNER#${userId}`,
      gsi2sk: `AGENT#${name}`,
      agentName: name,
      armed: true,
      params,
      cadence,
      armedAt: now,
      runsCompleted: 0,
      creditsUsedTotal: 0,
    },
  }));
  return ok({ ok: true, agent: name, params, cadence }, origin);
}

// ───────── DISARM ────────────────────────────────────────────────────────
async function disarmAgent(auth, name, origin) {
  const userId = auth.email.toLowerCase();
  await ddb.send(new DeleteCommand({
    TableName: ENV.TABLE,
    Key: { pk: `USER#${userId}`, sk: `AGENT#${name}` },
  }));
  return ok({ ok: true, agent: name, disarmed: true }, origin);
}

// ───────── RUN (manual trigger) ──────────────────────────────────────────
async function runAgent(auth, name, body, origin) {
  const userId = auth.email.toLowerCase();
  const cfgResp = await ddb.send(new GetCommand({
    TableName: ENV.TABLE, Key: { pk: `USER#${userId}`, sk: `AGENT#${name}` },
  }));
  if (!cfgResp.Item) return bad('arm the agent first', origin);
  const config = cfgResp.Item;

  const runId = shortId(14);
  const startedAt = new Date().toISOString();

  let result;
  try {
    result = await dispatch(name, { auth, params: config.params, runtimeOverride: body.params || {} });
  } catch (err) {
    console.error('agent run', err);
    result = { ok: false, error: err.message, creditsUsed: 0 };
  }

  const completedAt = new Date().toISOString();
  const status = result.ok === false ? 'error' : 'success';

  // Persist the run
  await ddb.send(new PutCommand({
    TableName: ENV.TABLE,
    Item: {
      pk: `USER#${userId}`,
      sk: `AGENT_RUN#${name}#${startedAt}#${runId}`,
      gsi1pk: `AGENT_RUNS#${userId}#${name}`,
      gsi1sk: startedAt,
      ttl: Math.floor(Date.now()/1000) + 90*24*3600,
      runId, agent: name,
      startedAt, completedAt, status,
      creditsUsed: result.creditsUsed || 0,
      provider: result.provider || null,
      summary: result.summary || result.text || null,
      payload: result.payload || null,
      error: result.error || null,
    },
  }));

  // Update agent counters
  await ddb.send(new UpdateCommand({
    TableName: ENV.TABLE,
    Key: { pk: `USER#${userId}`, sk: `AGENT#${name}` },
    UpdateExpression: 'SET lastRunAt = :t, lastRunStatus = :s ADD runsCompleted :one, creditsUsedTotal :c',
    ExpressionAttributeValues: {
      ':t': startedAt, ':s': status, ':one': 1, ':c': result.creditsUsed || 0,
    },
  })).catch(() => {});

  // Bump user's monthly AI credit counter
  await bumpCredits(userId, result.creditsUsed || 0);

  return ok({ runId, status, ...result }, origin);
}

// ───────── LIST RUNS ─────────────────────────────────────────────────────
async function listRuns(auth, name, origin) {
  const userId = auth.email.toLowerCase();
  const r = await ddb.send(new QueryCommand({
    TableName: ENV.TABLE,
    IndexName: 'gsi1',
    KeyConditionExpression: 'gsi1pk = :p',
    ExpressionAttributeValues: { ':p': `AGENT_RUNS#${userId}#${name}` },
    ScanIndexForward: false,
    Limit: 25,
  })).catch(() => ({ Items: [] }));

  return ok({
    runs: (r.Items || []).map(it => ({
      runId: it.runId,
      startedAt: it.startedAt,
      completedAt: it.completedAt,
      status: it.status,
      creditsUsed: it.creditsUsed,
      provider: it.provider,
      summary: it.summary,
      error: it.error,
    })),
  }, origin);
}

async function bumpCredits(userId, n) {
  if (!n) return;
  const month = new Date().toISOString().slice(0,7);
  await ddb.send(new UpdateCommand({
    TableName: ENV.TABLE,
    Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
    UpdateExpression: 'ADD aiCreditsUsed :n',
    ExpressionAttributeValues: { ':n': n },
  })).catch(() => {});
  await ddb.send(new UpdateCommand({
    TableName: ENV.TABLE,
    Key: { pk: `USER#${userId}`, sk: `CREDITS#${month}` },
    UpdateExpression: 'ADD used :n SET updatedAt = :t',
    ExpressionAttributeValues: { ':n': n, ':t': new Date().toISOString() },
  })).catch(() => {});
}

// ───────── DISPATCH ─────────────────────────────────────────────────────
async function dispatch(agentName, ctx) {
  switch (agentName) {
    case 'triage':  return await runTriage(ctx);
    case 'coach':   return await runCoach(ctx);
    case 'capture': return await runStub('capture',
      'Capture armed. Start a recording from your Studio app — I\'ll attach a transcript and tag the action items locally.');
    case 'courier': return await runStub('courier',
      'Courier armed. The next file you drop into the configured folder will be sent to your recipient on schedule.');
    case 'bridge':  return await runStub('bridge',
      'Bridge armed. The next matching trigger event will fire your action — full webhook delivery ships in the next desktop release.');
    default: throw new Error(`no handler for ${agentName}`);
  }
}

async function runStub(name, msg) {
  return {
    ok: true,
    summary: msg,
    creditsUsed: 1,
    provider: 'mock',
    payload: { armed: true, agent: name },
  };
}

// ───────── TRIAGE (real handler) ─────────────────────────────────────────
async function runTriage(ctx) {
  const { auth, params } = ctx;
  const role = (params.role || '').trim();
  if (!role) return { ok: false, error: 'configure a role to monitor first', creditsUsed: 0 };

  // Fetch recent applications for this email's MyHire org (last 24h or last 25)
  const since = new Date(Date.now() - 7*24*3600*1000).toISOString();
  const apps = await ddb.send(new QueryCommand({
    TableName: ENV.TABLE,
    IndexName: 'gsi2',
    KeyConditionExpression: 'gsi2pk = :p AND gsi2sk > :s',
    ExpressionAttributeValues: { ':p': 'APPLICATIONS', ':s': since },
    ScanIndexForward: false,
    Limit: 50,
  })).catch(() => ({ Items: [] }));

  const matching = (apps.Items || []).filter(a =>
    !role || a.professional?.targetRole?.toLowerCase().includes(role.toLowerCase())
  ).slice(0, 20);

  if (!matching.length) {
    return {
      ok: true,
      summary: `No new applicants for "${role}" in the last 7 days.`,
      creditsUsed: 1,
      provider: 'local',
      payload: { ranked: [] },
    };
  }

  const candidatesBlock = matching.map((a, i) => `
[#${i+1}] ${a.personal.firstName} ${a.personal.lastName}
  Current: ${a.professional.currentTitle} @ ${a.professional.currentCompany || 'self'}
  Years: ${a.professional.yearsExperience}
  Why CWL: ${(a.narrative.whyCwLeaders || '').slice(0, 240)}`).join('\n');

  const prompt = `Rank these ${matching.length} applicants for the role "${role}" by fit.
Required skills: ${params.mustHaves || '(none specified)'}.

${candidatesBlock}

Respond with ONLY a JSON array, no markdown:
[
  { "submissionId": "...", "score": 0-100, "rationale": "<=18 words" }
]`;

  const ai = await aiCall({
    prompt,
    system: 'You are a senior hiring partner. Be honest, brief, and practical. No fluff.',
    temperature: 0.3,
    maxTokens: 1024,
  });

  const ranked = extractJson(ai.text) || [];
  const indexed = ranked
    .map(r => {
      const m = matching.find((a, i) =>
        r.submissionId === a.submissionId ||
        r.submissionId === `#${i+1}` ||
        r.submissionId === String(i+1)
      ) || matching[0];
      return {
        submissionId: m?.submissionId,
        name: m ? `${m.personal.firstName} ${m.personal.lastName}` : '?',
        email: m?.personal?.email,
        score: r.score,
        rationale: r.rationale,
      };
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  return {
    ok: true,
    summary: indexed.length
      ? `${indexed.length} applicant(s) ranked. Top match: ${indexed[0].name} (${indexed[0].score}/100).`
      : 'No matches.',
    creditsUsed: ai.creditsUsed,
    provider: ai.provider,
    payload: { ranked: indexed },
  };
}

// ───────── COACH (real handler) ──────────────────────────────────────────
async function runCoach(ctx) {
  const { auth, params } = ctx;
  const userId = auth.email.toLowerCase();
  const since = new Date(Date.now() - 24*3600*1000).toISOString();

  // Files shared in the last 24h
  const files = await ddb.send(new QueryCommand({
    TableName: ENV.TABLE,
    IndexName: 'gsi2',
    KeyConditionExpression: 'gsi2pk = :p AND gsi2sk > :s',
    ExpressionAttributeValues: { ':p': `USER#${auth.sub}`, ':s': `FILE#${Date.parse(since)}` },
    ScanIndexForward: false,
    Limit: 100,
  })).catch(() => ({ Items: [] }));

  // Agent runs in the last 24h
  const runs = await ddb.send(new QueryCommand({
    TableName: ENV.TABLE,
    KeyConditionExpression: 'pk = :p AND begins_with(sk, :s)',
    ExpressionAttributeValues: { ':p': `USER#${userId}`, ':s': 'AGENT_RUN#' },
    ScanIndexForward: false,
    Limit: 50,
  })).catch(() => ({ Items: [] }));

  const recentRuns = (runs.Items || []).filter(r => (r.startedAt || '') > since);
  const filesSent = (files.Items || []).length;
  const totalDownloads = (files.Items || []).reduce((s, f) => s + (f.downloadCount || 0), 0);

  const stats = `
Files shared today: ${filesSent}
Downloads on those: ${totalDownloads}
Agent runs today: ${recentRuns.length}
Tone preference: ${params.tone || 'direct'}`;

  const prompt = `Write a short end-of-day debrief in markdown for the user, based on these stats:
${stats}

Style: ${params.tone || 'direct'} (max 3 short paragraphs, friendly but honest, end with one suggested next step).`;

  const ai = await aiCall({
    prompt,
    system: 'You are a calm, observant productivity coach. Brief and useful. No filler.',
    temperature: 0.5,
    maxTokens: 512,
  });

  return {
    ok: true,
    summary: ai.text.split('\n').find(l => l.trim())?.slice(0, 160) || 'Daily debrief ready.',
    creditsUsed: ai.creditsUsed,
    provider: ai.provider,
    payload: {
      markdown: ai.text,
      stats: { filesSent, totalDownloads, agentRuns: recentRuns.length },
    },
  };
}
