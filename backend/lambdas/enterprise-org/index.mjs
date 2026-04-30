/* POST /enterprise/org           → create org (auth required, becomes owner)
   GET  /enterprise/org           → fetch caller's orgs
   POST /enterprise/org/{id}/invite { email, role }  → invite a member
   GET  /enterprise/org/{id}/members
   POST /enterprise/org/{id}/consent { signature, version }  → record consent
   GET  /enterprise/org/{id}/telemetry?from=&to=  → recent telemetry events

   All routes require Bearer JWT (auth-verify).
*/

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import crypto from 'node:crypto';
import { ENV, ok, bad, notFound, oops, preflight, parseBody, authFromEvent, shortId } from './_shared.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;
  const auth = authFromEvent(event);
  if (!auth) return bad('unauthorized', origin);

  const path = event.rawPath || event.requestContext?.http?.path || '';
  const method = event.requestContext?.http?.method || 'GET';
  const orgId = event.pathParameters?.id;

  try {
    // POST /enterprise/org
    if (method === 'POST' && /\/enterprise\/org$/.test(path)) {
      const { name, plan } = parseBody(event);
      if (!name) return bad('name required', origin);
      const id = shortId(10);
      const now = new Date().toISOString();
      const item = {
        pk: `ORG#${id}`, sk: 'META',
        gsi1pk: `ORG#${id}`, gsi1sk: 'META',
        gsi2pk: `USER#${auth.sub}`, gsi2sk: `ORG#${now}`,
        orgId: id, name,
        plan: plan || 'enterprise_org',
        ownerId: auth.sub, ownerEmail: auth.email,
        createdAt: now,
        seats: 1
      };
      await ddb.send(new PutCommand({ TableName: ENV.TABLE, Item: item }));
      // Add owner as first member
      await ddb.send(new PutCommand({
        TableName: ENV.TABLE,
        Item: {
          pk: `ORG#${id}`, sk: `MEMBER#${auth.email}`,
          gsi2pk: `MEMBER#${auth.email}`, gsi2sk: `ORG#${id}`,
          email: auth.email, userId: auth.sub,
          role: 'owner', status: 'active',
          joinedAt: now
        }
      }));
      return ok({ org: { id, name, plan: item.plan } }, origin);
    }

    // GET /enterprise/org  (list caller's orgs)
    if (method === 'GET' && /\/enterprise\/org$/.test(path)) {
      const memberships = await ddb.send(new QueryCommand({
        TableName: ENV.TABLE,
        IndexName: 'gsi2',
        KeyConditionExpression: 'gsi2pk = :p',
        ExpressionAttributeValues: { ':p': `MEMBER#${auth.email}` }
      }));
      const orgs = [];
      for (const m of (memberships.Items || [])) {
        const orgIdFromSk = m.gsi2sk.replace('ORG#', '');
        const o = await ddb.send(new GetCommand({
          TableName: ENV.TABLE, Key: { pk: `ORG#${orgIdFromSk}`, sk: 'META' }
        }));
        if (o.Item) orgs.push({ id: o.Item.orgId, name: o.Item.name, role: m.role, plan: o.Item.plan });
      }
      return ok({ orgs }, origin);
    }

    if (!orgId) return notFound('orgId required', origin);

    // Membership check
    const member = await ddb.send(new GetCommand({
      TableName: ENV.TABLE, Key: { pk: `ORG#${orgId}`, sk: `MEMBER#${auth.email}` }
    }));
    if (!member.Item) return bad('not a member of this org', origin);
    const role = member.Item.role;

    // POST /enterprise/org/{id}/invite
    if (method === 'POST' && path.endsWith('/invite')) {
      if (!['owner','admin'].includes(role)) return bad('forbidden', origin);
      const { email, role: inviteRole } = parseBody(event);
      if (!email) return bad('email required', origin);
      const norm = email.trim().toLowerCase();
      const now = new Date().toISOString();
      await ddb.send(new PutCommand({
        TableName: ENV.TABLE,
        Item: {
          pk: `ORG#${orgId}`, sk: `MEMBER#${norm}`,
          gsi2pk: `MEMBER#${norm}`, gsi2sk: `ORG#${orgId}`,
          email: norm, role: inviteRole || 'employee',
          status: 'invited', invitedBy: auth.email, invitedAt: now
        }
      }));
      return ok({ ok: true }, origin);
    }

    // GET /enterprise/org/{id}/members
    if (method === 'GET' && path.endsWith('/members')) {
      const r = await ddb.send(new QueryCommand({
        TableName: ENV.TABLE,
        KeyConditionExpression: 'pk = :p AND begins_with(sk, :s)',
        ExpressionAttributeValues: { ':p': `ORG#${orgId}`, ':s': 'MEMBER#' }
      }));
      return ok({
        members: (r.Items || []).map(m => ({
          email: m.email, role: m.role, status: m.status, joinedAt: m.joinedAt || m.invitedAt
        }))
      }, origin);
    }

    // POST /enterprise/org/{id}/consent  — Compliance-by-Design (CPRA proof)
    if (method === 'POST' && path.endsWith('/consent')) {
      const { signature, version, fingerprint } = parseBody(event);
      if (!signature) return bad('signature required', origin);
      const consentHash = crypto.createHash('sha256')
        .update(`${auth.email}|${orgId}|${signature}|${version || 'v1'}`)
        .digest('hex');
      const now = new Date().toISOString();
      await ddb.send(new PutCommand({
        TableName: ENV.TABLE,
        Item: {
          pk: `ORG#${orgId}`, sk: `CONSENT#${auth.email}#${now}`,
          gsi2pk: `CONSENT#${auth.email}`, gsi2sk: `T#${now}`,
          email: auth.email, orgId,
          signature, version: version || 'v1',
          fingerprint: fingerprint || null,
          consentHash,
          ipHash: event.requestContext?.http?.sourceIp ? crypto.createHash('sha256')
            .update(event.requestContext.http.sourceIp).digest('hex').slice(0, 16) : null,
          ua: event.headers?.['user-agent'] || null,
          createdAt: now
        }
      }));
      return ok({ consentHash, recordedAt: now }, origin);
    }

    // GET /enterprise/org/{id}/telemetry?from=&to=
    if (method === 'GET' && path.endsWith('/telemetry')) {
      if (!['owner','admin','manager'].includes(role)) return bad('forbidden', origin);
      const from = event.queryStringParameters?.from || new Date(Date.now() - 24*3600*1000).toISOString();
      const r = await ddb.send(new QueryCommand({
        TableName: ENV.TABLE,
        KeyConditionExpression: 'pk = :p AND sk > :s',
        ExpressionAttributeValues: { ':p': `ORG#${orgId}`, ':s': `TELEMETRY#${from}` },
        Limit: 200,
        ScanIndexForward: false
      }));
      return ok({
        events: (r.Items || []).map(e => ({
          email: e.email, kind: e.kind, severity: e.severity,
          summary: e.summary, payloadKey: e.payloadKey,
          at: e.at
        }))
      }, origin);
    }

    return notFound('unknown route', origin);
  } catch (err) {
    console.error('enterprise-org', err);
    return oops(err.message, origin);
  }
};
