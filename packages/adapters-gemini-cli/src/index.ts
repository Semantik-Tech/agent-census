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
import { parseGeminiSettings } from "./parse.js";
import { renderGeminiSettings } from "./render.js";

export const geminiCliAdapter: ClientTargetAdapter = {
  clientTarget: "gemini-cli",

  parseMcpServers(paths: NativePathsContent): McpServerFragment[] {
    return parseGeminiSettings((paths.mcpConfig ?? {}) as Record<string, unknown>);
  },

  listInstalledSkillPacks(paths: NativePathsContent) {
    return listInstalledSkillPacks(paths);
  },

  renderMcpServers(fragments: McpServerFragment[], ctx: RenderContext): WritePlan {
    const paths = nativePaths("gemini-cli", resolveTargetOs(ctx));
    const existing = (ctx.existingConfig ?? {}) as Record<string, unknown>;
    const rendered = renderGeminiSettings(existing, applyProxyToFragments(fragments, ctx));
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
      nativePaths("gemini-cli", resolveTargetOs(ctx)),
      pack,
      ctx,
    );
  },
};

export { parseGeminiSettings } from "./parse.js";
export { renderGeminiSettings } from "./render.js";
