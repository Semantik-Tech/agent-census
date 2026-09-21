import type { ClientTarget, McpServer } from "@semantik-tech/manifest-schema";

export type { ClientTarget };

export type TargetOs = "macos" | "windows";

/** Manifest-aligned MCP fragment plus platform-native fields for round-trip. */
export interface McpServerFragment extends McpServer {
  headers?: Record<string, string>;
  /** Native-only fields preserved opaquely when possible (cwd, auth, timeout, …). */
  nativeExtras?: Record<string, unknown>;
}

export interface NativePaths {
  os: TargetOs;
  home: string;
  mcpConfigFile: string;
  skillsRoot: string;
}

/**
 * Caller-injected disk snapshot — adapters stay pure (no fs in production modules).
 * Desktop agent (task 07) reads native files and populates these fields.
 */
export interface NativePathsContent extends NativePaths {
  /** Parsed native MCP/settings JSON (whole file). */
  mcpConfig?: unknown;
  /** Slugs of directories under skillsRoot that contain SKILL.md. */
  installedSkillSlugs?: string[];
}

export type ProxyMode = "cloud_gateway" | "local_proxy";

export interface RenderContext {
  proxyMode: ProxyMode;
  orgSlug: string;
  localProxyPort?: number;
  /** Stable authenticated desktop-engine ingress. */
  mcpLoopbackPort?: number;
  deviceId?: string;
  clientTarget?: ClientTarget;
  /** Gateway origin, e.g. https://gateway.example.com — required in cloud_gateway mode */
  gatewayBaseUrl?: string;
  /** Target OS for WritePlan path resolution (defaults to host OS in tests). */
  targetOs?: TargetOs;
  /** Existing native config for merge render (Claude ~/.claude.json, Gemini settings.json). */
  existingConfig?: unknown;
}

export type WriteStrategy = "replace" | "json-merge";

export interface WritePlanEntry {
  path: string;
  content: string;
  strategy: WriteStrategy;
  /** Hint for task 07 executor: copy existing file before overwrite. */
  backup?: boolean;
}

export interface WritePlan {
  files: WritePlanEntry[];
}

export interface InstalledSkillPack {
  slug: string;
  path: string;
  skillPackId?: string;
  version?: number;
}

/** SkillPack tree extracted from a published blob (caller downloads + unpacks). */
export interface ExtractedSkillPack {
  slug: string;
  skillPackId: string;
  version: number;
  /** Relative path from pack root → file contents (UTF-8 text). */
  files: Record<string, string>;
}

export interface ClientTargetAdapter {
  clientTarget: ClientTarget;
  parseMcpServers(paths: NativePathsContent): McpServerFragment[];
  listInstalledSkillPacks(paths: NativePathsContent): InstalledSkillPack[];
  renderMcpServers(fragments: McpServerFragment[], ctx: RenderContext): WritePlan;
  materializeSkillPack(pack: ExtractedSkillPack, ctx: RenderContext): WritePlan;
}
