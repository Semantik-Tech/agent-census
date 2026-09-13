import type { McpServerFragment } from "@semantik-tech/adapters-shared";

interface VscodeMcpFile {
  servers?: Record<string, unknown>;
}

type VscodeServerEntry = {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  oauth?: Record<string, unknown>;
};

export function parseVscodeMcp(native: VscodeMcpFile): McpServerFragment[] {
  const servers = native.servers ?? {};
  return Object.entries(servers).map(([id, entry]) =>
    fragmentFromVscode(id, entry as VscodeServerEntry),
  );
}

function fragmentFromVscode(id: string, entry: VscodeServerEntry): McpServerFragment {
  const extras: Record<string, unknown> = {};
  if (entry.oauth) extras.oauth = entry.oauth;
  if (entry.type) extras.type = entry.type;

  if (entry.url || entry.type === "http" || entry.type === "sse") {
    return {
      id,
      transport: entry.type === "sse" ? "sse" : "http",
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
