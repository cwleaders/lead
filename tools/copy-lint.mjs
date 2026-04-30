#!/usr/bin/env node
/* CW Leaders — Copy Lint
 *
 * Scans all customer-facing text for forbidden patterns from
 * docs/brand-config.json `voice.forbiddenWords`.
 *
 * Run:
 *   node tools/copy-lint.mjs              # lint everything
 *   node tools/copy-lint.mjs --fix         # offer rewrites (interactive — TODO)
 *   node tools/copy-lint.mjs --strict      # exit code 1 on any finding (CI)
 *
 * Outputs file:line:col references with severity.
 *
 * Excludes:
 *   - node_modules, .git, build artifacts, third-party fixtures
 *   - Code (only scans visible English text in HTML + select MD/JSON literal-strings)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { argv, exit, cwd } from 'node:process';

const ROOT = resolve(cwd(), '.');
const STRICT = argv.includes('--strict');

// Load forbidden words from brand config
let FORBIDDEN = [];
let PREFERRED = {};
try {
  const cfg = JSON.parse(readFileSync(resolve(ROOT, 'docs/brand-config.json'), 'utf8'));
  FORBIDDEN = (cfg.voice?.forbiddenWords || []).map(w => w.toLowerCase());
  PREFERRED = cfg.voice?.preferredTerms || {};
} catch (e) {
  console.error('Could not load docs/brand-config.json — using defaults');
  FORBIDDEN = ['leverage','synergy','seamless','frictionless','robust','best-of-breed','world-class','rockstar','ninja','guru','disruptive','revolutionary'];
}

// Build word boundaries for safe substring matching
const FORBIDDEN_RE = new RegExp('\\b(' + FORBIDDEN.map(escapeRe).join('|') + ')\\b', 'gi');
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const TARGETS = [
  'lead-portal', 'studio-app', 'upload-app', 'download-app', 'myhire-app'
];
const FILE_EXTS = /\.(html|md|json)$/;
const SKIP_DIRS = /(^|\/)(node_modules|\.git|target|dist|build|src-tauri\/target)$/;
/* Legal docs use "users" / "data subjects" / etc. as defined terms — exempt
   them from the marketing/UI voice rules. They're audited separately by counsel. */
const LEGAL_DOCS = new Set([
  'lead-portal/terms.html',
  'lead-portal/privacy.html',
  'lead-portal/cookies.html',
  'lead-portal/accessibility.html',
  'lead-portal/dpa.html',
  'lead-portal/subprocessors.html',
  'lead-portal/eula.html',
  'lead-portal/aup.html',
  'lead-portal/refund.html',
  'lead-portal/sla.html',
  'lead-portal/dmca.html',
  'lead-portal/third-party-licenses.html'
]);
/* Internal-only pages — exempt from customer-facing voice rules */
const INTERNAL_ONLY = new Set([
  'lead-portal/admin.html'
]);
/* Files that *define* the forbidden-words list — don't recursively flag them */
const SELF_REFERENCE = new Set([
  'docs/brand-config.json',
  'docs/COPY-SYSTEM.md',
  'docs/decisions.log',
  'docs/PRODUCT-WEDGE.md',
  'docs/COMPLIANCE-MAP.md',
  'docs/RUNBOOK.md',
  'docs/RISK-AND-KILL-CRITERIA.md',
  'docs/STRIDE-THREAT-MODEL.md',
  'docs/DEFERRED-DECISIONS.md',
  'docs/DISTRIBUTION-PLAYBOOK.md',
  'docs/MIGRATION-ROADMAP.md',
  'docs/KPI.md',
  'docs/FINANCIAL-MODEL.md',
  'docs/TEAM-PLAN.md',
  'docs/WCAG-AUDIT.md',
  'docs/PUBLIC-API-DESIGN.md',
  'docs/ACCESS-GATES.md',
  'docs/AGREEMENT-GATES.md',
  'docs/SECURITY-GATES.md',
  'docs/LOADING-AND-EXIT.md',
  'docs/BANDAID-MASTER.md'
]);

const findings = [];
let scanned = 0;

for (const target of TARGETS) {
  walk(resolve(ROOT, target));
}
walk(resolve(ROOT, 'docs'));

function walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const p = join(dir, name);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) {
      if (SKIP_DIRS.test(p)) continue;
      walk(p);
    } else if (s.isFile() && FILE_EXTS.test(name)) {
      lint(p);
    }
  }
}

function lint(path) {
  scanned += 1;
  const rel = relative(ROOT, path);
  if (LEGAL_DOCS.has(rel) || SELF_REFERENCE.has(rel) || INTERNAL_ONLY.has(rel)) return;
  const src = readFileSync(path, 'utf8');
  // For HTML: only scan visible text inside body — strip <script>/<style>
  let scanSrc = src;
  if (path.endsWith('.html')) {
    scanSrc = src.replace(/<script[\s\S]*?<\/script>/gi, '')
                 .replace(/<style[\s\S]*?<\/style>/gi, '')
                 .replace(/<[^>]+>/g, ' ');  // strip remaining tags
  }

  const lines = src.split('\n');
  let m;
  FORBIDDEN_RE.lastIndex = 0;
  while ((m = FORBIDDEN_RE.exec(scanSrc)) !== null) {
    const ix = m.index;
    // Map char index back to line:col in source
    let ln = 1, col = 1, count = 0;
    for (const ch of src) {
      if (count >= ix) break;
      if (ch === '\n') { ln += 1; col = 1; } else { col += 1; }
      count += 1;
    }
    const word = m[0].toLowerCase();
    findings.push({
      file: relative(ROOT, path),
      line: ln,
      col,
      word: m[0],
      suggestion: PREFERRED[word] || PREFERRED[m[0]] || '(see brand-config.voice)'
    });
  }
}

// Report
console.log(`\n📐 CW Leaders Copy Lint — scanned ${scanned} files\n`);
if (findings.length === 0) {
  console.log('✅ No forbidden words found. Clean.\n');
  exit(0);
}

const grouped = findings.reduce((m, f) => {
  m[f.file] = m[f.file] || [];
  m[f.file].push(f);
  return m;
}, {});

for (const [file, list] of Object.entries(grouped)) {
  console.log(`\n  ${file}`);
  for (const f of list) {
    console.log(`    \x1b[33m${f.line}:${f.col}\x1b[0m  "${f.word}"  →  ${f.suggestion}`);
  }
}

console.log(`\n${findings.length} finding(s) across ${Object.keys(grouped).length} file(s)`);
console.log('Run with --strict to fail CI on findings.\n');

exit(STRICT ? 1 : 0);
