import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { handler as applicationHandler } from "../api/applications.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const port = Number.parseInt(process.env.PORT || "4321", 10);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

function contentTypeFor(filePath) {
  return mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

async function handleApi(req, res, url) {
  if (url.pathname !== "/api/applications") {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Not found." }));
    return;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const bodyBuffer = Buffer.concat(chunks);
  const event = {
    body: bodyBuffer.toString("base64"),
    headers: req.headers,
    isBase64Encoded: true,
    rawPath: url.pathname,
    requestContext: {
      http: {
        method: req.method,
        path: url.pathname
      }
    }
  };

  const response = await applicationHandler(event);
  res.writeHead(response.statusCode || 200, response.headers || {});
  res.end(response.body || "");
}

async function handleStatic(res, requestPath) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const initialPath = normalizedPath.endsWith("/")
    ? path.join(publicDir, normalizedPath, "index.html")
    : path.join(publicDir, normalizedPath);

  const safePath = path.normalize(initialPath);
  if (!safePath.startsWith(publicDir)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  try {
    let targetPath = safePath;
    const fileStats = await stat(safePath).catch(() => null);
    if (fileStats?.isDirectory()) {
      targetPath = path.join(safePath, "index.html");
    }

    const payload = await readFile(targetPath);
    res.writeHead(200, {
      "Content-Type": contentTypeFor(targetPath),
      "Cache-Control": "no-store"
    });
    res.end(payload);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `localhost:${port}`}`);

  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }

  await handleStatic(res, url.pathname);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`MyHire preview server is running at http://127.0.0.1:${port}`);
});
