import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { run } from "../src/cli.js";
import type { InventoryReport } from "../src/scan.js";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");
const SAMPLES = join(REPO_ROOT, "fixtures", "config-samples");
const FIXTURE_OS = process.platform === "win32" ? "windows" : "macos";

const temps: string[] = [];
after(() => Promise.all(temps.map((dir) => rm(dir, { recursive: true, force: true }))));

async function tempHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agent-census-"));
  temps.push(dir);
  return dir;
}

/** VS Code's user config location, spelled out independently of src/. */
const VSCODE_MCP = {
  darwin: ["Library", "Application Support", "Code", "User", "mcp.json"],
  win32: ["AppData", "Roaming", "Code", "User", "mcp.json"],
}[process.platform as string] ?? [".config", "Code", "User", "mcp.json"];

const LAYOUT: Record<string, { from: string; to: string[] }[]> = {
  cursor: [{ from: "cursor/mcp.json", to: [".cursor", "mcp.json"] }],
  "claude-code": [{ from: "claude/claude-mcp-user.json", to: [".claude.json"] }],
  "gemini-cli": [
    { from: "gemini/settings.json", to: [".gemini", "settings.json"] },
    { from: "gemini/mcp_config.shared.json", to: [".gemini", "config", "mcp_config.json"] },
  ],
  vscode: [{ from: "vscode/mcp.json", to: VSCODE_MCP }],
  "copilot-cli": [{ from: "copilot-cli/mcp-config.json", to: [".copilot", "mcp-config.json"] }],
  codex: [{ from: "codex/config.toml", to: [".codex", "config.toml"] }],
};

async function place(home: string, to: string[], content: string | Buffer): Promise<string> {
  const path = join(home, ...to);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return path;
}

/** Assemble a home directory from fixtures/config-samples for the host OS. */
async function fixtureHome(clients = Object.keys(LAYOUT)): Promise<string> {
  const home = await tempHome();
  for (const client of clients) {
    for (const { from, to } of LAYOUT[client]) {
      const [dir, file] = from.split("/");
      await place(home, to, await readFile(join(SAMPLES, dir, FIXTURE_OS, file)));
    }
  }
  return home;
}

async function cli(args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = await run(args, { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) });
  return { code, stdout, stderr, json: () => JSON.parse(stdout) as InventoryReport };
}

const client = (report: InventoryReport, id: string) => {
  const found = report.clientTargets.find((c) => c.clientTarget === id);
  assert.ok(found, `missing ${id}`);
  return found;
};

async function treeDigest(root: string): Promise<string> {
  const hash = createHash("sha256");
  for (const entry of (await readdir(root, { recursive: true, withFileTypes: true })).sort((a, b) =>
    join(a.parentPath, a.name).localeCompare(join(b.parentPath, b.name)),
  )) {
    const full = join(entry.parentPath, entry.name);
    hash.update(full);
    if (entry.isFile()) hash.update(await readFile(full));
  }
  return hash.digest("hex");
}

test("all six clients present: JSON shape, counts and redaction", async () => {
  const home = await fixtureHome();
  await cp(join(REPO_ROOT, "fixtures", "skill-packs", "demo-pack"), join(home, ".cursor", "skills", "demo-pack"), { recursive: true });
  await cp(join(REPO_ROOT, "fixtures", "skill-packs", "demo-caller"), join(home, ".agents", "skills", "demo-caller"), { recursive: true });
  await mkdir(join(home, ".claude", "skills", "not-a-pack"), { recursive: true });
  const before = await treeDigest(home);

  const result = await cli(["--home", home, "--json"]);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  const report = result.json();

  assert.equal(report.schemaVersion, 1);
  assert.deepEqual(
    report.clientTargets.map((c) => [c.clientTarget, c.present, c.mcpServers.length]),
    [
      ["cursor", true, 2],
      ["claude-code", true, 2],
      ["gemini-cli", true, 3],
      ["vscode", true, 2],
      ["copilot-cli", true, 2],
      ["codex", true, 2],
    ],
  );
  assert.deepEqual(report.totals, { mcpServers: 13, clientTargets: 6, skillPacks: 2 });

  const cursor = client(report, "cursor");
  assert.equal(cursor.configPath, join(home, ".cursor", "mcp.json"));
  assert.deepEqual(cursor.skillPacks, [{ slug: "demo-pack", path: join(home, ".cursor", "skills", "demo-pack") }]);
  assert.deepEqual(client(report, "claude-code").skillPacks, []);
  assert.deepEqual(client(report, "vscode").configPath, join(home, ...VSCODE_MCP));

  const [stdio, http] = cursor.mcpServers;
  assert.deepEqual(Object.keys(stdio).sort(), ["args", "argsCount", "command", "configPath", "envKeys", "id", "transport"]);
  assert.equal(stdio.transport, "stdio");
  assert.equal(stdio.argsCount, 3);
  assert.equal(stdio.args?.[1], "@modelcontextprotocol/server-filesystem");
  assert.deepEqual(http, {
    id: "org-proxy-example",
    transport: "http",
    url: "https://mcp.example.com/org/acme/filesystem-spike",
    argsCount: 0,
    envKeys: [],
    headers: { Authorization: "[redacted]" },
    configPath: cursor.configPath,
  });
  assert.doesNotMatch(result.stdout, /Bearer/);

  assert.equal(await treeDigest(home), before, "scan must not modify anything under --home");
});

