import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderFlowDoc } from "../scripts/lib/flow/diagram.mjs";

test("docs/design-flow.md が、いまの遷移表から生成した内容と一致する（ずれていたら pnpm docs:flow で生成し直す）", () => {
	const committed = readFileSync(new URL("../docs/design-flow.md", import.meta.url), "utf8");
	assert.equal(committed, renderFlowDoc());
});
