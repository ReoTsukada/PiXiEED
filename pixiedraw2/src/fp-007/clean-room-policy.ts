/** FP-007 Track 2 clean-room and deterministic-input policy. */

import type { AuditStatus } from "./dependency-inventory.ts";
import { compareCodePointStrings } from "./stable-order.ts";

export interface CleanRoomFinding {
  readonly code: string;
  readonly status: AuditStatus;
  readonly subject: string;
  readonly detail: string;
}

export interface CleanRoomInput {
  readonly workspaceStatus: "clean" | "dirty" | "unknown";
  readonly generatedFiles: readonly string[];
  readonly declaredGeneratedFiles: readonly string[];
  readonly sourceTexts: readonly {
    readonly path: string;
    readonly content: string;
  }[];
  readonly usedEnvironmentNames: readonly string[];
  readonly declaredEnvironmentNames: readonly string[];
  readonly commands: readonly string[];
  readonly networkMode: "disabled" | "offline" | "unknown";
  readonly cacheMode: "disabled" | "declared" | "unknown";
}

export interface CleanRoomAudit {
  readonly documentId: "PIXIEED-FP007-CLEAN-ROOM-001";
  readonly deterministic: true;
  readonly findings: readonly CleanRoomFinding[];
  readonly status: AuditStatus;
}

