import type { McpServerFragment } from "@semantik-tech/adapters-shared";

interface VscodeMcpFile {
  servers: Record<string, Record<string, unknown>>;
}

export function renderVscodeMcp(fragments: McpServerFragment[]): VscodeMcpFile {
  const servers: Record<string, Record<string, unknown>> = {};
  for (const fragment of fragments) {
    servers[fragment.id] = entryFromFragment(fragment);
  }
  return { servers };
}

function entryFromFragment(fragment: McpServerFragment): Record<string, unknown> {
  const extras = fragment.nativeExtras ?? {};
  if (fragment.transport === "http" || fragment.transport === "sse") {
    const type =
      typeof extras.type === "string" ? extras.type : fragment.transport === "sse" ? "sse" : "http";
    return {
      type,
      url: fragment.url,
      ...(fragment.headers ? { headers: fragment.headers } : {}),
      ...(extras.oauth ? { oauth: extras.oauth } : {}),
    };
  }
  return {
    command: fragment.command,
    args: fragment.args,
    ...(fragment.env !== undefined ? { env: fragment.env } : {}),
  };
}
