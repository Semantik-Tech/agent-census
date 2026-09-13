import type { McpServerFragment } from "@semantik-tech/adapters-shared";

interface CursorMcpFile {
  mcpServers?: Record<string, unknown>;
}

type CursorServerEntry = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  auth?: Record<string, unknown>;
  envFile?: string;
  cwd?: string;
};

export function parseCursorMcp(native: CursorMcpFile): McpServerFragment[] {
  const servers = native.mcpServers ?? {};
  return Object.entries(servers).map(([id, entry]) =>
    fragmentFromCursor(id, entry as CursorServerEntry),
  );
}

function fragmentFromCursor(id: string, entry: CursorServerEntry): McpServerFragment {
  if (entry.url) {
    const extras: Record<string, unknown> = {};
    if (entry.auth) extras.auth = entry.auth;
    if (entry.envFile) extras.envFile = entry.envFile;
    return {
      id,
      transport: "http",
      url: entry.url,
      headers: entry.headers,
      nativeExtras: Object.keys(extras).length ? extras : undefined,
    };
  }
  const extras: Record<string, unknown> = {};
  if (entry.cwd) extras.cwd = entry.cwd;
  if (entry.envFile) extras.envFile = entry.envFile;
  return {
    id,
    transport: "stdio",
    command: entry.command,
    args: entry.args,
    env: entry.env,
    nativeExtras: Object.keys(extras).length ? extras : undefined,
  };
}
