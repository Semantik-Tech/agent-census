import {
  applyProxyToFragments,
  listInstalledSkillPacks,
  materializeSkillPackWritePlan,
  nativePaths,
  resolveTargetOs,
  stableStringify,
  type ClientTargetAdapter,
  type ExtractedSkillPack,
  type McpServerFragment,
  type NativePathsContent,
  type RenderContext,
  type WritePlan,
} from "@semantik-tech/adapters-shared";
import { parseClaudeJsonRoot } from "./parse.js";
import { renderClaudeJsonManaged } from "./render.js";

export const claudeCodeAdapter: ClientTargetAdapter = {
  clientTarget: "claude-code",

  parseMcpServers(paths: NativePathsContent): McpServerFragment[] {
    const doc = (paths.mcpConfig ?? {}) as Record<string, unknown>;
    return parseClaudeJsonRoot(doc);
  },

  listInstalledSkillPacks(paths: NativePathsContent) {
    return listInstalledSkillPacks(paths);
  },

  renderMcpServers(fragments: McpServerFragment[], ctx: RenderContext): WritePlan {
    const paths = nativePaths("claude-code", resolveTargetOs(ctx));
    const existing = (ctx.existingConfig ?? {}) as Record<string, unknown>;
    const rendered = renderClaudeJsonManaged(existing, applyProxyToFragments(fragments, ctx));
    return {
      files: [
        {
          path: paths.mcpConfigFile,
          content: stableStringify(rendered),
          strategy: "json-merge",
          backup: true,
        },
      ],
    };
  },

  materializeSkillPack(pack: ExtractedSkillPack, ctx: RenderContext): WritePlan {
    return materializeSkillPackWritePlan(
      nativePaths("claude-code", resolveTargetOs(ctx)),
      pack,
      ctx,
    );
  },
};

export { parseClaudeJsonRoot, parseClaudeMcpServers } from "./parse.js";
export { renderClaudeJsonManaged, renderClaudeMcpServers } from "./render.js";
