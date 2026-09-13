import type { McpServerFragment } from "@semantik-tech/adapters-shared";

type ClaudeServerEntry = {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
};

export function parseClaudeMcpServers(
  mcpServers: Record<string, unknown>,
): McpServerFragment[] {
  return Object.entries(mcpServers).map(([id, entry]) =>
    fragmentFromClaude(id, entry as ClaudeServerEntry),
  );
}

function fragmentFromClaude(id: string, entry: ClaudeServerEntry): McpServerFragment {
  const transport = entry.type ?? (entry.url ? "http" : "stdio");
  if (
    transport === "http" ||
    transport === "sse" ||
    transport === "streamable-http" ||
    entry.url
  ) {
    return {
      id,
      transport: transport === "sse" ? "sse" : "http",
      url: entry.url,
      headers: entry.headers,
      nativeExtras: entry.type ? { type: entry.type } : undefined,
    };
  }
  return {
    id,
    transport: "stdio",
    command: entry.command,
    args: entry.args,
    env: entry.env,
    nativeExtras: entry.type ? { type: entry.type } : { type: "stdio" },
  };
}

/** Extract user-global servers from ~/.claude.json for inventory. */
export function parseClaudeJsonRoot(doc: Record<string, unknown>): McpServerFragment[] {
  const top = doc.mcpServers;
  if (top && typeof top === "object" && !Array.isArray(top)) {
    return parseClaudeMcpServers(top as Record<string, unknown>);
  }
  return [];
}