const ABSOLUTE_PATH =
  /(?:^|[\s"'=:(\[,])(?:file:(?:\/\/)?|\/(?!\/)|[A-Za-z]:[\\/]|\\\\)[^\s"'`,;)}\]]*/iu;
const TIMESTAMP =
  /(?:generatedAt|measuredAt|timestamp|Date\.now|new\s+Date\s*\(|mtime|ctime|buildTime)/iu;
const HOST = /(?:os\.hostname|hostname|HOSTNAME|machineId|computerName)/iu;
const LOCALE = /(?:Intl\.|locale|LANG=|LC_ALL=|TZ=)/iu;
const RANDOM =
  /(?:Math\.random|randomUUID|randomBytes|crypto\.getRandomValues)/iu;
const CACHE =
  /(?:\.cache\b|node_modules|DENO_DIR|npm_config_cache|PLAYWRIGHT_BROWSERS_PATH)/iu;
const NETWORK =
  /(?:https?:\/\/|registry\.|jsr:|fetch\s*\(|curl\s|npm\s+(?:install|update|audit)|deno\s+(?:add|install))/iu;

function containsAbsolutePath(value: string): boolean {
  const normalized = value.replaceAll("\\", "/");
  const withoutHttpUrls = normalized.replace(
    /https?:\/\/[^\s"'`,;)}\]]*/giu,
    "",
  );
  if (/^file:(?:\/\/)?/iu.test(withoutHttpUrls)) return true;
  if (/^(?:[A-Za-z]:\/|\/|\/\/)/u.test(withoutHttpUrls)) return true;
  return ABSOLUTE_PATH.test(withoutHttpUrls);
}

function normalizedPath(path: string): string {
  const value = path.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (containsAbsolutePath(path)) return "[ABSOLUTE_PATH]";
  return value;
}

function finding(
  code: string,
  status: AuditStatus,
  subject: string,
  detail: string,
): CleanRoomFinding {
  return { code, status, subject: normalizedPath(subject), detail };
}

function statusOf(findings: readonly CleanRoomFinding[]): AuditStatus {
  if (findings.some((item) => item.status === "FAIL")) return "FAIL";
  if (findings.some((item) => item.status === "BLOCKED")) return "BLOCKED";
  if (findings.some((item) => item.status === "UNKNOWN")) return "UNKNOWN";
  return "PASS";
}

export function analyzeCleanRoom(input: CleanRoomInput): CleanRoomAudit {
  const findings: CleanRoomFinding[] = [];
  if (input.workspaceStatus === "dirty") {
    findings.push(
      finding(
        "DIRTY_WORKSPACE",
        "FAIL",
        "workspace",
        "Working tree is not a clean checkout.",
      ),
    );
  }
  if (input.workspaceStatus === "unknown") {
    findings.push(
      finding(
        "WORKSPACE_STATUS_UNKNOWN",
        "BLOCKED",
        "workspace",
        "Clean checkout status was not established.",
      ),
    );
  }
  const declared = new Set(input.declaredGeneratedFiles.map(normalizedPath));
  for (
    const path of input.generatedFiles.map(normalizedPath).sort(
      compareCodePointStrings,
    )
  ) {
    if (path === "[ABSOLUTE_PATH]") {
      findings.push(
        finding(
          "ABSOLUTE_PATH",
          "FAIL",
          path,
          "Generated file inventory contains an absolute path.",
        ),
      );
    }
    if (path.includes("/dist/") || path.startsWith("dist/")) {
      findings.push(
        finding(
          "UNTRACKED_DIST",
          "FAIL",
          path,
          "Generated distribution output is not accepted as an implicit clean input.",
        ),
      );
    }
    if (!declared.has(path)) {
      findings.push(
        finding(
          "UNDECLARED_GENERATED_FILE",
          "FAIL",
          path,
          "Generated file is absent from the declared artifact inventory.",
        ),
      );
    }
  }
  const declaredEnv = new Set(
    input.declaredEnvironmentNames.map((name) => name.trim()).filter(Boolean),
  );
  for (
    const name of [...new Set(input.usedEnvironmentNames)].sort(
      compareCodePointStrings,
    )
  ) {
    if (!declaredEnv.has(name)) {
      findings.push(
        finding(
          "UNDECLARED_ENVIRONMENT",
          "FAIL",
          name,
          "Environment input is used without an allowlisted declaration.",
        ),
      );
    }
  }
  for (
    const item of [...input.sourceTexts].sort((a, b) =>
      compareCodePointStrings(a.path, b.path)
    )
  ) {
    const checks: readonly [string, RegExp, string][] = [
      [
        "ABSOLUTE_PATH",
        ABSOLUTE_PATH,
        "Absolute user or host path affects the build input.",
      ],
      [
        "TIMESTAMP_INPUT",
        TIMESTAMP,
        "Timestamp or filesystem time can affect generated output.",
      ],
      ["HOST_INPUT", HOST, "Host identity can affect generated output."],
      [
        "LOCALE_INPUT",
        LOCALE,
        "Locale or timezone can affect generated output.",
      ],
      ["RANDOM_INPUT", RANDOM, "Randomness can affect generated output."],
      [
        "CACHE_RELIANCE",
        CACHE,
        "Undeclared cache or local installation state can affect the build.",
      ],
      [
        "NETWORK_RELIANCE",
        NETWORK,
        "Network or remote registry access is present in the build input.",
      ],
    ];
    for (const [code, expression, detail] of checks) {
      if (expression.test(item.content)) {
        findings.push(finding(code, "FAIL", item.path, detail));
      }
    }
  }
  for (
    const command of [...input.commands].sort(compareCodePointStrings)
  ) {
    if (containsAbsolutePath(command)) {
      findings.push(
        finding(
          "ABSOLUTE_PATH",
          "FAIL",
          "command",
          "Build command contains an absolute path.",
        ),
      );
    }
    if (NETWORK.test(command)) {
      findings.push(
        finding(
          "NETWORK_RELIANCE",
          "FAIL",
          "command",
          "Build command can contact a registry or network.",
        ),
      );
    }
    if (CACHE.test(command)) {
      findings.push(
        finding(
          "CACHE_RELIANCE",
          "FAIL",
          "command",
          "Build command relies on an undeclared cache or local installation state.",
        ),
      );
    }
  }
  if (input.networkMode !== "disabled" && input.networkMode !== "offline") {
    findings.push(
      finding(
        "NETWORK_MODE_UNKNOWN",
        "BLOCKED",
        "network",
        "Offline/network-disabled mode was not established.",
      ),
    );
  }
  if (input.cacheMode === "unknown") {
    findings.push(
      finding(
        "CACHE_MODE_UNKNOWN",
        "BLOCKED",
        "cache",
        "Cache policy was not established.",
      ),
    );
  }
  return {
    documentId: "PIXIEED-FP007-CLEAN-ROOM-001",
    deterministic: true,
    findings: findings.sort((a, b) =>
      compareCodePointStrings(
        `${a.code}:${a.subject}`,
        `${b.code}:${b.subject}`,
      )
    ),
    status: statusOf(findings),
  };
}

export async function scanWorkspaceCleanRoom(
  root: string,
  input: Omit<CleanRoomInput, "workspaceStatus">,
): Promise<CleanRoomAudit> {
  let workspaceStatus: CleanRoomInput["workspaceStatus"] = "unknown";
  try {
    const command = new Deno.Command("git", {
      args: ["status", "--porcelain=v1", "--untracked-files=all"],
      cwd: root,
      stdout: "piped",
      stderr: "null",
    });
    const result = await command.output();
    workspaceStatus =
      new TextDecoder().decode(result.stdout).trim().length === 0
        ? "clean"
        : "dirty";
  } catch {
    workspaceStatus = "unknown";
  }
  return analyzeCleanRoom({ ...input, workspaceStatus });
}
