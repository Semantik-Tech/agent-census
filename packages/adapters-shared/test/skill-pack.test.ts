import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  listInstalledSkillPacks,
  materializeSkillPackWritePlan,
  nativePaths,
  type ExtractedSkillPack,
} from "../src/index.js";
import { DEMO_PACK_ROOT, loadSkillPackDir } from "./helpers.js";

test("listInstalledSkillPacks maps slugs to paths", () => {
  const paths = {
    ...nativePaths("cursor", "macos"),
    installedSkillSlugs: ["demo-pack", "pr-review"],
  };
  const installed = listInstalledSkillPacks(paths);
  assert.equal(installed.length, 2);
  assert.equal(installed[0].slug, "demo-pack");
  assert.ok(installed[0].path.endsWith(join(".cursor", "skills", "demo-pack")));
});

test("materializeSkillPackWritePlan emits demo-pack tree", async () => {
  const files = await loadSkillPackDir(DEMO_PACK_ROOT);
  const pack: ExtractedSkillPack = {
    slug: "demo-pack",
    skillPackId: "demo-pack",
    version: 1,
    files,
  };
  const paths = nativePaths("cursor", "macos");
  const plan = materializeSkillPackWritePlan(paths, pack, {
    proxyMode: "cloud_gateway",
    orgSlug: "acme",
  });

  assert.ok(plan.files.some((f) => f.path.endsWith("SKILL.md")));
  assert.ok(plan.files.some((f) => f.path.includes("templates/example.md")));
  assert.ok(plan.files.some((f) => f.path.includes("scripts/noop.sh")));
  assert.equal(plan.files.every((f) => f.strategy === "replace"), true);
});
