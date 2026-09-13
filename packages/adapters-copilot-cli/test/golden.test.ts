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
import {
  copilotCliAdapter,
  parseCopilotMcpConfig,
  parseCopilotMcpServers,
  renderCopilotMcpConfig,
  renderCopilotMcpServers,
} from "../src/index.js";

const OSS = ["macos", "windows"] as const;

for (const os of OSS) {
  test(`copilot-cli ${os}: fixture round-trip`, async () => {
    const native = (await loadFixtureJson("copilot-cli", os)) as Record<string, unknown>;
    const paths = { ...nativePaths("copilot-cli", os), mcpConfig: native };
    const fragments = copilotCliAdapter.parseMcpServers(paths);
    assert.equal(fragments.length, 2);
    const rendered = renderCopilotMcpConfig(fragments);
    assert.equal(
      stableStringify(fragments),
      stableStringify(parseCopilotMcpServers(rendered.mcpServers as Record<string, unknown>)),
    );
  });

  test(`copilot-cli ${os}: stdio core fields survive round-trip`, async () => {
    const native = (await loadFixtureJson("copilot-cli", os)) as Record<string, unknown>;
    const fragments = parseCopilotMcpConfig(native);
    const reparsed = parseCopilotMcpServers(
      renderCopilotMcpServers(fragments) as Record<string, unknown>,
    );
    assert.deepEqual(coreMcpFields(fragments), coreMcpFields(reparsed));
  });

  test(`copilot-cli ${os}: native round-trip matches fixture`, async () => {
    const native = (await loadFixtureJson("copilot-cli", os)) as Record<string, unknown>;
    assert.equal(
      stableStringify(renderCopilotMcpConfig(parseCopilotMcpConfig(native))),
      stableStringify(native),
    );
  });

  test(`copilot-cli ${os}: managed servers always use gateway`, async () => {
    const native = (await loadFixtureJson("copilot-cli", os)) as Record<string, unknown>;
    const plan = copilotCliAdapter.renderMcpServers(parseCopilotMcpConfig(native), {
      proxyMode: "cloud_gateway",
      orgSlug: "acme-dev",
      gatewayBaseUrl: "https://mcp.acme-dev.example.com",
      targetOs: os,
      clientTarget: "copilot-cli",
    });
    assert.ok(plan.files[0]!.path.endsWith(join(".copilot", "mcp-config.json")));
    const out = JSON.parse(plan.files[0]!.content) as {
      mcpServers: Record<string, { url?: string; type?: string }>;
    };
    assert.equal(out.mcpServers["org-proxy-example"].type, "http");
    assert.equal(
      out.mcpServers["org-proxy-example"].url,
      "https://mcp.acme-dev.example.com/org-proxy-example",
    );
  });

  test(`copilot-cli ${os}: local proxy URL shape`, async () => {
    const native = (await loadFixtureJson("copilot-cli", os)) as Record<string, unknown>;
    const plan = copilotCliAdapter.renderMcpServers(parseCopilotMcpConfig(native), {
      proxyMode: "local_proxy",
      orgSlug: "acme-dev",
      localProxyPort: 4242,
      targetOs: os,
    });
    const out = JSON.parse(plan.files[0]!.content) as {
      mcpServers: Record<string, { url?: string }>;
    };
    assert.equal(
      out.mcpServers["org-proxy-example"].url,
      "http://127.0.0.1:4242/org-proxy-example",
    );
  });
}

test("copilot-cli: materializes demo pack", async () => {
  const files = await loadSkillPackDir(DEMO_PACK_ROOT);
  const plan = copilotCliAdapter.materializeSkillPack(
    { slug: "demo-pack", skillPackId: "demo-pack", version: 1, files },
    { proxyMode: "cloud_gateway", orgSlug: "acme", targetOs: "macos" },
  );
  assert.ok(
    plan.files.some((file) => file.path.includes(join(".copilot", "skills", "demo-pack"))),
  );
});
