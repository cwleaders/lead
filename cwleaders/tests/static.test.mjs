import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = "/Users/bassinet/Documents/Playground/CW Leaders/public";

test("homepage includes canonical, social metadata, and structured data", async () => {
  const html = await readFile(`${root}/index.html`, "utf8");
  assert.match(html, /rel="canonical" href="https:\/\/myhire\.cwleaders\.com\/"/);
  assert.match(html, /property="og:image" content="https:\/\/myhire\.cwleaders\.com\/assets\/brand\/og-home\.png"/);
  assert.match(html, /"@type": "Organization"/);
});

test("apply page includes form endpoint and thank-you redirect hooks", async () => {
  const html = await readFile(`${root}/apply/index.html`, "utf8");
  assert.match(html, /id="application-form"/);
  assert.match(html, /data-api-endpoint="\/api\/applications"/);
  assert.match(html, /name="sourcePage" value="\/apply\/"/);
});

test("positions page includes current opening and dedicated social metadata", async () => {
  const html = await readFile(`${root}/positions/index.html`, "utf8");
  assert.match(html, /Strategist and Operationalist 1 \(SO1\)/);
  assert.match(
    html,
    /property="og:image"[\s\S]*content="https:\/\/myhire\.cwleaders\.com\/assets\/brand\/og-positions\.png"/
  );
});

test("role page includes JobPosting schema and role-aware apply links", async () => {
  const html = await readFile(`${root}/StrategistandOperationalist1/index.html`, "utf8");
  assert.match(html, /"@type": "JobPosting"/);
  assert.match(
    html,
    /property="og:image" content="https:\/\/myhire\.cwleaders\.com\/assets\/brand\/og-so1\.png"/
  );
  assert.match(
    html,
    /\/apply\/\?role=Strategist%20and%20Operationalist%201%20\(SO1\)&source=%2FStrategistandOperationalist1%2F/
  );
});

test("robots, sitemap, and llms documents exist", async () => {
  const robots = await readFile(`${root}/robots.txt`, "utf8");
  const sitemap = await readFile(`${root}/sitemap.xml`, "utf8");
  const llms = await readFile(`${root}/llms.txt`, "utf8");
  assert.match(robots, /Sitemap: https:\/\/myhire\.cwleaders\.com\/sitemap\.xml/);
  assert.match(sitemap, /https:\/\/myhire\.cwleaders\.com\/faq\//);
  assert.match(sitemap, /https:\/\/myhire\.cwleaders\.com\/positions\//);
  assert.match(sitemap, /https:\/\/myhire\.cwleaders\.com\/StrategistandOperationalist1\//);
  assert.match(llms, /CW Leaders/);
  assert.match(llms, /Strategist and Operationalist 1/);
});
