import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { nativePaths, stableStringify } from "@semantik-tech/adapters-shared";
import {
  coreMcpFields,
  loadFixtureJson,
  loadSkillPackDir,
  DEMO_PACK_ROOT,
} from "@semantik-tech/adapters-shared/test/helpers.js";
import { geminiCliAdapter, parseGeminiSettings, renderGeminiSettings } from "../src/index.js";

const OSS = ["macos", "windows"] as const;

for (const os of OSS) {
  test(`gemini-cli ${os}: fixture round-trip`, async () => {
    const native = (await loadFixtureJson("gemini-cli", os)) as Record<string, unknown>;
    const paths = { ...nativePaths("gemini-cli", os), mcpConfig: native };
    const fragments = geminiCliAdapter.parseMcpServers(paths);
    assert.equal(fragments.length, 2);
    assert.equal(
      stableStringify(fragments),
      stableStringify(parseGeminiSettings(renderGeminiSettings(native, fragments))),
    );
  });

  test(`gemini-cli ${os}: stdio core fields survive round-trip`, async () => {
    const native = (await loadFixtureJson("gemini-cli", os)) as Record<string, unknown>;
    const fragments = parseGeminiSettings(native);
    assert.deepEqual(
      coreMcpFields(fragments),
      coreMcpFields(parseGeminiSettings(renderGeminiSettings(native, fragments))),
    );
  });

  test(`gemini-cli ${os}: native round-trip matches fixture`, async () => {
    const native = (await loadFixtureJson("gemini-cli", os)) as Record<string, unknown>;
    assert.equal(
      stableStringify(renderGeminiSettings(native, parseGeminiSettings(native))),
      stableStringify(native),
    );
  });

  test(`gemini-cli ${os}: preserves non-MCP settings`, async () => {
    const native = (await loadFixtureJson("gemini-cli", os)) as Record<string, unknown>;
    assert.equal(renderGeminiSettings(native, parseGeminiSettings(native)).theme, "GitHub");
  });

  test(`gemini-cli ${os}: managed servers always use gateway`, async () => {
    const native = (await loadFixtureJson("gemini-cli", os)) as Record<string, unknown>;
    const plan = geminiCliAdapter.renderMcpServers(parseGeminiSettings(native), {
      proxyMode: "cloud_gateway",
      orgSlug: "acme-dev",
      gatewayBaseUrl: "https://mcp.acme-dev.example.com",
      targetOs: os,
      existingConfig: native,
    });
    assert.ok(plan.files[0].path.includes(join(".gemini", "settings.json")));
    const out = JSON.parse(plan.files[0].content) as {
      theme?: string;
      mcpServers: Record<string, { httpUrl?: string }>;
    };
    assert.equal(out.theme, "GitHub");
    assert.equal(
      out.mcpServers["org-proxy-example"].httpUrl,
      "https://mcp.acme-dev.example.com/org-proxy-example",
    );
  });

  test(`gemini-cli ${os}: local proxy URL shape`, async () => {
    const native = (await loadFixtureJson("gemini-cli", os)) as Record<string, unknown>;
    const plan = geminiCliAdapter.renderMcpServers(parseGeminiSettings(native), {
      proxyMode: "local_proxy",
      orgSlug: "acme-dev",
      localProxyPort: 7777,
      targetOs: os,
      existingConfig: native,
    });
    const out = JSON.parse(plan.files[0].content) as {
      mcpServers: Record<string, { httpUrl?: string }>;
    };
    assert.equal(
      out.mcpServers["org-proxy-example"].httpUrl,
      "http://127.0.0.1:7777/org-proxy-example",
    );
  });
}

test("gemini-cli: materializes demo pack", async () => {
  const files = await loadSkillPackDir(DEMO_PACK_ROOT);
  const plan = geminiCliAdapter.materializeSkillPack(
    { slug: "demo-pack", skillPackId: "demo-pack", version: 1, files },
    { proxyMode: "cloud_gateway", orgSlug: "acme", targetOs: "macos" },
  );
  assert.ok(plan.files.some((file) => file.path.includes(join(".gemini", "skills", "demo-pack"))));
});
