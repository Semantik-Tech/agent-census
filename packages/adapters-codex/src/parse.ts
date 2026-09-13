import type { McpServerFragment } from "@semantik-tech/adapters-shared";

type CodexServerEntry = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  http_headers?: Record<string, string>;
  auth?: string;
};

export function parseCodexMcpServers(
  mcpServers: Record<string, unknown>,
): McpServerFragment[] {
  return Object.entries(mcpServers).map(([id, entry]) =>
    fragmentFromCodex(id, entry as CodexServerEntry),
  );
}

function fragmentFromCodex(id: string, entry: CodexServerEntry): McpServerFragment {
  const extras: Record<string, unknown> = {};
  if (entry.auth) extras.auth = entry.auth;

  if (entry.url) {
    return {
      id,
      transport: "http",
      url: entry.url,
      headers: entry.http_headers,
      nativeExtras: Object.keys(extras).length ? extras : undefined,
    };
  }
  return {
    id,
    transport: "stdio",
    command: entry.command,
    args: entry.args,
    env: entry.env,
    nativeExtras: Object.keys(extras).length ? extras : undefined,
  };
}

export function parseCodexConfig(doc: Record<string, unknown>): McpServerFragment[] {
  const servers = doc.mcp_servers;
  if (servers && typeof servers === "object" && !Array.isArray(servers)) {
    return parseCodexMcpServers(servers as Record<string, unknown>);
  }
  return [];
}
