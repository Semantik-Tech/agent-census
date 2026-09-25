import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { nativePaths, stableStringify } from "@semantik-tech/adapters-shared";
import {
  coreMcpFields,
  loadFixtureJson,
  loadSkillPackDir,
  markDirect,
  DEMO_PACK_ROOT,
  DIRECT_URL,
  PROXY_CASES,
} from "@semantik-tech/adapters-shared/test/helpers.js";
import {
  claudeCodeAdapter,
  parseClaudeJsonRoot,
  parseClaudeMcpServers,
  renderClaudeJsonManaged,
  renderClaudeMcpServers,
} from "../src/index.js";

const OSS = ["macos", "windows"] as const;

for (const os of OSS) {
  test(`claude-code ${os}: fixture round-trip`, async () => {
    const native = (await loadFixtureJson("claude-code", os)) as Record<string, unknown>;
    const paths = { ...nativePaths("claude-code", os), mcpConfig: native };
    const fragments = claudeCodeAdapter.parseMcpServers(paths);
    assert.equal(fragments.length, 2);
    const rendered = { mcpServers: renderClaudeMcpServers(fragments) };
    assert.equal(
      stableStringify(fragments),
      stableStringify(parseClaudeMcpServers(rendered.mcpServers)),
    );
  });

  test(`claude-code ${os}: stdio core fields survive round-trip`, async () => {
    const native = (await loadFixtureJson("claude-code", os)) as Record<string, unknown>;
    const fragments = parseClaudeJsonRoot(native);
    const reparsed = parseClaudeMcpServers(renderClaudeMcpServers(fragments));
    assert.deepEqual(coreMcpFields(fragments), coreMcpFields(reparsed));
  });

  test(`claude-code ${os}: native round-trip matches fixture`, async () => {
    const native = (await loadFixtureJson("claude-code", os)) as Record<string, unknown>;
    assert.equal(
      stableStringify({ mcpServers: renderClaudeMcpServers(parseClaudeJsonRoot(native)) }),
      stableStringify(native),
    );
  });

  test(`claude-code ${os}: merge preserves unrelated keys`, async () => {
    const native = (await loadFixtureJson("claude-code", os)) as Record<string, unknown>;
    const merged = renderClaudeJsonManaged(
      { theme: "dark", mcpServers: {} },
      parseClaudeJsonRoot(native),
    );
    assert.equal(merged.theme, "dark");
  });

  test(`claude-code ${os}: managed servers always use gateway`, async () => {
    const native = (await loadFixtureJson("claude-code", os)) as Record<string, unknown>;
    const plan = claudeCodeAdapter.renderMcpServers(parseClaudeJsonRoot(native), {
      proxyMode: "cloud_gateway",
      orgSlug: "acme-dev",
      gatewayBaseUrl: "https://mcp.acme-dev.example.com",
      targetOs: os,
      existingConfig: {},
    });
    assert.ok(plan.files[0].path.endsWith(".claude.json"));
    const out = JSON.parse(plan.files[0].content) as {
      mcpServers: Record<string, { url?: string; type?: string }>;
    };
    assert.equal(out.mcpServers["org-proxy-example"].type, "http");
    assert.equal(
      out.mcpServers["org-proxy-example"].url,
      "https://mcp.acme-dev.example.com/org-proxy-example",
    );
  });

  test(`claude-code ${os}: local proxy URL shape`, async () => {
    const native = (await loadFixtureJson("claude-code", os)) as Record<string, unknown>;
    const plan = claudeCodeAdapter.renderMcpServers(parseClaudeJsonRoot(native), {
      proxyMode: "local_proxy",
      orgSlug: "acme-dev",
      localProxyPort: 4242,
      targetOs: os,
    });
    const out = JSON.parse(plan.files[0].content) as {
      mcpServers: Record<string, { url?: string }>;
    };
    assert.equal(
      out.mcpServers["org-proxy-example"].url,
      "http://127.0.0.1:4242/org-proxy-example",
    );
  });

  test(`claude-code ${os}: proxy: false keeps the direct URL, other servers still proxied`, async () => {
    const native = (await loadFixtureJson("claude-code", os)) as Record<string, unknown>;
    for (const { ctx, proxied } of PROXY_CASES) {
      const plan = claudeCodeAdapter.renderMcpServers(markDirect(parseClaudeJsonRoot(native)), {
        ...ctx,
        targetOs: os,
        existingConfig: {},
      });
      const out = JSON.parse(plan.files[0].content) as {
        mcpServers: Record<string, Record<string, unknown>>;
      };
      assert.equal(out.mcpServers["org-proxy-example"].url, DIRECT_URL);
      assert.equal(out.mcpServers["org-proxy-example"].proxy, undefined);
      assert.equal(out.mcpServers["filesystem-spike"].url, proxied("filesystem-spike"));
    }
  });
}

test("claude-code: materializes demo pack", async () => {
  const files = await loadSkillPackDir(DEMO_PACK_ROOT);
  const plan = claudeCodeAdapter.materializeSkillPack(
    { slug: "demo-pack", skillPackId: "demo-pack", version: 1, files },
    { proxyMode: "cloud_gateway", orgSlug: "acme", targetOs: "macos" },
  );
  assert.ok(plan.files.some((file) => file.path.includes(join(".claude", "skills", "demo-pack"))));
});
