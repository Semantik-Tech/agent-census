# @semantik-tech/adapters-gemini-cli

Pure adapter for the **Gemini CLI** Client Target's `settings.json` MCP block and SkillPacks.

Managed paths are `~/.gemini/settings.json` (`mcpServers`) and
`~/.gemini/skills/{slug}/` on macOS, with equivalent `%USERPROFILE%` paths on Windows.

```typescript
import { geminiCliAdapter } from "@semantik-tech/adapters-gemini-cli";
```

Managed MCP fragments always render through the configured sidecar/gateway.
