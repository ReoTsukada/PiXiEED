#!/usr/bin/env node

/**
 * Run a checked-in qualification command manifest and record only stable,
 * non-sensitive execution metadata. Commands are argv arrays, never shell
 * snippets, so a package cannot accidentally turn the harness into a shell.
 */
import fs from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function usage() {
  console.error("usage: node scripts/run-qualification-commands.mjs --manifest <manifest.json> --output <transcript.json>");
  process.exitCode = 2;
}

const SAFE_EXECUTABLES = new Set(["deno", "node", "python3", "git"]);
const FORBIDDEN_ARGUMENTS = /(^|[-/])(reset|checkout|clean|push|deploy|publish|migrate|cutover)(\b|[-/])/i;

function assertSafeCommand(command) {
  const executable = String(command.argv?.[0] ?? "");
  if (!SAFE_EXECUTABLES.has(executable)) {
    throw new Error(`unsupported qualification executable: ${executable}`);
  }
  const joined = command.argv.map(String).join(" ");
  if (FORBIDDEN_ARGUMENTS.test(joined) || /(^|\s)--allow-net(?:\s|$)/.test(joined)) {
    throw new Error(`forbidden qualification command argument: ${joined}`);
  }
}

function args() {
  const result = {};
  for (let index = 2; index < process.argv.length; index += 1) {
    const key = process.argv[index];
    const value = process.argv[index + 1];
    if (!key.startsWith("--") || !value) return null;
    result[key.slice(2)] = value;
    index += 1;
  }
  return result;
}

function main() {
  const options = args();
  if (!options?.manifest || !options.output) return usage();
  const manifest = readJson(options.manifest);
  if (!Array.isArray(manifest.commands) || manifest.commands.length === 0) {
    throw new Error("qualification manifest must contain commands");
  }
  const records = [];
  for (const command of manifest.commands) {
    if (!command || typeof command.id !== "string" || !Array.isArray(command.argv) || command.argv.length === 0) {
      throw new Error("each qualification command requires id and argv");
    }
    assertSafeCommand(command);
    const startedAt = Date.now();
    const result = spawnSync(command.argv[0], command.argv.slice(1), {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    records.push({
      id: command.id,
      acceptanceIds: Array.isArray(command.acceptanceIds) ? command.acceptanceIds : [],
      argv: command.argv,
      display: command.argv.map((part) => JSON.stringify(String(part))).join(" "),
      exitCode: typeof result.status === "number" ? result.status : 2,
      signal: result.signal ?? null,
      durationMs: Date.now() - startedAt,
      stdoutSha256: sha256(stdout),
      stderrSha256: sha256(stderr),
    });
  }
  const stable = {
    evidenceVersion: "QUALIFICATION_COMMAND_TRANSCRIPT_V1",
    manifestPath: options.manifest,
    commands: records,
  };
  const transcript = {
    ...stable,
    transcriptSha256: sha256(JSON.stringify(stable)),
  };
  fs.writeFileSync(options.output, `${JSON.stringify(transcript, null, 2)}\n`);
  console.log(JSON.stringify({
    output: options.output,
    transcriptSha256: transcript.transcriptSha256,
    commandCount: records.length,
    failed: records.filter((record) => record.exitCode !== 0).map((record) => record.id),
  }, null, 2));
  if (records.some((record) => record.exitCode !== 0)) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
