import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClientTarget, TargetOs } from "../src/index.js";

export const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

export function fixturePath(clientTarget: ClientTarget, os: TargetOs): string {
  const fixtureTarget =
    clientTarget === "claude-code"
      ? "claude"
      : clientTarget === "gemini-cli"
        ? "gemini"
        : clientTarget;
  const base = join(REPO_ROOT, "fixtures", "config-samples", fixtureTarget, os);
  switch (clientTarget) {
    case "cursor":
      return join(base, "mcp.json");
    case "claude-code":
      return join(base, "claude-mcp-user.json");
    case "gemini-cli":
      return join(base, "settings.json");
    case "vscode":
      return join(base, "mcp.json");
    case "copilot-cli":
      return join(base, "mcp-config.json");
    case "codex":
      return join(base, "config.toml");
    default:
      throw new Error(`No fixture for Client Target: ${clientTarget}`);
  }
}

export async function loadFixtureText(clientTarget: ClientTarget, os: TargetOs): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(fixturePath(clientTarget, os), "utf8");
}

export async function loadFixtureJson(clientTarget: ClientTarget, os: TargetOs): Promise<unknown> {
  const raw = await readFile(fixturePath(clientTarget, os), "utf8");
  return JSON.parse(raw);
}

export const DEMO_PACK_ROOT = join(REPO_ROOT, "fixtures", "skill-packs", "demo-pack");

/** Walk a SkillPack directory into relative-path → content map. */
export async function loadSkillPackDir(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  async function walk(dir: string): Promise<void> {
    for (const name of await readdir(dir)) {
      const full = join(dir, name);
      const info = await stat(full);
      if (info.isDirectory()) {
        await walk(full);
      } else {
        const rel = relative(root, full);
        files[rel] = await readFile(full, "utf8");
      }
    }
  }

  await walk(root);
  return files;
}

/** Fields preserved across parse → render → parse (stdio + http identity). */
export function coreMcpFields(fragments: { id: string; transport: string; command?: string; args?: string[]; env?: Record<string, string> }[]) {
  return fragments.map((f) => ({
    id: f.id,
    transport: f.transport,
    command: f.command,
    args: f.args,
    env: f.env,
  }));
}
