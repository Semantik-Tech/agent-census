// The subset of the Semantik manifest schema that the client adapters need.
// The full schema — bundles, skill pack references, validation — lives in the
// private control-plane repository and is deliberately not published here.

export { CLIENT_TARGET_IDS, type ClientTarget } from "./client-targets.js";

import type { ClientTarget } from "./client-targets.js";

export type McpTransport = "stdio" | "sse" | "http";

export type UpstreamAuth =
  | { type: "none" }
  | { type: "oauth"; scopes?: string[] }
  | { type: "static_headers"; headers: Record<string, string> };

export interface McpServer {
  id: string;
  displayName?: string;
  transport: McpTransport;
  clientTargets?: ClientTarget[];
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  auth?: UpstreamAuth;
}
