# @semantik-tech/adapters-cursor

Pure adapter for **Cursor** global MCP config and SkillPacks.

## Native paths (managed mode)

| OS | MCP config | Skills |
|----|------------|--------|
| macOS | `~/.cursor/mcp.json` | `~/.cursor/skills/{slug}/` |
| Windows | `%USERPROFILE%\.cursor\mcp.json` | `%USERPROFILE%\.cursor\skills\{slug}\` |

## Usage

```typescript
import { cursorAdapter } from "@semantik-tech/adapters-cursor";

const fragments = cursorAdapter.parseMcpServers({
  ...nativePaths("cursor", "macos"),
  mcpConfig: JSON.parse(existingFile),
});

const plan = cursorAdapter.renderMcpServers(fragments, {
  proxyMode: "cloud_gateway",
  orgSlug: "acme-dev",
  gatewayBaseUrl: "https://mcp.acme-dev.example.com",
  targetOs: "macos",
});
```

## Transport mapping

| Manifest | Cursor `mcp.json` |
|----------|-------------------|
| stdio | `command`, `args`, `env` |
| http / sse | `url`, optional `headers` |

## Lossy fields

| Native field | Notes |
|--------------|-------|
| `cwd`, `envFile` | Preserved in `nativeExtras` on parse; round-trips when present |
| `auth` (OAuth) | Preserved in `nativeExtras` if present in source config |

Project-level `.cursor/mcp.json` is **not** written in managed mode (ADR-0001).

## Tests

Golden fixtures: `fixtures/config-samples/cursor/{macos,windows}/mcp.json`

```bash
npm test
```
