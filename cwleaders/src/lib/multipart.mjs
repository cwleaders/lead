function boundaryFromContentType(contentType = "") {
  const match = contentType.match(/boundary="?([^=";]+)"?/i);
  return match?.[1] || "";
}

function appendValue(target, key, value) {
  if (target[key] === undefined) {
    target[key] = value;
    return;
  }

  target[key] = Array.isArray(target[key]) ? [...target[key], value] : [target[key], value];
}

function trimPart(part) {
  return part.replace(/^\r\n/, "").replace(/\r\n$/, "");
}

function parseDisposition(header = "") {
  const name = header.match(/name="([^"]+)"/i)?.[1];
  const filename = header.match(/filename="([^"]*)"/i)?.[1];
  return { name, filename };
}

export function parseMultipartFormData({
  body = "",
  contentType = "",
  isBase64Encoded = false
}) {
  const boundary = boundaryFromContentType(contentType);

  if (!boundary) {
    throw new Error("Missing multipart boundary.");
  }

  const sourceBuffer = isBase64Encoded
    ? Buffer.from(body, "base64")
    : Buffer.from(body, "utf8");

  const raw = sourceBuffer.toString("latin1");
  const delimiter = `--${boundary}`;
  const parts = raw
    .split(delimiter)
    .slice(1, -1)
    .map((part) => trimPart(part))
    .filter(Boolean);

  const fields = {};
  const files = {};

  for (const part of parts) {
    const separatorIndex = part.indexOf("\r\n\r\n");
    if (separatorIndex === -1) {
      continue;
    }

    const headerBlock = part.slice(0, separatorIndex);
    const contentBlock = part.slice(separatorIndex + 4);
    const headers = headerBlock.split("\r\n");
    const dispositionHeader = headers.find((header) =>
      header.toLowerCase().startsWith("content-disposition:")
    );

    if (!dispositionHeader) {
      continue;
    }

    const { name, filename } = parseDisposition(dispositionHeader);
    if (!name) {
      continue;
    }

    const contentTypeHeader =
      headers
        .find((header) => header.toLowerCase().startsWith("content-type:"))
        ?.split(":")
        .slice(1)
        .join(":")
        .trim() || "application/octet-stream";

    if (filename !== undefined) {
      const binary = contentBlock.replace(/\r\n$/, "");
      const file = {
        fieldName: name,
        filename,
        contentType: contentTypeHeader,
        size: Buffer.byteLength(binary, "latin1"),
        data: Buffer.from(binary, "latin1")
      };

      if (!files[name]) {
        files[name] = [];
      }

      files[name].push(file);
      continue;
    }

    appendValue(fields, name, contentBlock.replace(/\r\n$/, ""));
  }

  return { fields, files };
}
