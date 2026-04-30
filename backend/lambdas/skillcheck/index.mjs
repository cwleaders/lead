/* Skill Check — the bridge between MyHire and LEAD desktop.

   Routes:
     POST /skillcheck/create  (auth: hiring manager)
       body: { positionId, applicantEmail?, taskBrief, durationMinutes, recordingRequired }
       → { token, launchUrl, lead://link, expires }

     GET  /skillcheck/{token}
       → returns task brief + position context (used by MyHire apply page and the
         desktop app on launch via lead:// custom URL handler)

     POST /skillcheck/{token}/start
       body: { applicantEmail }
       → marks the check as started; returns presign info for the recording upload

     POST /skillcheck/{token}/complete
       body: { recordingFileId? }   // file from /files/presign+complete
       → marks the check complete and links the recording */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ENV, ok, bad, notFound, oops, preflight, parseBody, shortId, authFromEvent } from './_shared.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;
  const method = event.requestContext?.http?.method;
  const rawPath = event.rawPath || event.requestContext?.http?.path || '';
  const token = event.pathParameters?.token;

  try {
    if (method === 'POST' && rawPath === '/skillcheck/create') {
      return await create(event, origin);
    }
    if (method === 'GET' && token && !rawPath.endsWith('/start') && !rawPath.endsWith('/complete')) {
      return await get(token, origin);
    }
    if (method === 'POST' && token && rawPath.endsWith('/start')) {
      return await start(token, event, origin);
    }
    if (method === 'POST' && token && rawPath.endsWith('/complete')) {
      return await complete(token, event, origin);
    }
    return notFound('route not found', origin);
  } catch (err) {
    console.error('skillcheck', err);
    return oops(err.message, origin);
  }
};

async function create(event, origin) {
  const auth = authFromEvent(event);
  if (!auth) return bad('sign in required to create a Skill Check', origin);

  const { positionId, applicantEmail, taskBrief, durationMinutes = 10, recordingRequired = true } = parseBody(event);
  if (!positionId || !taskBrief) return bad('positionId and taskBrief required', origin);

  const t = shortId(16);
  const now = Date.now();
  const expiresAt = new Date(now + 30 * 24 * 3600_000).toISOString(); // 30d window

  await ddb.send(new PutCommand({
    TableName: ENV.TABLE,
    Item: {
      pk: `SKILLCHECK#${t}`, sk: 'META',
      gsi1pk: `SKILLCHECK#${t}`, gsi1sk: 'META',
      gsi2pk: `MANAGER#${auth.email}`, gsi2sk: `SKILLCHECK#${now}`,
      token: t,
      positionId,
      taskBrief: String(taskBrief).slice(0, 4000),
      durationMinutes: Math.min(60, Math.max(1, Number(durationMinutes))),
      recordingRequired: !!recordingRequired,
      createdBy: auth.email,
      applicantEmail: applicantEmail || null,
      status: 'pending',
      createdAt: new Date(now).toISOString(),
      expiresAt
    }
  }));

  return ok({
    token: t,
    launchUrl: `https://myhire.cwleaders.com/skill-check/?t=${t}`,
    leadAppUrl: `lead://skillcheck/${t}`,
    expiresAt
  }, origin);
}

async function get(token, origin) {
  const r = await ddb.send(new GetCommand({
    TableName: ENV.TABLE, Key: { pk: `SKILLCHECK#${token}`, sk: 'META' }
  }));
  const item = r.Item;
  if (!item) return notFound('skill check not found or expired', origin);
  if (item.expiresAt && new Date(item.expiresAt) < new Date()) {
    return notFound('this link has expired', origin);
  }
  return ok({
    token: item.token,
    positionId: item.positionId,
    taskBrief: item.taskBrief,
    durationMinutes: item.durationMinutes,
    recordingRequired: item.recordingRequired,
    status: item.status,
    expiresAt: item.expiresAt
  }, origin);
}

async function start(token, event, origin) {
  const { applicantEmail } = parseBody(event);
  if (!applicantEmail) return bad('applicantEmail required', origin);

  await ddb.send(new UpdateCommand({
    TableName: ENV.TABLE,
    Key: { pk: `SKILLCHECK#${token}`, sk: 'META' },
    UpdateExpression: 'SET #s = :s, applicantEmail = :e, startedAt = :t',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':s': 'started', ':e': applicantEmail, ':t': new Date().toISOString()
    }
  }));
  return ok({ ok: true, presignHint: '/files/presign' }, origin);
}

async function complete(token, event, origin) {
  const { recordingFileId } = parseBody(event);
  await ddb.send(new UpdateCommand({
    TableName: ENV.TABLE,
    Key: { pk: `SKILLCHECK#${token}`, sk: 'META' },
    UpdateExpression: 'SET #s = :s, recordingFileId = :r, completedAt = :t',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':s': 'completed',
      ':r': recordingFileId || null,
      ':t': new Date().toISOString()
    }
  }));
  return ok({ ok: true }, origin);
}
