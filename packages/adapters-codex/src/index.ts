import {
  applyProxyToFragments,
  listInstalledSkillPacks,
  materializeSkillPackWritePlan,
  nativePaths,
  resolveTargetOs,
  type ClientTargetAdapter,
  type ExtractedSkillPack,
  type McpServerFragment,
  type NativePathsContent,
  type RenderContext,
  type WritePlan,
} from "@semantik-tech/adapters-shared";
import { parseCodexConfig } from "./parse.js";
import { patchCodexConfigToml } from "./render.js";

export const codexAdapter: ClientTargetAdapter = {
  clientTarget: "codex",

  parseMcpServers(paths: NativePathsContent): McpServerFragment[] {
    return parseCodexConfig((paths.mcpConfig ?? {}) as Record<string, unknown>);
  },

  listInstalledSkillPacks(paths: NativePathsContent) {
    return listInstalledSkillPacks(paths);
  },

  renderMcpServers(fragments: McpServerFragment[], ctx: RenderContext): WritePlan {
    const paths = nativePaths("codex", resolveTargetOs(ctx));
    const existing =
      typeof ctx.existingConfig === "string" ? ctx.existingConfig : "";
    const rendered = patchCodexConfigToml(existing, applyProxyToFragments(fragments, ctx));
    return {
      files: [
        {
          path: paths.mcpConfigFile,
          content: rendered,
          strategy: "replace",
          backup: true,
        },
      ],
    };
  },

  materializeSkillPack(pack: ExtractedSkillPack, ctx: RenderContext): WritePlan {
    return materializeSkillPackWritePlan(nativePaths("codex", resolveTargetOs(ctx)), pack, ctx);
  },
};

export { parseCodexConfig, parseCodexMcpServers } from "./parse.js";
export { patchCodexConfigToml, renderCodexMcpServersToml } from "./render.js";
