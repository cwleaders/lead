import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function sanitizeFileName(fileName = "document") {
  const cleaned = fileName
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned || `document-${randomUUID().slice(0, 8)}`;
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function saveLocally({ submissionId, record, files, config }) {
  const submissionDir = path.join(config.localDataDir, "applications", submissionId);
  const documentsDir = path.join(submissionDir, "documents");
  await ensureDir(documentsDir);

  const storedFiles = [];

  for (const [fieldName, file] of Object.entries(files)) {
    if (!file) {
      continue;
    }

    const safeName = sanitizeFileName(file.filename);
    const targetPath = path.join(documentsDir, safeName);
    await writeFile(targetPath, file.data);

    storedFiles.push({
      fieldName,
      filename: file.filename,
      contentType: file.contentType,
      size: file.size,
      storageKey: path.relative(config.localDataDir, targetPath),
      accessUrl: targetPath
    });
  }

  const finalRecord = {
    ...record,
    documents: storedFiles
  };

  await writeFile(
    path.join(submissionDir, "submission.json"),
    JSON.stringify(finalRecord, null, 2),
    "utf8"
  );

  return { finalRecord, storedFiles };
}

async function saveInAws({ submissionId, record, files, config }) {
  if (!config.s3Bucket) {
    throw new Error("S3_BUCKET is required when DELIVERY_MODE=aws.");
  }

  const { S3Client, PutObjectCommand, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");

  const client = new S3Client({ region: config.awsRegion });
  const baseKey = `applications/${submissionId}`;
  const storedFiles = [];

  for (const [fieldName, file] of Object.entries(files)) {
    if (!file) {
      continue;
    }

    const safeName = sanitizeFileName(file.filename);
    const key = `${baseKey}/documents/${safeName}`;
    await client.send(
      new PutObjectCommand({
        Bucket: config.s3Bucket,
        Key: key,
        Body: file.data,
        ContentType: file.contentType,
        Metadata: {
          submissionid: submissionId,
          fieldname: fieldName
        }
      })
    );

    const accessUrl = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: config.s3Bucket,
        Key: key
      }),
      { expiresIn: config.fileUrlTtlSeconds }
    );

    storedFiles.push({
      fieldName,
      filename: file.filename,
      contentType: file.contentType,
      size: file.size,
      storageKey: key,
      accessUrl
    });
  }

  const finalRecord = {
    ...record,
    documents: storedFiles
  };

  await client.send(
    new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: `${baseKey}/submission.json`,
      Body: JSON.stringify(finalRecord, null, 2),
      ContentType: "application/json"
    })
  );

  return { finalRecord, storedFiles };
}

export async function persistApplicationSubmission({ submissionId, record, files, config }) {
  if (config.deliveryMode === "aws") {
    return saveInAws({ submissionId, record, files, config });
  }

  return saveLocally({ submissionId, record, files, config });
}
