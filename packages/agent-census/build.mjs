// Bundles src/cli.ts into a single dist/cli.js with every workspace and npm
// dependency inlined, so the published package has no runtime dependencies.
// Licences of inlined third-party packages go to dist/THIRD-PARTY-NOTICES.txt.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const outfile = process.argv[2] ? resolve(process.argv[2]) : resolve(here, "dist/cli.js");
const { version } = JSON.parse(await readFile(resolve(here, "package.json"), "utf8"));

const result = await build({
  entryPoints: [resolve(here, "src/cli.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
  define: { __CLI_VERSION__: JSON.stringify(version) },
  legalComments: "none",
  metafile: true,
  logLevel: "warning",
});

// Workspace packages resolve through symlinks to packages/, so every
// node_modules input here is a genuine third-party dependency.
const packageRoots = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const match = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input);
  if (match) packageRoots.add(resolve(process.cwd(), match[1]));
}
const notices = [];
for (const root of [...packageRoots].sort()) {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const licenceFile = (await readdir(root)).find((name) => /^(licen[cs]e|copying)(\.|$)/i.test(name));
  if (!licenceFile) throw new Error(`No licence file for bundled dependency ${pkg.name}`);
  const text = await readFile(join(root, licenceFile), "utf8");
  notices.push(`${pkg.name}@${pkg.version} (${pkg.license})\n\n${text.trim()}\n`);
}
await writeFile(
  join(dirname(outfile), "THIRD-PARTY-NOTICES.txt"),
  `This bundle includes the following third-party software:\n\n${notices.join(`\n${"-".repeat(72)}\n\n`)}`,
);

console.log(`Bundled ${outfile} (${packageRoots.size} third-party packages inlined)`);
