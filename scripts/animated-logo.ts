// Writes the animated README logos (dark and light GitHub themes).
// Usage: node --import tsx scripts/animated-logo.ts
import { writeFileSync } from "node:fs";
import { animatedLogoSvg } from "../apps/studio/src/lib/animatedLogo";

writeFileSync("brand/logo-animated-dark.svg", animatedLogoSvg({ ink: "#F4E9DC", delay: 0.3 }) + "\n");
writeFileSync("brand/logo-animated-light.svg", animatedLogoSvg({ ink: "#130F26", delay: 0.3 }) + "\n");
console.log("  brand/logo-animated-dark.svg\n  brand/logo-animated-light.svg");
