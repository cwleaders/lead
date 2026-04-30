import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createApplicantConfirmationEmail,
  createInternalApplicationEmail
} from "./templates.mjs";

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function writeLocalEmail({ prefix, to, replyTo, message, config }) {
  const outboxDir = path.join(config.localDataDir, "outbox");
  await ensureDir(outboxDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(outboxDir, `${timestamp}-${prefix}.json`);
  await writeFile(
    filePath,
    JSON.stringify(
      {
        to,
        replyTo,
        ...message
      },
      null,
      2
    ),
    "utf8"
  );
}

async function sendWithSes({ to, replyTo, message, config }) {
  const { SESv2Client, SendEmailCommand } = await import("@aws-sdk/client-sesv2");
  const client = new SESv2Client({ region: config.awsRegion });
  await client.send(
    new SendEmailCommand({
      FromEmailAddress: config.sesFromEmail,
      Destination: {
        ToAddresses: Array.isArray(to) ? to : [to]
      },
      ReplyToAddresses: replyTo ? (Array.isArray(replyTo) ? replyTo : [replyTo]) : undefined,
      Content: {
        Simple: {
          Subject: {
            Data: message.subject,
            Charset: "UTF-8"
          },
          Body: {
            Html: {
              Data: message.html,
              Charset: "UTF-8"
            },
            Text: {
              Data: message.text,
              Charset: "UTF-8"
            }
          }
        }
      }
    })
  );
}

async function deliverMessage({ prefix, to, replyTo, message, config }) {
  if (config.deliveryMode === "aws") {
    await sendWithSes({ to, replyTo, message, config });
    return;
  }

  await writeLocalEmail({ prefix, to, replyTo, message, config });
}

export async function deliverApplicationEmails({ application, config }) {
  const internalMessage = createInternalApplicationEmail({ application, config });
  await deliverMessage({
    prefix: "internal-application",
    to: config.internalNotificationEmail,
    replyTo: application.personal.email,
    message: internalMessage,
    config
  });

  if (!config.sendApplicantConfirmation) {
    return;
  }

  const applicantMessage = createApplicantConfirmationEmail({ application, config });
  await deliverMessage({
    prefix: "applicant-confirmation",
    to: application.personal.email,
    message: applicantMessage,
    config
  });
}
