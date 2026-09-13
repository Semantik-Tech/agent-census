import type { McpServerFragment } from "@semantik-tech/adapters-shared";

export function renderCopilotMcpServers(
  fragments: McpServerFragment[],
): Record<string, Record<string, unknown>> {
  const mcpServers: Record<string, Record<string, unknown>> = {};
  for (const fragment of fragments) {
    mcpServers[fragment.id] = entryFromFragment(fragment);
  }
  return mcpServers;
}

function entryFromFragment(fragment: McpServerFragment): Record<string, unknown> {
  const extras = fragment.nativeExtras ?? {};
  const tools = Array.isArray(extras.tools) ? extras.tools : ["*"];

  if (fragment.transport === "http" || fragment.transport === "sse") {
    const type =
      typeof extras.type === "string" ? extras.type : fragment.transport === "sse" ? "sse" : "http";
    return {
      type,
      url: fragment.url,
      ...(fragment.headers ? { headers: fragment.headers } : {}),
      tools,
      ...(extras.oauth ? { oauth: extras.oauth } : {}),
    };
  }

  const type = typeof extras.type === "string" ? extras.type : "local";
  return {
    type,
    command: fragment.command,
    args: fragment.args,
    ...(fragment.env !== undefined ? { env: fragment.env } : {}),
    tools,
  };
}

export function renderCopilotMcpConfig(fragments: McpServerFragment[]): Record<string, unknown> {
  return { mcpServers: renderCopilotMcpServers(fragments) };
}
