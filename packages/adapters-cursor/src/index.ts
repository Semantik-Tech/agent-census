import {
  applyProxyToFragments,
  listInstalledSkillPacks,
  materializeSkillPackWritePlan,
  nativePaths,
  resolveTargetOs,
  stableStringify,
  type ExtractedSkillPack,
  type McpServerFragment,
  type NativePathsContent,
  type ClientTargetAdapter,
  type RenderContext,
  type WritePlan,
} from "@semantik-tech/adapters-shared";
import { parseCursorMcp } from "./parse.js";
import { renderCursorMcp } from "./render.js";

export const cursorAdapter: ClientTargetAdapter = {
  clientTarget: "cursor",

  parseMcpServers(paths: NativePathsContent): McpServerFragment[] {
    const doc = paths.mcpConfig ?? {};
    return parseCursorMcp(doc as { mcpServers?: Record<string, unknown> });
  },

  listInstalledSkillPacks(paths: NativePathsContent) {
    return listInstalledSkillPacks(paths);
  },

  renderMcpServers(fragments: McpServerFragment[], ctx: RenderContext): WritePlan {
    const paths = nativePaths("cursor", resolveTargetOs(ctx));
    const proxied = applyProxyToFragments(fragments, ctx);
    const rendered = renderCursorMcp(proxied);
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
    const paths = nativePaths("cursor", resolveTargetOs(ctx));
    return materializeSkillPackWritePlan(paths, pack, ctx);
  },
};

export { parseCursorMcp } from "./parse.js";
export { renderCursorMcp } from "./render.js";
