import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderFlowDoc } from "./lib/flow/diagram.mjs";

const out = fileURLToPath(new URL("../docs/design-flow.md", import.meta.url));
writeFileSync(out, renderFlowDoc());
console.log(`書き出しました: ${out}`);
