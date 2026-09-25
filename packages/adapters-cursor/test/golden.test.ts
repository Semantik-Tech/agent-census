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
import { cursorAdapter, parseCursorMcp, renderCursorMcp } from "../src/index.js";

const OSS = ["macos", "windows"] as const;

for (const os of OSS) {
  test(`cursor ${os}: fixture round-trip (parse → render → parse)`, async () => {
    const native = (await loadFixtureJson("cursor", os)) as { mcpServers?: Record<string, unknown> };
    const paths = { ...nativePaths("cursor", os), mcpConfig: native };
    const fragments = cursorAdapter.parseMcpServers(paths);
    assert.equal(fragments.length, 2);

    const rendered = renderCursorMcp(fragments);
    const reparsed = parseCursorMcp(rendered);
    assert.equal(stableStringify(fragments), stableStringify(reparsed));
  });

  test(`cursor ${os}: stdio core fields preserved on round-trip`, async () => {
    const native = (await loadFixtureJson("cursor", os)) as { mcpServers?: Record<string, unknown> };
    const fragments = parseCursorMcp(native);
    const reparsed = parseCursorMcp(renderCursorMcp(fragments));
    assert.deepEqual(coreMcpFields(fragments), coreMcpFields(reparsed));
  });

  test(`cursor ${os}: render golden matches fixture for non-proxy round-trip`, async () => {
    const native = (await loadFixtureJson("cursor", os)) as Record<string, unknown>;
    const paths = { ...nativePaths("cursor", os), mcpConfig: native };
    const fragments = cursorAdapter.parseMcpServers(paths);
    const rendered = renderCursorMcp(fragments);
    assert.equal(stableStringify(rendered), stableStringify(native));
  });

  test(`cursor ${os}: proxy render uses cloud gateway URL`, async () => {
    const native = (await loadFixtureJson("cursor", os)) as Record<string, unknown>;
    const paths = { ...nativePaths("cursor", os), mcpConfig: native };
    const fragments = cursorAdapter.parseMcpServers(paths);
    const plan = cursorAdapter.renderMcpServers(fragments, {
      proxyMode: "cloud_gateway",
      orgSlug: "acme-dev",
      gatewayBaseUrl: "https://mcp.acme-dev.example.com",
      targetOs: os,
    });
    assert.ok(plan.files[0].path.endsWith(join(".cursor", "mcp.json")));
    const out = JSON.parse(plan.files[0].content) as {
      mcpServers: Record<string, { url?: string; command?: string }>;
    };
    assert.equal(
      out.mcpServers["org-proxy-example"].url,
      "https://mcp.acme-dev.example.com/org-proxy-example",
    );
    assert.equal(
      out.mcpServers["filesystem-spike"].url,
      "https://mcp.acme-dev.example.com/filesystem-spike",
    );
  });

  test(`cursor ${os}: local_proxy URL shape`, async () => {
    const native = (await loadFixtureJson("cursor", os)) as Record<string, unknown>;
    const paths = { ...nativePaths("cursor", os), mcpConfig: native };
    const fragments = cursorAdapter.parseMcpServers(paths);
    const plan = cursorAdapter.renderMcpServers(fragments, {
      proxyMode: "local_proxy",
      orgSlug: "acme-dev",
      localProxyPort: 9999,
      targetOs: os,
    });
    const out = JSON.parse(plan.files[0].content) as {
      mcpServers: Record<string, { url?: string }>;
    };
    assert.equal(out.mcpServers["org-proxy-example"].url, "http://127.0.0.1:9999/org-proxy-example");
  });

  test(`cursor ${os}: proxy: false keeps the direct URL, other servers still proxied`, async () => {
    const native = (await loadFixtureJson("cursor", os)) as Record<string, unknown>;
    for (const { ctx, proxied } of PROXY_CASES) {
      const plan = cursorAdapter.renderMcpServers(markDirect(parseCursorMcp(native)), {
        ...ctx,
        targetOs: os,
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

test("cursor: materializeSkillPack demo-pack", async () => {
  const files = await loadSkillPackDir(DEMO_PACK_ROOT);
  const plan = cursorAdapter.materializeSkillPack(
    { slug: "demo-pack", skillPackId: "demo-pack", version: 1, files },
    { proxyMode: "cloud_gateway", orgSlug: "acme", targetOs: "macos" },
  );
  assert.ok(plan.files.some((f) => f.path.includes(join("skills", "demo-pack", "SKILL.md"))));
});

test("cursor: listInstalledSkillPacks", () => {
  const paths = {
    ...nativePaths("cursor", "macos"),
    installedSkillSlugs: ["demo-pack"],
  };
  const listed = cursorAdapter.listInstalledSkillPacks(paths);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].slug, "demo-pack");
});
