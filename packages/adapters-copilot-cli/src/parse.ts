import type { McpServerFragment } from "@semantik-tech/adapters-shared";

type CopilotServerEntry = {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  tools?: string[];
  oauth?: Record<string, unknown>;
};

export function parseCopilotMcpServers(
  mcpServers: Record<string, unknown>,
): McpServerFragment[] {
  return Object.entries(mcpServers).map(([id, entry]) =>
    fragmentFromCopilot(id, entry as CopilotServerEntry),
  );
}

function fragmentFromCopilot(id: string, entry: CopilotServerEntry): McpServerFragment {
  const extras: Record<string, unknown> = {};
  if (entry.tools) extras.tools = entry.tools;
  if (entry.oauth) extras.oauth = entry.oauth;
  if (entry.type) extras.type = entry.type;

  if (entry.url || entry.type === "http" || entry.type === "sse" || entry.type === "remote") {
    const transport = entry.type === "sse" ? "sse" : "http";
    return {
      id,
      transport,
      url: entry.url,
      headers: entry.headers,
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

export function parseCopilotMcpConfig(doc: Record<string, unknown>): McpServerFragment[] {
  const top = doc.mcpServers;
  if (top && typeof top === "object" && !Array.isArray(top)) {
    return parseCopilotMcpServers(top as Record<string, unknown>);
  }
  return [];
}
