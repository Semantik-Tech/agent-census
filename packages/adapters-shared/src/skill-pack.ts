import { join } from "node:path";
import type {
  ExtractedSkillPack,
  InstalledSkillPack,
  NativePathsContent,
  RenderContext,
  WritePlan,
} from "./types.js";

export function listInstalledSkillPacks(paths: NativePathsContent): InstalledSkillPack[] {
  const slugs = paths.installedSkillSlugs ?? [];
  return slugs.map((slug) => ({
    slug,
    path: join(paths.skillsRoot, slug),
  }));
}

export function materializeSkillPackWritePlan(
  paths: NativePathsContent,
  pack: ExtractedSkillPack,
  _ctx: RenderContext,
): WritePlan {
  const destRoot = join(paths.skillsRoot, pack.slug);
  const files = Object.entries(pack.files).map(([rel, content]) => ({
    path: join(destRoot, rel),
    content,
    strategy: "replace" as const,
    backup: false,
  }));
  return { files };
}
