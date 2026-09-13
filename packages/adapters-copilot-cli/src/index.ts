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
import { parseCopilotMcpConfig } from "./parse.js";
import { renderCopilotMcpConfig } from "./render.js";

export const copilotCliAdapter: ClientTargetAdapter = {
  clientTarget: "copilot-cli",

  parseMcpServers(paths: NativePathsContent): McpServerFragment[] {
    return parseCopilotMcpConfig((paths.mcpConfig ?? {}) as Record<string, unknown>);
  },

  listInstalledSkillPacks(paths: NativePathsContent) {
    return listInstalledSkillPacks(paths);
  },

  renderMcpServers(fragments: McpServerFragment[], ctx: RenderContext): WritePlan {
    const paths = nativePaths("copilot-cli", resolveTargetOs(ctx));
    const rendered = renderCopilotMcpConfig(applyProxyToFragments(fragments, ctx));
    return {
      files: [
        {
          path: paths.mcpConfigFile,
          content: stableStringify(rendered),
          strategy: "replace",
          backup: true,
        },
      ],
    };
  },

  materializeSkillPack(pack: ExtractedSkillPack, ctx: RenderContext): WritePlan {
    return materializeSkillPackWritePlan(
      nativePaths("copilot-cli", resolveTargetOs(ctx)),
      pack,
      ctx,
    );
  },
};

export { parseCopilotMcpConfig, parseCopilotMcpServers } from "./parse.js";
export { renderCopilotMcpConfig, renderCopilotMcpServers } from "./render.js";
