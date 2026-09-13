import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  abbreviateHome,
  CLIENT_TARGET_IDS,
  scanInventory,
  type ClientTarget,
  type InventoryMcpServer,
  type InventoryReport,
} from "./scan.js";

declare const __CLI_VERSION__: string | undefined;
export const VERSION = typeof __CLI_VERSION__ === "string" ? __CLI_VERSION__ : "0.0.0-dev";

const CLI_NAME = "agent-census";

const CLIENT_LABELS: Record<ClientTarget, string> = {
  cursor: "Cursor",
  "claude-code": "Claude Code",
  "gemini-cli": "Gemini CLI",
  vscode: "VS Code",
  "copilot-cli": "Copilot CLI",
  codex: "Codex",
};

const HELP = `Usage: ${CLI_NAME} [options]

See what the AI coding agents on this machine are configured with: every MCP
server and skill pack across Cursor, Claude Code, Gemini CLI, VS Code,
Copilot CLI and Codex. Read-only, no network, no account.

Options:
  --json           Print a machine-readable report (schemaVersion 1)
  --home <path>    Scan this directory instead of your home directory
  --target <id>    Only scan one client: ${CLIENT_TARGET_IDS.join(", ")}
  --version        Print the version
  --help           Print this help
`;

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function describeServer(server: InventoryMcpServer): string {
  if (server.transport === "stdio") {
    return [server.command ?? "(no command)", ...(server.args ?? [])].join(" ");
  }
  return server.url ?? "(no url)";
}

export function formatHuman(report: InventoryReport, home: string): string {
  const tilde = (path: string) => abbreviateHome(path, home);
  const present = report.clientTargets.filter((c) => c.present);
  if (present.length === 0) return "No AI coding tools detected.\n";

  const lines: string[] = [];
  for (const client of present) {
    lines.push(CLIENT_LABELS[client.clientTarget]);
    lines.push(`  config: ${tilde(client.configPath)}${client.configFound ? "" : " (not found)"}`);
    lines.push(`  MCP servers (${client.mcpServers.length})`);
    for (const server of client.mcpServers) {
      lines.push(`    ${server.id}  ${server.transport}  ${describeServer(server)}`);
      if (server.envKeys.length) lines.push(`      env: ${server.envKeys.join(", ")}`);
      if (server.headers && Object.keys(server.headers).length) {
        lines.push(`      headers: ${Object.entries(server.headers).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
      }
      if (server.configPath !== client.configPath) lines.push(`      from: ${tilde(server.configPath)}`);
    }
    if (client.skillPacks.length) {
      lines.push(`  Skill packs (${client.skillPacks.length})`);
      for (const pack of client.skillPacks) lines.push(`    ${pack.slug}  ${tilde(pack.path)}`);
    }
    lines.push("");
  }

  const missing = report.clientTargets.filter((c) => !c.present).map((c) => CLIENT_LABELS[c.clientTarget]);
  if (missing.length) lines.push(`Not detected: ${missing.join(", ")}`, "");

  const { totals } = report;
  lines.push(
    `${plural(totals.mcpServers, "MCP server")} across ${plural(totals.clientTargets, "tool")}, ${plural(totals.skillPacks, "skill pack")}.`,
  );
  return `${lines.join("\n")}\n`;
}

/** Runs the CLI and returns the process exit code. Never throws for bad input. */
export async function run(argv: string[], io: Io): Promise<number> {
  let values: { json?: boolean; home?: string; target?: string; version?: boolean; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        json: { type: "boolean" },
        home: { type: "string" },
        target: { type: "string" },
        version: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    io.stderr(`${CLI_NAME}: ${(error as Error).message}\n\n${HELP}`);
    return 2;
  }

  if (values.help) {
    io.stdout(HELP);
    return 0;
  }
  if (values.version) {
    io.stdout(`${VERSION}\n`);
    return 0;
  }
  if (values.target !== undefined && !(CLIENT_TARGET_IDS as readonly string[]).includes(values.target)) {
    io.stderr(`${CLI_NAME}: unknown --target "${values.target}". Expected one of: ${CLIENT_TARGET_IDS.join(", ")}\n`);
    return 2;
  }

  const home = resolve(values.home ?? homedir());
  const report = await scanInventory({
    home,
    targets: values.target ? [values.target as ClientTarget] : undefined,
  });
  for (const client of report.clientTargets) {
    for (const warning of client.warnings) io.stderr(`warning: ${warning}\n`);
  }
  io.stdout(values.json ? `${JSON.stringify(report, null, 2)}\n` : formatHuman(report, home));
  return 0;
}

// argv[1] is the npm bin symlink when installed globally or via npx.
const invokedDirectly = (() => {
  try {
    return !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  run(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  }).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${CLI_NAME}: unexpected error: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
