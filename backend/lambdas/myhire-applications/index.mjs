/* POST /myhire/applications
   Body (JSON, all fields validated):
     {
       firstName, lastName, email, phone,
       city, state, country,
       linkedin?, portfolio?,
       targetRole, currentTitle, currentCompany?,
       yearsExperience (number), compensation?,
       availability, workAuthorization, travelPreference,
       whyCwLeaders, standoutStrength?,
       resumeFileId?,        // from /files/presign + complete (optional during early hires)
       coverLetterFileId?,   // optional
       skillCheckToken?,     // if applying via Skill Check link
       privacyConsent: true, accuracyConsent: true,
       sourcePage?, referrer?, role?
     }

   Stores the submission in DynamoDB and emails newapp@cwleaders.com
   (and a confirmation back to the applicant) via SES. */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { ENV, ok, bad, oops, preflight, parseBody, shortId, ipHash, rateLimit, tooMany, authFromEvent } from './_shared.mjs';
import { applicantConfirmationEmail, internalHiringEmail } from './_email-templates.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));
const ses = new SESv2Client({ region: ENV.REGION });

const REQUIRED = [
  'firstName', 'lastName', 'email', 'phone',
  'city', 'state', 'country',
  'targetRole', 'currentTitle',
  'yearsExperience', 'availability',
  'workAuthorization', 'travelPreference',
  'whyCwLeaders'
];
const MAX_TEXT = 4000;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const URL_RE = /^https?:\/\//i;

function clean(v, max = 200) {
  if (v == null) return '';
  return String(v).trim().slice(0, max);
}

function validate(body) {
  const errors = {};
  for (const k of REQUIRED) {
    if (!clean(body[k])) errors[k] = 'Required';
  }
  if (body.email && !EMAIL_RE.test(clean(body.email))) errors.email = 'Invalid email';
  if (body.linkedin && !URL_RE.test(clean(body.linkedin)))
    errors.linkedin = 'Must start with http:// or https://';
  if (body.portfolio && !URL_RE.test(clean(body.portfolio)))
    errors.portfolio = 'Must start with http:// or https://';
  const yrs = Number(body.yearsExperience);
  if (!Number.isFinite(yrs) || yrs < 0 || yrs > 60) errors.yearsExperience = 'Enter 0-60';
  if (body.whyCwLeaders && clean(body.whyCwLeaders, MAX_TEXT).length < 50)
    errors.whyCwLeaders = 'Tell us a little more (50+ characters).';
  if (body.privacyConsent !== true && body.privacyConsent !== 'true')
    errors.privacyConsent = 'Required';
  if (body.accuracyConsent !== true && body.accuracyConsent !== 'true')
    errors.accuracyConsent = 'Required';
  return errors;
}

