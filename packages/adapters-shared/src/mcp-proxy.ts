import { buildProxyUrl } from "./proxy-url.js";
import type { McpServerFragment, RenderContext } from "./types.js";

/** Route org-managed servers through the managed sidecar/gateway unless a remote server sets `proxy: false`. */
export function applyProxyToFragment(
  fragment: McpServerFragment,
  ctx: RenderContext,
): McpServerFragment {
  // The schema only allows proxy: false on http/sse; stdio is always proxied below.
  if (fragment.proxy === false && fragment.transport !== "stdio") return fragment;
  // cloud_gateway + local_proxy rewrite stdio → gateway/local proxy URL (device tunnel for stdio in cloud).
  if (fragment.transport === "stdio") {
    if (ctx.proxyMode === "local_proxy" || ctx.proxyMode === "cloud_gateway") {
      const url = buildProxyUrl(fragment.id, ctx);
      const { command: _c, args: _a, env: _e, ...rest } = fragment;
      return { ...rest, transport: "http", url };
    }
    return fragment;
  }
  const url = buildProxyUrl(fragment.id, ctx);
  return { ...fragment, url };
}

export function applyProxyToFragments(
  fragments: McpServerFragment[],
  ctx: RenderContext,
): McpServerFragment[] {
  return fragments.map((f) => applyProxyToFragment(f, ctx));
}
