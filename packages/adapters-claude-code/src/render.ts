import type { McpServerFragment } from "@semantik-tech/adapters-shared";

export function renderClaudeMcpServers(
  fragments: McpServerFragment[],
): Record<string, Record<string, unknown>> {
  const mcpServers: Record<string, Record<string, unknown>> = {};
  for (const fragment of fragments) {
    mcpServers[fragment.id] = entryFromFragment(fragment);
  }
  return mcpServers;
}

function entryFromFragment(fragment: McpServerFragment): Record<string, unknown> {
  if (fragment.transport === "http" || fragment.transport === "sse") {
    const type =
      typeof fragment.nativeExtras?.type === "string"
        ? fragment.nativeExtras.type
        : fragment.transport === "sse"
          ? "sse"
          : "http";
    return {
      type,
      url: fragment.url,
      ...(fragment.headers ? { headers: fragment.headers } : {}),
    };
  }
  const type =
    typeof fragment.nativeExtras?.type === "string" ? fragment.nativeExtras.type : "stdio";
  return {
    type,
    command: fragment.command,
    args: fragment.args,
    ...(fragment.env !== undefined ? { env: fragment.env } : {}),
  };
}

/** Merge into managed user-global section of claude.json — preserves unrelated keys. */
export function renderClaudeJsonManaged(
  existing: Record<string, unknown>,
  fragments: McpServerFragment[],
): Record<string, unknown> {
  return {
    ...existing,
    mcpServers: renderClaudeMcpServers(fragments),
  };
}
