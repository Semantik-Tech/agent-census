import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { getStaticTOMLValue, parseTOML } from "toml-eslint-parser";
import { claudeCodeAdapter } from "@semantik-tech/adapters-claude-code";
import { codexAdapter } from "@semantik-tech/adapters-codex";
import { copilotCliAdapter } from "@semantik-tech/adapters-copilot-cli";
import { cursorAdapter } from "@semantik-tech/adapters-cursor";
import { geminiCliAdapter } from "@semantik-tech/adapters-gemini-cli";
import { vscodeAdapter } from "@semantik-tech/adapters-vscode";
import {
  geminiSharedMcpConfigPath,
  nativePaths,
  resolveHome,
  type ClientTargetAdapter,
  type McpServerFragment,
  type TargetOs,
} from "@semantik-tech/adapters-shared";
import { CLIENT_TARGET_IDS, type ClientTarget } from "@semantik-tech/manifest-schema/client-targets";
import { redactArgs, redactArg, redactHeaders, redactUrl } from "./redact.js";

/**
 * Unmanaged, context-free scan: no org, no device, no manifest. Read-only —
 * this module only ever calls readFile / readdir / stat.
 */

export { CLIENT_TARGET_IDS, type ClientTarget };

export const JSON_SCHEMA_VERSION = 1;

export interface InventoryMcpServer {
  id: string;
  transport: "stdio" | "http" | "sse";
  /** stdio only. */
  command?: string;
  /** stdio only, redacted. */
  args?: string[];
  argsCount: number;
  /** http/sse only, redacted. */
  url?: string;
  /** Key names only — values are never read into the report. */
  envKeys: string[];
  /** http/sse only; values redacted when credential-shaped. */
  headers?: Record<string, string>;
  /** File this server was read from (Gemini merges two). */
  configPath: string;
}

export interface InventorySkillPack {
  slug: string;
  path: string;
}

export interface ClientTargetReport {
  clientTarget: ClientTarget;
  /** Config file exists, or at least one skill pack is installed. */
  present: boolean;
  configPath: string;
  configFound: boolean;
  mcpServers: InventoryMcpServer[];
  skillPacks: InventorySkillPack[];
  warnings: string[];
}

export interface InventoryReport {
  schemaVersion: typeof JSON_SCHEMA_VERSION;
  platform: "macos" | "windows" | "linux";
  clientTargets: ClientTargetReport[];
  totals: { mcpServers: number; clientTargets: number; skillPacks: number };
}

export interface ScanOptions {
  /** Defaults to the current user's home directory. */
  home?: string;
  targets?: readonly ClientTarget[];
}

const ADAPTERS: Record<ClientTarget, ClientTargetAdapter> = {
  cursor: cursorAdapter,
  "claude-code": claudeCodeAdapter,
  "gemini-cli": geminiCliAdapter,
  vscode: vscodeAdapter,
  "copilot-cli": copilotCliAdapter,
  codex: codexAdapter,
};

function hostPlatform(): InventoryReport["platform"] {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "macos";
  return "linux";
}

/**
 * Where each client keeps its config under `home`. Paths come from
 * adapters-shared (which resolves against the real home) and are rebased.
 */
export function clientPaths(clientTarget: ClientTarget, home: string) {
  const platform = hostPlatform();
  const os: TargetOs = platform === "windows" ? "windows" : "macos";
  const realHome = resolveHome(os);
  const rebase = (path: string): string => {
    const rel = relative(realHome, path);
    if (!rel.startsWith("..") && !rel.includes(":")) return join(home, rel);
    // %APPDATA% outside %USERPROFILE% (roaming profiles): real paths for the
    // real home, the default layout under an overridden --home.
    const appData = process.env.APPDATA;
    if (appData && relative(realHome, home) !== "") {
      const relAppData = relative(appData, path);
      if (!relAppData.startsWith("..")) return join(home, "AppData", "Roaming", relAppData);
    }
    return path;
  };

  const native = nativePaths(clientTarget, os);
  let mcpConfigFile = rebase(native.mcpConfigFile);
  // adapters-shared models macOS and Windows only; VS Code is the one client
  // whose Linux location differs from macOS.
  if (clientTarget === "vscode" && platform === "linux") {
    mcpConfigFile = join(home, ".config", "Code", "User", "mcp.json");
  }
  return {
    mcpConfigFile,
    skillsRoot: rebase(native.skillsRoot),
    sharedMcpConfigFile:
      clientTarget === "gemini-cli" ? rebase(geminiSharedMcpConfigPath(os)) : undefined,
  };
}

type ReadResult =
  | { found: false }
  | { found: true; value: Record<string, unknown> }
  | { found: true; warning: string };

function stripJsonComments(text: string): string {
  // String-aware removal of // and /* */ comments and trailing commas (JSONC,
  // which VS Code and Gemini accept).
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      const start = i;
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
      out += text.slice(start, i + 1);
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (ch === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      if (i === -1) break;
      i++;
    } else {
      out += ch;
    }
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

async function readConfig(path: string, format: "json" | "toml"): Promise<ReadResult> {
  let raw: string;
  try {
    raw = (await readFile(path, "utf8")).replace(/^\uFEFF/, "");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return { found: false };
    return { found: true, warning: `${path}: could not be read (${code ?? "unknown error"}); skipped` };
  }
  // Parser messages can quote file content (and so secrets) — never surface them.
  try {
    const value =
      format === "toml"
        ? getStaticTOMLValue(parseTOML(raw))
        : (() => {
            try {
              return JSON.parse(raw);
            } catch {
              return JSON.parse(stripJsonComments(raw));
            }
          })();
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return { found: true, value: value as Record<string, unknown> };
    }
  } catch {
    /* fall through */
  }
  return { found: true, warning: `${path}: not valid ${format.toUpperCase()}; skipped` };
}

