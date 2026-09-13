import type { McpServerFragment } from "@semantik-tech/adapters-shared";

type GeminiServerEntry = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  httpUrl?: string;
  url?: string;
  headers?: Record<string, string>;
  timeout?: number;
  trust?: boolean;
  cwd?: string;
};

interface GeminiSettings {
  mcpServers?: Record<string, GeminiServerEntry>;
  [key: string]: unknown;
}

export function parseGeminiSettings(native: GeminiSettings): McpServerFragment[] {
  return Object.entries(native.mcpServers ?? {}).map(([id, entry]) =>
    fragmentFromGemini(id, entry),
  );
}

function fragmentFromGemini(id: string, entry: GeminiServerEntry): McpServerFragment {
  const nativeExtras: Record<string, unknown> = {};
  if (entry.timeout !== undefined) nativeExtras.timeout = entry.timeout;
  if (entry.trust !== undefined) nativeExtras.trust = entry.trust;

  const url = entry.httpUrl ?? entry.url;
  if (url) {
    return {
      id,
      transport: "http",
      url,
      headers: entry.headers,
      nativeExtras: Object.keys(nativeExtras).length ? nativeExtras : undefined,
    };
  }
  if (entry.cwd) nativeExtras.cwd = entry.cwd;
  return {
    id,
    transport: "stdio",
    command: entry.command,
    args: entry.args,
    env: entry.env,
    nativeExtras: Object.keys(nativeExtras).length ? nativeExtras : undefined,
  };
}
