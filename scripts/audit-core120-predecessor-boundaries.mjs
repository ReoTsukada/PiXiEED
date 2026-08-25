#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const roots = [
  "pixiedraw2/src/core/core-100",
  "pixiedraw2/src/core/core-110",
  "pixiedraw2/src/fp-004",
  "pixiedraw2/src/fp-005",
  "pixiedraw2/src/fp-007",
];
const forbiddenImport = /(?:from|import\s*\()\s*["'][^"']*(?:^|[\\/])(pixiedraw|supabase|market|pixisync|PiXiSYNC|production)[^"']*["']/i;
const forbiddenRuntimeSecretAccess = /(?:Deno\.env\.get|process\.env|import\.meta\.env|sk_(?:live|test)_|-----BEGIN [A-Z0-9 ]+-----)/i;

function walk(relative) {
  const absolute = path.resolve(relative);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return [relative];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relative, entry.name);
    return entry.isDirectory() ? walk(child) : [child];
  });
}

const findings = [];
for (const root of roots) {
  for (const file of walk(root).filter((item) => /\.(ts|tsx|js|mjs)$/.test(item))) {
    const source = fs.readFileSync(file, "utf8");
    if (forbiddenImport.test(source)) findings.push({ file, code: "FORBIDDEN_PRODUCTION_IMPORT" });
    if (forbiddenRuntimeSecretAccess.test(source)) findings.push({ file, code: "RUNTIME_SECRET_OR_PROVIDER_TOKEN_ACCESS" });
  }
}
const result = {
  auditVersion: "CORE120_BOUNDARY_AUDIT_V1",
  roots,
  findings,
  status: findings.length === 0 ? "PASS" : "BLOCKED",
};
console.log(JSON.stringify(result, null, 2));
if (findings.length > 0) process.exitCode = 1;