test("human output groups by client and ends with the totals line", async () => {
  const home = await fixtureHome();
  const { code, stdout } = await cli(["--home", home]);
  assert.equal(code, 0);
  for (const label of ["Cursor", "Claude Code", "Gemini CLI", "VS Code", "Copilot CLI", "Codex"]) {
    assert.match(stdout, new RegExp(`^${label}$`, "m"));
  }
  assert.match(stdout, /^ {2}config: ~[/\\]\.cursor[/\\]mcp\.json$/m);
  assert.match(stdout, /filesystem-spike {2}stdio {2}npx/);
  assert.match(stdout, /Authorization: \[redacted\]/);
  assert.doesNotMatch(stdout, /Bearer/);
  assert.ok(stdout.endsWith("13 MCP servers across 6 tools, 0 skill packs.\n"));
});

test("no clients present: exit 0 with a friendly message", async () => {
  const home = await tempHome();
  const human = await cli(["--home", home]);
  assert.equal(human.code, 0);
  assert.equal(human.stdout, "No AI coding tools detected.\n");

  const json = await cli(["--home", home, "--json"]);
  assert.equal(json.code, 0);
  const report = json.json();
  assert.equal(report.clientTargets.length, 6);
  assert.ok(report.clientTargets.every((c) => !c.present && !c.configFound));
  assert.deepEqual(report.totals, { mcpServers: 0, clientTargets: 0, skillPacks: 0 });
});

test("malformed JSON config is skipped with a warning; other clients still reported", async () => {
  const home = await fixtureHome(["claude-code"]);
  const leaked = `sk-${"a1B2c3D4".repeat(5)}`;
  await place(home, [".cursor", "mcp.json"], `{ "mcpServers": { "x": { "env": { "K": "${leaked}" } `);

  const { code, stdout, stderr } = await cli(["--home", home, "--json"]);
  assert.equal(code, 0);
  assert.match(stderr, /^warning: .*mcp\.json: not valid JSON; skipped$/m);
  assert.ok(!stderr.includes(leaked) && !stdout.includes(leaked), "parser output must not leak file content");
  const report = JSON.parse(stdout) as InventoryReport;
  const cursor = client(report, "cursor");
  assert.equal(cursor.present, true);
  assert.deepEqual(cursor.mcpServers, []);
  assert.equal(cursor.warnings.length, 1);
  assert.equal(client(report, "claude-code").mcpServers.length, 2);
});

test("valid JSON with an unexpected server shape warns instead of crashing", async () => {
  const home = await fixtureHome(["codex"]);
  await place(home, [".cursor", "mcp.json"], JSON.stringify({ mcpServers: { broken: null } }));
  const { code, stdout, stderr } = await cli(["--home", home, "--json"]);
  assert.equal(code, 0);
  assert.match(stderr, /mcp\.json: unexpected MCP server layout; skipped/);
  const report = JSON.parse(stdout) as InventoryReport;
  assert.equal(client(report, "cursor").present, true);
  assert.equal(client(report, "codex").mcpServers.length, 2);

  // One odd server must not hide its siblings.
  await place(
    home,
    [".cursor", "mcp.json"],
    JSON.stringify({ mcpServers: { odd: { url: "https://example.com/%E0%A4%A/mcp" }, fine: { command: "npx" } } }),
  );
  const mixed = client((await cli(["--home", home, "--json"])).json(), "cursor");
  assert.deepEqual(mixed.mcpServers.map((s) => s.id), ["odd", "fine"]);
});

test("JSON with comments and trailing commas (VS Code style) is accepted", async () => {
  const home = await tempHome();
  await place(
    home,
    VSCODE_MCP,
    `// user MCP servers\n{\n  "servers": {\n    /* docs: https://code.visualstudio.com */\n    "fs": { "command": "npx", "args": ["-y", "a//b"], },\n  },\n}\n`,
  );
  const report = (await cli(["--home", home, "--json", "--target", "vscode"])).json();
  const [server] = client(report, "vscode").mcpServers;
  assert.deepEqual(server.args, ["-y", "a//b"]);
});

