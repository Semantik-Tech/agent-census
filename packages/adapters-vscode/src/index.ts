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
import { parseVscodeMcp } from "./parse.js";
import { renderVscodeMcp } from "./render.js";

export const vscodeAdapter: ClientTargetAdapter = {
  clientTarget: "vscode",

  parseMcpServers(paths: NativePathsContent): McpServerFragment[] {
    const doc = (paths.mcpConfig ?? {}) as { servers?: Record<string, unknown> };
    return parseVscodeMcp(doc);
  },

  listInstalledSkillPacks(paths: NativePathsContent) {
    return listInstalledSkillPacks(paths);
  },

  renderMcpServers(fragments: McpServerFragment[], ctx: RenderContext): WritePlan {
    const paths = nativePaths("vscode", resolveTargetOs(ctx));
    const proxied = applyProxyToFragments(fragments, ctx);
    const rendered = renderVscodeMcp(proxied);
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
    return materializeSkillPackWritePlan(nativePaths("vscode", resolveTargetOs(ctx)), pack, ctx);
  },
};

export { parseVscodeMcp } from "./parse.js";
export { renderVscodeMcp } from "./render.js";
