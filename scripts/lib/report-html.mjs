const escapeHtml = (value) =>
	String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const time = (iso) => new Date(iso).toLocaleTimeString("ja-JP", { hour12: false });
const duration = (ms) => `${Math.floor(ms / 60000)} 分 ${Math.round((ms % 60000) / 1000)} 秒`;
const tokens = (n) => (n >= 1000 ? `${(n / 10000).toFixed(1)} 万` : String(n));
const percent = (ratio) => `${(ratio * 100).toFixed(2)}%`;
const oneLine = (text, max) => {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

function kindOf(label) {
	if (label === "edit") return "edit";
	if (label.startsWith("/") || label.startsWith("skill ") || label.startsWith("read ")) return "skill";
	if (label.startsWith("plugin_figma") || label.includes("figma__")) return "mcp";
	if (label.startsWith("design-flow")) return "flow";
	if (label === "figma-diff" || label.startsWith("design-image")) return "measure";
	return "check";
}

const KIND_NAMES = {
	skill: "スキル",
	mcp: "Figma MCP",
	flow: "design-flow",
	measure: "測定",
	edit: "編集",
	check: "検証・コミット",
};

function diffCell(session) {
	if (session.diffRuns.length === 0) return `<span class="muted">記録なし</span>`;
	const chips = session.diffRuns.map(
		(run, i) =>
			`<span class="chip${i === session.diffRuns.length - 1 ? (run.pass ? " pass" : " fail") : ""}">${percent(run.diffRatio)}</span>`,
	);
	return chips.join(`<span class="arrow">→</span>`);
}

function verdictCell(session) {
	const last = session.diffRuns.at(-1);
	if (!last) return `<span class="muted">記録なし</span>`;
	const label = last.pass ? "合格" : "不合格";
	return `<span class="badge ${last.pass ? "pass" : "fail"}">${label}</span> 調整 ${session.diffRuns.length - 1} 回`;
}

function summaryTable(sessions) {
	const rows = [
		["完了までの時間", "返答を待っていた時間は含めない", (s) => duration(s.activeMs)],
		[
			"最初の依頼のあとの入力",
			"",
			(s) => {
				const later = s.turns.slice(1);
				const prompts = later.filter((t) => t.kind === "prompt").length;
				return `${later.length} 回 <span class="muted">（プロンプト ${prompts}、コマンド ${later.length - prompts}）</span>`;
			},
		],
		["トークンの合計", "本体と advisor の合計。キャッシュから読んだ分を含む", (s) => tokens(s.tokens.total)],
		[
			"新しく読んだ入力 / 出力",
			"",
			(s) => `${tokens(s.tokens.main.input + s.tokens.main.cacheCreation)} / ${tokens(s.tokens.main.output)}`,
		],
		["キャッシュから読んだ入力", "", (s) => tokens(s.tokens.main.cacheRead)],
		[
			"advisor",
			"",
			(s) =>
				s.tokens.advisor.calls === 0
					? `<span class="muted">なし</span>`
					: `${s.tokens.advisor.calls} 回 <span class="muted">（入力 ${tokens(s.tokens.advisor.input)} / 出力 ${tokens(s.tokens.advisor.output)}）</span>`,
		],
		["差分率の推移", "", diffCell],
		["最後の判定", "", verdictCell],
	];
	const head = sessions.map((s) => `<th>${escapeHtml(s.name)}</th>`).join("");
	const body = rows
		.map(
			([label, note, cell]) =>
				`<tr><th scope="row">${label}${note ? `<small>${note}</small>` : ""}</th>${sessions.map((s) => `<td>${cell(s)}</td>`).join("")}</tr>`,
		)
		.join("\n");
	return `<table class="summary"><thead><tr><th></th>${head}</tr></thead><tbody>\n${body}\n</tbody></table>`;
}

function crossAccessSection(sessions) {
	if (sessions.length < 2) return "";
	const hits = sessions.flatMap((s) => s.crossAccess.map((hit) => ({ ...hit, name: s.name })));
	const body =
		hits.length === 0
			? `<p class="muted">なし</p>`
			: `<div class="warn"><ul>${hits
					.map(
						(hit) =>
							`<li><b>${escapeHtml(hit.name)}</b> <span class="time">${time(hit.at)}</span> ${escapeHtml(hit.tool)}<code>${escapeHtml(oneLine(hit.input, 160))}</code></li>`,
					)
					.join("")}</ul></div>`;
	return `<section><h2>ほかの worktree を読んだ記録</h2>${body}</section>`;
}

function turnsSection(sessions) {
	const blocks = sessions.map((s) => {
		const later = s.turns.slice(1);
		const items =
			later.length === 0
				? `<li class="muted">なし</li>`
				: later
						.map((turn) => {
							const body = turn.kind === "command" ? `/${turn.command} ${turn.text}`.trim() : turn.text;
							const kind = turn.kind === "command" ? `<span class="tag">コマンド</span>` : "";
							return `<li><span class="time">${time(turn.at)}</span>${kind}${escapeHtml(oneLine(body, 200))}</li>`;
						})
						.join("");
		const title = sessions.length > 1 ? `<h3>${escapeHtml(s.name)}</h3>` : "";
		return `${title}<ul class="turns">${items}</ul>`;
	});
	return `<section><h2>最初の依頼のあとの入力</h2>${blocks.join("")}</section>`;
}

function timelineSection(sessions) {
	const legend = Object.entries(KIND_NAMES)
		.map(([kind, name]) => `<span class="legend"><i class="dot ${kind}"></i>${name}</span>`)
		.join("");
	const blocks = sessions.map((s) => {
		const rows = s.timeline
			.map((event) => {
				const at = event.count > 1 && event.until !== event.at ? `${time(event.at)}–${time(event.until)}` : time(event.at);
				const label = event.label === "edit" ? "ファイルの編集" : `<code>${escapeHtml(event.label)}</code>`;
				const count = event.count > 1 ? ` <span class="muted">×${event.count}</span>` : "";
				return `<tr><td class="time">${at}</td><td><i class="dot ${kindOf(event.label)}"></i>${label}${count}</td></tr>`;
			})
			.join("\n");
		const title = sessions.length > 1 ? `<h3>${escapeHtml(s.name)}</h3>` : "";
		return `<div>${title}<table class="timeline"><tbody>\n${rows}\n</tbody></table></div>`;
	});
	return `<section><h2>ツールが使われたタイミング</h2><p>${legend}</p><div class="cols">${blocks.join("")}</div></section>`;
}

const STYLE = `
:root{--bg:#fff;--fg:#1f2328;--muted:#656d76;--line:#d8dee4;--soft:#f6f8fa;--pass:#1a7f37;--pass-bg:#dafbe1;--fail:#cf222e;--fail-bg:#ffebe9;--warn-bg:#fff8c5;--warn-line:#d4a72c}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#8d96a0;--line:#30363d;--soft:#161b22;--pass:#3fb950;--pass-bg:#12261e;--fail:#f85149;--fail-bg:#25171c;--warn-bg:#272115;--warn-line:#9e6a03}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif}
main{max-width:1040px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:22px;margin:0 0 4px}
h2{font-size:17px;margin:40px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--line)}
h3{font-size:14px;margin:16px 0 8px;color:var(--muted)}
.muted,small{color:var(--muted)}
small{display:block;font-weight:400;font-size:12px}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;vertical-align:top;padding:8px 12px;border-bottom:1px solid var(--line)}
.summary thead th{font-size:13px;color:var(--muted);font-weight:600}
.summary tbody th{width:30%;font-weight:600}
.summary td{font-variant-numeric:tabular-nums}
.chip{display:inline-block;padding:0 6px;border-radius:4px;background:var(--soft);font-variant-numeric:tabular-nums}
.chip.pass{background:var(--pass-bg);color:var(--pass);font-weight:600}
.chip.fail{background:var(--fail-bg);color:var(--fail);font-weight:600}
.arrow{color:var(--muted);margin:0 4px}
.badge{display:inline-block;padding:0 8px;border-radius:999px;font-size:13px;font-weight:600}
.badge.pass{background:var(--pass-bg);color:var(--pass)}
.badge.fail{background:var(--fail-bg);color:var(--fail)}
.warn{background:var(--warn-bg);border-left:3px solid var(--warn-line);padding:8px 16px;border-radius:4px}
.warn ul{margin:0;padding-left:16px}
.warn code{display:block;margin-top:2px}
code{font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}
.time{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);white-space:nowrap;margin-right:8px}
.turns{list-style:none;padding:0;margin:0}
.turns li{padding:6px 0;border-bottom:1px solid var(--line)}
.tag{font-size:11px;border:1px solid var(--line);border-radius:4px;padding:0 4px;margin-right:6px}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}
.timeline td{padding:4px 8px;vertical-align:middle}
.timeline td.time{width:1%}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px;vertical-align:middle}
.dot.skill{background:#8250df}.dot.mcp{background:#bf3989}.dot.flow{background:#0969da}.dot.measure{background:#1a7f37}.dot.edit{background:#9a6700}.dot.check{background:#6e7781}
.legend{margin-right:16px;font-size:13px;color:var(--muted);white-space:nowrap}
.logs{margin-top:40px;font-size:12px;color:var(--muted)}
.logs code{display:block}
@media (max-width:600px){.summary tbody th{width:auto}th,td{padding:6px 8px}}
`;

export function renderHtml(sessions, { generatedAt = new Date() } = {}) {
	const names = sessions.map((s) => s.name).join(" / ");
	return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ハーネスの報告: ${escapeHtml(names)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>ハーネスの報告</h1>
<p class="muted">${escapeHtml(names)} ・ ${generatedAt.toLocaleString("ja-JP")} に集計</p>
${summaryTable(sessions)}
${crossAccessSection(sessions)}
${turnsSection(sessions)}
${timelineSection(sessions)}
<div class="logs">集計に使ったログ${sessions.map((s) => `<code>${escapeHtml(s.logPath)}</code>`).join("")}</div>
</main>
</body>
</html>
`;
}
