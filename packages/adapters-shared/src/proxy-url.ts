import type { RenderContext } from "./types.js";

/** Org-managed MCP proxy URL — never expose upstream URLs when proxy is enabled (ADR-0001). */
export function buildProxyUrl(mcpServerId: string, ctx: RenderContext): string {
  if (ctx.mcpLoopbackPort && ctx.deviceId && ctx.clientTarget) {
    return `http://127.0.0.1:${ctx.mcpLoopbackPort}/mcp/${encodeURIComponent(ctx.deviceId)}/${ctx.clientTarget}/${encodeURIComponent(mcpServerId)}`;
  }
  if (ctx.proxyMode === "cloud_gateway") {
    const base = ctx.gatewayBaseUrl ?? defaultGatewayBaseUrl(ctx.orgSlug);
    return `${base.replace(/\/$/, "")}/${mcpServerId}`;
  }
  const port = ctx.localProxyPort ?? 8765;
  return `http://127.0.0.1:${port}/${mcpServerId}`;
}

export function defaultGatewayBaseUrl(orgSlug: string): string {
  return `https://mcp.${orgSlug}.example.com`;
}
