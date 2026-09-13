import type { McpServerFragment } from "@semantik-tech/adapters-shared";

export function renderGeminiSettings(
  existing: Record<string, unknown>,
  fragments: McpServerFragment[],
): Record<string, unknown> {
  const mcpServers: Record<string, Record<string, unknown>> = {};
  for (const fragment of fragments) {
    mcpServers[fragment.id] = entryFromFragment(fragment);
  }
  return { ...existing, mcpServers };
}

function entryFromFragment(fragment: McpServerFragment): Record<string, unknown> {
  const extras = fragment.nativeExtras ?? {};
  if (fragment.transport === "http" || fragment.transport === "sse") {
    return {
      httpUrl: fragment.url,
      ...(fragment.headers ? { headers: fragment.headers } : {}),
      ...extras,
    };
  }
  return {
    command: fragment.command,
    args: fragment.args,
    ...(fragment.env !== undefined ? { env: fragment.env } : {}),
    ...extras,
  };
}