async function fileMeta(fileId) {
  if (!fileId) return null;
  try {
    const r = await ddb.send(new GetCommand({
      TableName: ENV.TABLE, Key: { pk: `FILE#${fileId}`, sk: 'META' }
    }));
    if (!r.Item) return null;
    return {
      fileId,
      name: r.Item.name,
      size: r.Item.actualSize || r.Item.size,
      type: r.Item.type,
      shareToken: r.Item.shareToken
    };
  } catch { return null; }
}

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;

  // Rate limit: 10 application submissions per hour per IP (humans don't apply more)
  const rl = await rateLimit({ event, key: 'myhire-app', limit: 10, windowSec: 3600 });
  if (!rl.ok) return tooMany(rl.retryAfter, origin);

  // U3 — if a JWT is sent (signed-in submitter), require email_verified.
  // Anonymous applications still allowed (rate-limited above) — magic-link
  // verification is the proof if the user wants to track their app via account.
  const auth = authFromEvent(event);
  if (auth && !auth.email_verified) {
    return {
      statusCode: 403,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'email_not_verified',
                             message: 'Verify your email before submitting an application.' })
    };
  }

  try {
    const body = parseBody(event);
    // honeypot
    if (clean(body.companyWebsite)) {
      return ok({ ok: true, submissionId: 'screened', redirectUrl: '/thank-you/?submission=screened' }, origin);
    }

    const errors = validate(body);
    if (Object.keys(errors).length) {
      return { statusCode: 400, headers: pf?.headers || { 'content-type': 'application/json',
          'access-control-allow-origin': origin || '*' },
        body: JSON.stringify({ error: 'Validation failed.', fields: errors }) };
    }

    const submissionId = `app_${shortId(16)}`;
    const submittedAt = new Date().toISOString();

    const [resume, cover] = await Promise.all([
      fileMeta(body.resumeFileId),
      fileMeta(body.coverLetterFileId)
    ]);

    const record = {
      pk: `APPLICATION#${submissionId}`, sk: 'META',
      gsi1pk: `EMAIL#${clean(body.email).toLowerCase()}`, gsi1sk: `APP#${submittedAt}`,
      gsi2pk: 'APPLICATIONS', gsi2sk: submittedAt,
      submissionId, submittedAt,
      personal: {
        firstName: clean(body.firstName, 80),
        lastName:  clean(body.lastName, 80),
        email:     clean(body.email).toLowerCase(),
        phone:     clean(body.phone, 40),
        linkedin:  clean(body.linkedin, 300),
        portfolio: clean(body.portfolio, 300)
      },
      location: {
        city:    clean(body.city, 100),
        state:   clean(body.state, 100),
        country: clean(body.country, 100)
      },
      professional: {
        targetRole:      clean(body.targetRole, 200),
        currentTitle:    clean(body.currentTitle, 200),
        currentCompany:  clean(body.currentCompany, 200),
        yearsExperience: Number(body.yearsExperience),
        compensation:    clean(body.compensation, 200)
      },
      preferences: {
        availability:      clean(body.availability, 200),
        workAuthorization: clean(body.workAuthorization, 200),
        travelPreference:  clean(body.travelPreference, 200)
      },
      narrative: {
        whyCwLeaders:     clean(body.whyCwLeaders, MAX_TEXT),
        standoutStrength: clean(body.standoutStrength, MAX_TEXT)
      },
      consents: { privacyConsent: true, accuracyConsent: true },
      attachments: { resume, coverLetter: cover },
      skillCheckToken: clean(body.skillCheckToken, 64) || null,
      source: {
        page:      clean(body.sourcePage, 300),
        referrer:  clean(body.referrer, 500) || event.headers?.referer || null,
        userAgent: event.headers?.['user-agent'] || null,
        ipHash:    ipHash(event)
      }
    };

    await ddb.send(new PutCommand({ TableName: ENV.TABLE, Item: record }));

    // Link Skill Check submission if present
    if (record.skillCheckToken) {
      await ddb.send(new UpdateCommand({
        TableName: ENV.TABLE,
        Key: { pk: `SKILLCHECK#${record.skillCheckToken}`, sk: 'META' },
        UpdateExpression: 'SET applicationId = :a, applicantEmail = :e, completedAt = :t',
        ExpressionAttributeValues: {
          ':a': submissionId, ':e': record.personal.email, ':t': submittedAt
        }
      })).catch(e => console.warn('skillcheck link failed', e.message));
    }

    // Internal notification
    const sesFrom = process.env.SES_FROM || 'MyHire <noreply@cwleaders.com>';
    const internalTo = process.env.MYHIRE_INTERNAL_EMAIL || 'newapp@cwleaders.com';

    sendInternal(record, sesFrom, internalTo).catch(e => console.warn('internal email', e.message));
    sendApplicantConfirmation(record, sesFrom).catch(e => console.warn('applicant email', e.message));

    return ok({
      ok: true,
      submissionId,
      redirectUrl: `/thank-you/?submission=${encodeURIComponent(submissionId)}`
    }, origin);
  } catch (err) {
    console.error('myhire-applications', err);
    return oops(err.message, origin);
  }
};

async function sendInternal(rec, from, to) {
  const tmpl = internalHiringEmail({ rec });
  await ses.send(new SendEmailCommand({
    FromEmailAddress: from,
    Destination: { ToAddresses: [to] },
    Content: { Simple: {
      Subject: { Data: tmpl.subject },
      Body: { Html: { Data: tmpl.html }, Text: { Data: tmpl.text } }
    }}
  }));
}

async function sendApplicantConfirmation(rec, from) {
  const tmpl = applicantConfirmationEmail({ rec });
  await ses.send(new SendEmailCommand({
    FromEmailAddress: from,
    Destination: { ToAddresses: [rec.personal.email] },
    Content: { Simple: {
      Subject: { Data: tmpl.subject },
      Body: { Html: { Data: tmpl.html }, Text: { Data: tmpl.text } }
    }}
  }));
}