test("Codex TOML: stdio and http servers parsed; malformed TOML warns", async () => {
  const home = await fixtureHome(["codex"]);
  const report = (await cli(["--home", home, "--json", "--target", "codex"])).json();
  const codex = client(report, "codex");
  assert.equal(codex.configPath, join(home, ".codex", "config.toml"));
  assert.deepEqual(
    codex.mcpServers.map((s) => [s.id, s.transport, s.command ?? s.url, s.argsCount]),
    [
      ["filesystem-spike", "stdio", "npx", 3],
      ["org-proxy-example", "http", "https://mcp.example.com/org/acme/filesystem-spike", 0],
    ],
  );
  assert.deepEqual(codex.mcpServers[1].headers, { Authorization: "[redacted]" });

  await place(home, [".codex", "config.toml"], "[mcp_servers.broken\ncommand = ");
  const broken = await cli(["--home", home, "--json", "--target", "codex"]);
  assert.equal(broken.code, 0);
  assert.match(broken.stderr, /config\.toml: not valid TOML; skipped/);
});

test("Gemini shared config path is scanned; settings.json wins on id clash", async () => {
  const home = await tempHome();
  const sharedPath = await place(
    home,
    [".gemini", "config", "mcp_config.json"],
    JSON.stringify({ mcpServers: { "next-devtools": { command: "npx" }, dup: { command: "from-shared" } } }),
  );
  const onlyShared = client((await cli(["--home", home, "--json"])).json(), "gemini-cli");
  assert.equal(onlyShared.present, true);
  assert.equal(onlyShared.mcpServers.length, 2);
  assert.equal(onlyShared.mcpServers[0].configPath, sharedPath);

  const settingsPath = await place(
    home,
    [".gemini", "settings.json"],
    JSON.stringify({ mcpServers: { dup: { command: "from-settings" } } }),
  );
  const merged = client((await cli(["--home", home, "--json"])).json(), "gemini-cli");
  const dup = merged.mcpServers.find((s) => s.id === "dup");
  assert.equal(dup?.command, "from-settings");
  assert.equal(dup?.configPath, settingsPath);
});

test("env values never reach stdout; key names do", async () => {
  const home = await tempHome();
  const secret = "plain-looking-value-nobody-would-flag";
  await place(
    home,
    [".cursor", "mcp.json"],
    JSON.stringify({ mcpServers: { gh: { command: "docker", args: ["run", "-e", "GITHUB_TOKEN", "img"], env: { GITHUB_TOKEN: secret } } } }),
  );
  for (const mode of [[], ["--json"]]) {
    const { stdout } = await cli(["--home", home, ...mode]);
    assert.ok(!stdout.includes(secret));
    assert.match(stdout, /GITHUB_TOKEN/);
  }
  const [server] = client((await cli(["--home", home, "--json"])).json(), "cursor").mcpServers;
  assert.deepEqual(server.envKeys, ["GITHUB_TOKEN"]);
});

test("flags: --target, --help, --version and bad input", async () => {
  const home = await fixtureHome();
  const only = (await cli(["--home", home, "--json", "--target", "codex"])).json();
  assert.deepEqual(only.clientTargets.map((c) => c.clientTarget), ["codex"]);

  assert.match((await cli(["--help"])).stdout, /--home <path>/);
  assert.match((await cli(["--version"])).stdout, /^\d+\.\d+\.\d+/);

  const unknownTarget = await cli(["--target", "emacs"]);
  assert.equal(unknownTarget.code, 2);
  assert.match(unknownTarget.stderr, /unknown --target "emacs"/);
  assert.equal((await cli(["--frobnicate"])).code, 2);
  assert.equal((await cli(["extra-positional"])).code, 2);
});

test("bundle: single file, no workspace or network imports, runs under node", async () => {
  const outDir = await tempHome();
  const bundle = join(outDir, "cli.js");
  const exec = promisify(execFile);
  await exec(process.execPath, [join(PACKAGE_ROOT, "build.mjs"), bundle]);

  const source = await readFile(bundle, "utf8");
  assert.ok(source.startsWith("#!/usr/bin/env node\n"));
  const imports = [...source.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)].map((m) => m[1]);
  const allowed = new Set(["node:fs", "node:fs/promises", "node:os", "node:path", "node:url", "node:util"]);
  assert.deepEqual([...new Set(imports)].filter((m) => !allowed.has(m)), []);
  assert.doesNotMatch(source, /@semantik-tech\//);
  assert.doesNotMatch(source, /\brequire\(|\bfetch\(|XMLHttpRequest|WebSocket/);
  assert.match(await readFile(join(outDir, "THIRD-PARTY-NOTICES.txt"), "utf8"), /toml-eslint-parser/);

  const { version } = JSON.parse(await readFile(join(PACKAGE_ROOT, "package.json"), "utf8"));
  assert.equal((await exec(process.execPath, [bundle, "--version"])).stdout.trim(), version);

  const home = await fixtureHome();
  const { stdout } = await exec(process.execPath, [bundle, "--home", home, "--json"]);
  assert.equal((JSON.parse(stdout) as InventoryReport).totals.mcpServers, 13);

  const empty = await exec(process.execPath, [bundle, "--home", await tempHome()]);
  assert.equal(empty.stdout, "No AI coding tools detected.\n");
});
