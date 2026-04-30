import test from "node:test";
import assert from "node:assert/strict";

import { parseMultipartFormData } from "../src/lib/multipart.mjs";

test("parseMultipartFormData extracts text fields and files", () => {
  const boundary = "----MyHireBoundary";
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="firstName"',
    "",
    "Alicia",
    `--${boundary}`,
    'Content-Disposition: form-data; name="resume"; filename="resume.pdf"',
    "Content-Type: application/pdf",
    "",
    "%PDF-test-data",
    `--${boundary}--`,
    ""
  ].join("\r\n");

  const parsed = parseMultipartFormData({
    body,
    contentType: `multipart/form-data; boundary=${boundary}`
  });

  assert.equal(parsed.fields.firstName, "Alicia");
  assert.equal(parsed.files.resume[0].filename, "resume.pdf");
  assert.equal(parsed.files.resume[0].contentType, "application/pdf");
  assert.equal(parsed.files.resume[0].data.toString("utf8"), "%PDF-test-data");
});
