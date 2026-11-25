// Writes docs/INTEGRATIONS.md from packages/core/src/capabilities.ts.
// Run: npm run docs:status   (a test fails if the file is out of date)
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderIntegrationsDoc } from "../packages/core/src/capabilities.ts";

const out = fileURLToPath(new URL("../docs/INTEGRATIONS.md", import.meta.url));
writeFileSync(out, renderIntegrationsDoc());
console.log("wrote docs/INTEGRATIONS.md");
