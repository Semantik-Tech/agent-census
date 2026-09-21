import type { RenderContext } from "./types.js";

/** Org-managed MCP proxy URL — never expose upstream URLs when proxy is enabled (ADR-0001). */
export function buildProxyUrl(mcpServerId: string, ctx: RenderContext): string {
  if (ctx.mcpLoopbackPort && ctx.deviceId && ctx.clientTarget) {
    return `http://127.0.0.1:${ctx.mcpLoopbackPort}/mcp/${encodeURIComponent(ctx.deviceId)}/${ctx.clientTarget}/${encodeURIComponent(mcpServerId)}`;
  }
  if (ctx.proxyMode === "cloud_gateway") {
    // No fallback: the old default was a made-up per-org host that could never
    // be dialled, and it hid missing configuration behind a plausible URL.
    if (!ctx.gatewayBaseUrl) {
      throw new Error("cloud_gateway render requires gatewayBaseUrl");
    }
    return `${ctx.gatewayBaseUrl.replace(/\/$/, "")}/${mcpServerId}`;
  }
  const port = ctx.localProxyPort ?? 8765;
  return `http://127.0.0.1:${port}/${mcpServerId}`;
}
