import type { McpServerFragment } from "@semantik-tech/adapters-shared";

interface CursorMcpFile {
  mcpServers: Record<string, Record<string, unknown>>;
}

export function renderCursorMcp(fragments: McpServerFragment[]): CursorMcpFile {
  const mcpServers: Record<string, Record<string, unknown>> = {};
  for (const f of fragments) {
    mcpServers[f.id] = entryFromFragment(f);
  }
  return { mcpServers };
}

function entryFromFragment(f: McpServerFragment): Record<string, unknown> {
  const extras = f.nativeExtras ?? {};
  if (f.transport === "http" || f.transport === "sse") {
    return {
      url: f.url,
      ...(f.headers ? { headers: f.headers } : {}),
      ...extras,
    };
  }
  return {
    command: f.command,
    args: f.args,
    ...(f.env !== undefined ? { env: f.env } : {}),
    ...extras,
  };
}
