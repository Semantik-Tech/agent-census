import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { getStaticTOMLValue, parseTOML } from "toml-eslint-parser";
import { nativePaths } from "@semantik-tech/adapters-shared";
import {
  coreMcpFields,
  loadFixtureText,
  loadSkillPackDir,
  DEMO_PACK_ROOT,
} from "@semantik-tech/adapters-shared/test/helpers.js";
import {
  codexAdapter,
  parseCodexConfig,
  parseCodexMcpServers,
  patchCodexConfigToml,
} from "../src/index.js";

const OSS = ["macos", "windows"] as const;

for (const os of OSS) {
  test(`codex ${os}: fixture round-trip`, async () => {
    const nativeToml = await loadFixtureText("codex", os);
    const parsed = getStaticTOMLValue(parseTOML(nativeToml)) as Record<string, unknown>;
    const paths = { ...nativePaths("codex", os), mcpConfig: parsed };
    const fragments = codexAdapter.parseMcpServers(paths);
    assert.equal(fragments.length, 2);
    const patched = patchCodexConfigToml(nativeToml, fragments);
    const reparsed = parseCodexConfig(
      getStaticTOMLValue(parseTOML(patched)) as Record<string, unknown>,
    );
    assert.deepEqual(
      fragments.map((f) => ({ id: f.id, transport: f.transport, url: f.url, command: f.command, args: f.args })),
      reparsed.map((f) => ({ id: f.id, transport: f.transport, url: f.url, command: f.command, args: f.args })),
    );
  });

  test(`codex ${os}: stdio core fields survive round-trip`, async () => {
    const nativeToml = await loadFixtureText("codex", os);
    const parsed = getStaticTOMLValue(parseTOML(nativeToml)) as Record<string, unknown>;
    const fragments = parseCodexConfig(parsed);
    const patched = patchCodexConfigToml(nativeToml, fragments);
    const reparsed = parseCodexMcpServers(
      (getStaticTOMLValue(parseTOML(patched)) as { mcp_servers: Record<string, unknown> })
        .mcp_servers,
    );
    assert.deepEqual(coreMcpFields(fragments), coreMcpFields(reparsed));
  });

  test(`codex ${os}: patch preserves unrelated keys and comments`, async () => {
    const nativeToml = await loadFixtureText("codex", os);
    const parsed = getStaticTOMLValue(parseTOML(nativeToml)) as Record<string, unknown>;
    const fragments = parseCodexConfig(parsed);
    const patched = patchCodexConfigToml(nativeToml, fragments);
    assert.match(patched, /^# Codex user config/);
    assert.match(patched, /^model = "gpt-4"/m);
    const value = getStaticTOMLValue(parseTOML(patched)) as Record<string, unknown>;
    assert.equal(value.model, "gpt-4");
    assert.equal(Object.keys(value.mcp_servers as object).length, 2);
  });

  test(`codex ${os}: managed servers always use gateway`, async () => {
    const nativeToml = await loadFixtureText("codex", os);
    const parsed = getStaticTOMLValue(parseTOML(nativeToml)) as Record<string, unknown>;
    const plan = codexAdapter.renderMcpServers(parseCodexConfig(parsed), {
      proxyMode: "cloud_gateway",
      orgSlug: "acme-dev",
      gatewayBaseUrl: "https://mcp.acme-dev.example.com",
      targetOs: os,
      existingConfig: nativeToml,
      clientTarget: "codex",
    });
    assert.ok(plan.files[0]!.path.endsWith(join(".codex", "config.toml")));
    const value = getStaticTOMLValue(parseTOML(plan.files[0]!.content)) as {
      model: string;
      mcp_servers: Record<string, { url?: string }>;
    };
    assert.equal(value.model, "gpt-4");
    assert.equal(
      value.mcp_servers["org-proxy-example"].url,
      "https://mcp.acme-dev.example.com/org-proxy-example",
    );
  });

  test(`codex ${os}: local proxy URL shape`, async () => {
    const nativeToml = await loadFixtureText("codex", os);
    const parsed = getStaticTOMLValue(parseTOML(nativeToml)) as Record<string, unknown>;
    const plan = codexAdapter.renderMcpServers(parseCodexConfig(parsed), {
      proxyMode: "local_proxy",
      orgSlug: "acme-dev",
      localProxyPort: 4242,
      targetOs: os,
      existingConfig: nativeToml,
    });
    const value = getStaticTOMLValue(parseTOML(plan.files[0]!.content)) as {
      mcp_servers: Record<string, { url?: string }>;
    };
    assert.equal(
      value.mcp_servers["org-proxy-example"].url,
      "http://127.0.0.1:4242/org-proxy-example",
    );
  });
}

test("codex: fails closed on malformed TOML", () => {
  assert.throws(() => patchCodexConfigToml("model = [\n", []), /Malformed Codex config\.toml/);
});

test("codex: materializes demo pack", async () => {
  const files = await loadSkillPackDir(DEMO_PACK_ROOT);
  const plan = codexAdapter.materializeSkillPack(
    { slug: "demo-pack", skillPackId: "demo-pack", version: 1, files },
    { proxyMode: "cloud_gateway", orgSlug: "acme", targetOs: "macos" },
  );
  assert.ok(plan.files.some((file) => file.path.includes(join(".agents", "skills", "demo-pack"))));
});
