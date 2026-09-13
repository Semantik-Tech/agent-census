# @semantik-tech/adapters-claude-code

Pure adapter for the **Claude Code** Client Target's user-global MCP config and SkillPacks.

Managed paths are `~/.claude.json` (`mcpServers`) and `~/.claude/skills/{slug}/` on macOS,
with equivalent `%USERPROFILE%` paths on Windows.

```typescript
import { claudeCodeAdapter } from "@semantik-tech/adapters-claude-code";
```

Managed MCP fragments always render through the configured sidecar/gateway.
