import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { getRuntimeEntryFiles } from "./stage-web-assets.mjs";

const execFile = promisify(execFileCallback);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(appRoot, "../..");
const runtimeFiles = getRuntimeEntryFiles("pixiedraw2");
assert.ok(Array.isArray(runtimeFiles), "pixiedraw2 runtime allowlist is missing");

async function listFiles(rootPath, prefix = "") {
  const files = [];
  const entries = await readdir(rootPath, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolutePath, relativePath));
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

function expectedFiles(prefix) {
  return runtimeFiles
    .map((relativePath) => (prefix ? `${prefix}/${relativePath}` : relativePath))
    .sort((left, right) => left.localeCompare(right));
}

async function assertDirectoryMatches(rootPath, prefix) {
  const actual = (await listFiles(rootPath)).sort((left, right) =>
    left.localeCompare(right)
  );
  assert.deepEqual(actual, expectedFiles(prefix), `${prefix} runtime files must match allowlist`);
  return actual.length;
}

async function apkRuntimeFiles(apkPath) {
  const { stdout } = await execFile("unzip", ["-Z1", apkPath], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return stdout
    .split(/\r?\n/u)
    .map((entry) => entry.trim().replace(/\/$/u, ""))
    .filter((entry) => entry.startsWith("assets/public/pixiedraw2/"))
    .sort((left, right) => left.localeCompare(right));
}

const webRoot = path.join(appRoot, "dist", "web", "pixiedraw2");
const androidRoot = path.join(
  appRoot,
  "android",
  "app",
  "src",
  "main",
  "assets",
  "public",
  "pixiedraw2",
);
const iosRoot = path.join(
  appRoot,
  "ios",
  "App",
  "App",
  "public",
  "pixiedraw2",
);
const apkPath = path.join(
  appRoot,
  "android",
  "app",
  "build",
  "outputs",
  "apk",
  "debug",
  "app-debug.apk",
);

const webFiles = await assertDirectoryMatches(webRoot, "");
const androidFiles = await assertDirectoryMatches(androidRoot, "");
const iosFiles = await assertDirectoryMatches(iosRoot, "");
const apkStat = await stat(apkPath);
const apkFiles = await apkRuntimeFiles(apkPath);
const expectedApkFiles = expectedFiles("assets/public/pixiedraw2");
assert.deepEqual(
  apkFiles,
  expectedApkFiles,
  "APK pixiedraw2 runtime files must match allowlist",
);

console.log(JSON.stringify({
  schemaVersion: 1,
  runtimeEntry: "pixiedraw2",
  allowlistedFiles: runtimeFiles.length,
  webFiles,
  androidFiles,
  iosFiles,
  apkFiles: apkFiles.length,
  apkBytes: apkStat.size,
  forbiddenDevelopmentFiles: 0,
}));
