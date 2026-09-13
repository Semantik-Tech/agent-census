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
import { vscodeAdapter, parseVscodeMcp, renderVscodeMcp } from "../src/index.js";

const OSS = ["macos", "windows"] as const;

for (const os of OSS) {
  test(`vscode ${os}: fixture round-trip (parse → render → parse)`, async () => {
    const native = (await loadFixtureJson("vscode", os)) as { servers?: Record<string, unknown> };
    const paths = { ...nativePaths("vscode", os), mcpConfig: native };
    const fragments = vscodeAdapter.parseMcpServers(paths);
    assert.equal(fragments.length, 2);
    const rendered = renderVscodeMcp(fragments);
    const reparsed = parseVscodeMcp(rendered);
    assert.equal(stableStringify(fragments), stableStringify(reparsed));
  });

  test(`vscode ${os}: stdio core fields preserved on round-trip`, async () => {
    const native = (await loadFixtureJson("vscode", os)) as { servers?: Record<string, unknown> };
    const fragments = parseVscodeMcp(native);
    const reparsed = parseVscodeMcp(renderVscodeMcp(fragments));
    assert.deepEqual(coreMcpFields(fragments), coreMcpFields(reparsed));
  });

  test(`vscode ${os}: render golden matches fixture for non-proxy round-trip`, async () => {
    const native = (await loadFixtureJson("vscode", os)) as Record<string, unknown>;
    const paths = { ...nativePaths("vscode", os), mcpConfig: native };
    const fragments = vscodeAdapter.parseMcpServers(paths);
    const rendered = renderVscodeMcp(fragments);
    assert.equal(stableStringify(rendered), stableStringify(native));
  });

  test(`vscode ${os}: proxy render uses cloud gateway URL`, async () => {
    const native = (await loadFixtureJson("vscode", os)) as Record<string, unknown>;
    const paths = { ...nativePaths("vscode", os), mcpConfig: native };
    const fragments = vscodeAdapter.parseMcpServers(paths);
    const plan = vscodeAdapter.renderMcpServers(fragments, {
      proxyMode: "cloud_gateway",
      orgSlug: "acme-dev",
      gatewayBaseUrl: "https://mcp.acme-dev.example.com",
      targetOs: os,
      clientTarget: "vscode",
    });
    assert.ok(plan.files[0]!.path.includes(join("Code", "User", "mcp.json")));
    const out = JSON.parse(plan.files[0]!.content) as {
      servers: Record<string, { url?: string }>;
    };
    assert.equal(
      out.servers["org-proxy-example"].url,
      "https://mcp.acme-dev.example.com/org-proxy-example",
    );
  });

  test(`vscode ${os}: loopback OAuth proxy URL shape`, async () => {
    const native = (await loadFixtureJson("vscode", os)) as Record<string, unknown>;
    const paths = { ...nativePaths("vscode", os), mcpConfig: native };
    const fragments = vscodeAdapter.parseMcpServers(paths);
    const plan = vscodeAdapter.renderMcpServers(fragments, {
      proxyMode: "cloud_gateway",
      orgSlug: "acme-dev",
      mcpLoopbackPort: 37621,
      deviceId: "device-1",
      clientTarget: "vscode",
      targetOs: os,
    });
    const out = JSON.parse(plan.files[0]!.content) as {
      servers: Record<string, { url?: string; oauth?: { clientId: string } }>;
    };
    assert.equal(
      out.servers["org-proxy-example"].url,
      "http://127.0.0.1:37621/mcp/device-1/vscode/org-proxy-example",
    );
    assert.equal(out.servers["org-proxy-example"].oauth?.clientId, "vscode");
  });
}

test("vscode: materializeSkillPack demo-pack", async () => {
  const files = await loadSkillPackDir(DEMO_PACK_ROOT);
  const plan = vscodeAdapter.materializeSkillPack(
    { slug: "demo-pack", skillPackId: "demo-pack", version: 1, files },
    { proxyMode: "cloud_gateway", orgSlug: "acme", targetOs: "macos" },
  );
  assert.ok(plan.files.some((f) => f.path.includes(join(".copilot", "skills", "demo-pack", "SKILL.md"))));
});