async function listSkillPacks(skillsRoot: string): Promise<InventorySkillPack[]> {
  let names: string[];
  try {
    names = await readdir(skillsRoot);
  } catch {
    return [];
  }
  const packs: InventorySkillPack[] = [];
  for (const slug of names.sort()) {
    const path = join(skillsRoot, slug);
    try {
      if ((await stat(join(path, "SKILL.md"))).isFile()) packs.push({ slug, path });
    } catch {
      /* not a skill pack */
    }
  }
  return packs;
}

function toInventoryServer(fragment: McpServerFragment, configPath: string): InventoryMcpServer {
  const args = Array.isArray(fragment.args) ? fragment.args.map(String) : [];
  const envKeys = fragment.env && typeof fragment.env === "object" ? Object.keys(fragment.env) : [];
  if (fragment.transport === "stdio") {
    return {
      id: fragment.id,
      transport: "stdio",
      command: fragment.command === undefined ? undefined : redactArg(String(fragment.command)),
      args: redactArgs(args),
      argsCount: args.length,
      envKeys,
      configPath,
    };
  }
  const headers =
    fragment.headers && typeof fragment.headers === "object" ? redactHeaders(fragment.headers) : undefined;
  return {
    id: fragment.id,
    transport: fragment.transport === "sse" ? "sse" : "http",
    url: fragment.url === undefined ? undefined : redactUrl(String(fragment.url)),
    argsCount: args.length,
    envKeys,
    headers,
    configPath,
  };
}

function parseServers(
  clientTarget: ClientTarget,
  config: Record<string, unknown>,
  configPath: string,
  warnings: string[],
): InventoryMcpServer[] {
  try {
    const fragments = ADAPTERS[clientTarget].parseMcpServers({
      ...nativePaths(clientTarget, "macos"),
      mcpConfig: config,
    });
    const servers: InventoryMcpServer[] = [];
    for (const fragment of fragments) {
      try {
        servers.push(toInventoryServer(fragment, configPath));
      } catch {
        warnings.push(`${configPath}: MCP server "${fragment.id}" could not be read; skipped`);
      }
    }
    return servers;
  } catch {
    // Valid JSON, unexpected shape (e.g. a server entry that is null).
    warnings.push(`${configPath}: unexpected MCP server layout; skipped`);
    return [];
  }
}

async function scanClientTarget(clientTarget: ClientTarget, home: string): Promise<ClientTargetReport> {
  const paths = clientPaths(clientTarget, home);
  const warnings: string[] = [];
  const primary = await readConfig(paths.mcpConfigFile, clientTarget === "codex" ? "toml" : "json");
  const byId = new Map<string, InventoryMcpServer>();
  let configFound = primary.found;

  // Gemini: shared Antigravity config first, settings.json wins on id clash
  // (same precedence as the managed scanner).
  if (paths.sharedMcpConfigFile) {
    const shared = await readConfig(paths.sharedMcpConfigFile, "json");
    configFound ||= shared.found;
    if (shared.found && "warning" in shared) warnings.push(shared.warning);
    if (shared.found && "value" in shared) {
      for (const s of parseServers(clientTarget, shared.value, paths.sharedMcpConfigFile, warnings)) byId.set(s.id, s);
    }
  }
  if (primary.found && "warning" in primary) warnings.push(primary.warning);
  if (primary.found && "value" in primary) {
    for (const s of parseServers(clientTarget, primary.value, paths.mcpConfigFile, warnings)) byId.set(s.id, s);
  }

  const skillPacks = await listSkillPacks(paths.skillsRoot);
  return {
    clientTarget,
    present: configFound || skillPacks.length > 0,
    configPath: paths.mcpConfigFile,
    configFound,
    mcpServers: [...byId.values()],
    skillPacks,
    warnings,
  };
}

export async function scanInventory(options: ScanOptions = {}): Promise<InventoryReport> {
  const home = resolve(options.home ?? homedir());
  const targets = options.targets ?? CLIENT_TARGET_IDS;
  const clientTargets: ClientTargetReport[] = [];
  for (const target of targets) clientTargets.push(await scanClientTarget(target, home));

  const present = clientTargets.filter((c) => c.present);
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    platform: hostPlatform(),
    clientTargets,
    totals: {
      mcpServers: present.reduce((n, c) => n + c.mcpServers.length, 0),
      clientTargets: present.length,
      // VS Code and Copilot CLI share ~/.copilot/skills — count each directory once.
      skillPacks: new Set(present.flatMap((c) => c.skillPacks.map((p) => p.path))).size,
    },
  };
}

export function abbreviateHome(path: string, home: string): string {
  const root = resolve(home);
  return path === root || path.startsWith(root + sep) ? `~${path.slice(root.length)}` : path;
}
