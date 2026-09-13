# @semantik-tech/adapters-shared

Shared types and helpers for platform adapters (Task 04).

## Exports

- `PlatformAdapter` — parse/render contract for Cursor, Claude, Gemini
- `NativePaths` / `NativePathsContent` — documented global config paths per platform × OS
- `WritePlan` — declarative file writes for the desktop agent (task 07)
- `buildProxyUrl` — org MCP proxy URL builder (cloud gateway + local proxy modes)
- `applyProxyToFragments` — rewrite HTTP/SSE fragments to proxy URLs when `proxy !== false`

## Pure adapter contract

Production adapter modules do **not** read the filesystem. Callers (desktop agent or tests) inject:

- `NativePathsContent.mcpConfig` — parsed native JSON
- `NativePathsContent.installedSkillSlugs` — skill directories for inventory

## Proxy URL rendering

| `proxyMode` | MCP client URL |
|-------------|----------------|
| `cloud_gateway` | `{gatewayBaseUrl}/{mcpServerId}` (default base: `https://mcp.{orgSlug}.example.com`) |
| `local_proxy` | `http://127.0.0.1:{localProxyPort}/{mcpServerId}` (default port: 8765) |

Stdio transports are never proxied. Set `proxy: false` on a fragment to preserve a direct URL.

## SkillPacks

- `materializeSkillPackWritePlan` — emits `WritePlan` file entries under `{skillsRoot}/{slug}/`
- `listInstalledSkillPacks` — maps injected slugs to absolute paths

See [skill-pack-lifecycle.md](../../docs/skills/skill-pack-lifecycle.md).

## Spike code

Task 00 spike implementations remain under `spike/` for reference; production code is in `src/`.
