import assert from "node:assert/strict";
import { test } from "node:test";
import { renderHtml } from "../scripts/lib/report-html.mjs";

const session = (turnText) => ({
	name: "exp",
	logPath: "/logs/a.jsonl",
	activeMs: 0,
	turns: [
		{ at: "2026-01-01T00:00:00Z", kind: "prompt", text: "実装して" },
		{ at: "2026-01-01T00:01:00Z", kind: "prompt", text: turnText },
	],
	tokens: { main: { input: 0, cacheCreation: 0, cacheRead: 0, output: 0 }, advisor: { calls: 0, input: 0, output: 0 }, total: 0 },
	timeline: [],
	crossAccess: [],
	diffRuns: [],
});

test("プロンプトに含まれるタグは、HTML として解釈されず文字のまま表示される", () => {
	const html = renderHtml([session("<script>alert(1)</script> を直して")]);

	assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt; を直して"));
	assert.ok(!html.includes("<script>alert(1)"));
});
