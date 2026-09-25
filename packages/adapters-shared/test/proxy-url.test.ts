import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildProxyUrl,
  applyProxyToFragment,
  type McpServerFragment,
} from "../src/index.js";

test("cloud_gateway proxy URL uses gatewayBaseUrl + server id", () => {
  const url = buildProxyUrl("github", {
    proxyMode: "cloud_gateway",
    orgSlug: "acme",
    gatewayBaseUrl: "https://mcp.acme.example.com",
  });
  assert.equal(url, "https://mcp.acme.example.com/github");
});

test("cloud_gateway strips trailing slash from base", () => {
  const url = buildProxyUrl("slack", {
    proxyMode: "cloud_gateway",
    orgSlug: "acme",
    gatewayBaseUrl: "https://mcp.acme.example.com/",
  });
  assert.equal(url, "https://mcp.acme.example.com/slack");
});

test("cloud_gateway without gatewayBaseUrl is an error, not a made-up host", () => {
  assert.throws(
    () => buildProxyUrl("fs", { proxyMode: "cloud_gateway", orgSlug: "acme-dev" }),
    /requires gatewayBaseUrl/,
  );
});

test("local_proxy URL uses 127.0.0.1 and port", () => {
  const url = buildProxyUrl("github", {
    proxyMode: "local_proxy",
    orgSlug: "acme",
    localProxyPort: 9123,
  });
  assert.equal(url, "http://127.0.0.1:9123/github");
});

test("local_proxy defaults port 8765", () => {
  const url = buildProxyUrl("github", {
    proxyMode: "local_proxy",
    orgSlug: "acme",
  });
  assert.equal(url, "http://127.0.0.1:8765/github");
});

test("applyProxyToFragment rewrites stdio in cloud_gateway and local_proxy", () => {
  const stdio: McpServerFragment = {
    id: "fs",
    transport: "stdio",
    command: "npx",
    args: ["-y", "pkg"],
  };
  const cloud = applyProxyToFragment(stdio, {
    proxyMode: "cloud_gateway",
    orgSlug: "acme",
    gatewayBaseUrl: "https://mcp.acme.example.com",
  });
  assert.equal(cloud.transport, "http");
  assert.equal(cloud.url, "https://mcp.acme.example.com/fs");

  const local = applyProxyToFragment(stdio, {
    proxyMode: "local_proxy",
    orgSlug: "acme",
    localProxyPort: 9123,
  });
  assert.equal(local.transport, "http");
  assert.equal(local.url, "http://127.0.0.1:9123/fs");
  assert.equal(local.command, undefined);

  const remote: McpServerFragment = {
    id: "legacy",
    transport: "http",
    url: "https://upstream.example.com",
  };
  assert.equal(
    applyProxyToFragment(remote, {
      proxyMode: "cloud_gateway",
      orgSlug: "acme",
      gatewayBaseUrl: "https://mcp.acme.example.com",
    }).url,
    "https://mcp.acme.example.com/legacy",
  );
});

test("applyProxyToFragment rewrites http url", () => {
  const http: McpServerFragment = {
    id: "org-proxy-example",
    transport: "http",
    url: "https://upstream.example.com/old",
    headers: { Authorization: "Bearer x" },
  };
  const proxied = applyProxyToFragment(http, {
    proxyMode: "cloud_gateway",
    orgSlug: "acme-dev",
    gatewayBaseUrl: "https://mcp.acme-dev.example.com",
  });
  assert.equal(proxied.url, "https://mcp.acme-dev.example.com/org-proxy-example");
  assert.deepEqual(proxied.headers, { Authorization: "Bearer x" });
});

test("applyProxyToFragment keeps the direct url for proxy: false remote servers only", () => {
  const ctx = { proxyMode: "local_proxy", orgSlug: "acme", localProxyPort: 9123 } as const;
  const direct: McpServerFragment = {
    id: "semantik",
    transport: "http",
    url: "https://api.example.com/v1/mcp",
    proxy: false,
  };
  assert.equal(applyProxyToFragment(direct, ctx), direct);
  // The schema rejects proxy: false on stdio; if one slips through it is still proxied.
  const stdio: McpServerFragment = { id: "fs", transport: "stdio", command: "npx", proxy: false };
  assert.equal(applyProxyToFragment(stdio, ctx).url, "http://127.0.0.1:9123/fs");
});
