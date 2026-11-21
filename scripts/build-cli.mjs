import { build } from "esbuild";

await build({
  entryPoints: ["packages/cli/src/index.ts"],
  outfile: "packages/cli/dist/riptide.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  tsconfig: "tsconfig.json",
  banner: { js: "#!/usr/bin/env node" },
  legalComments: "none",
  logLevel: "info",
});
