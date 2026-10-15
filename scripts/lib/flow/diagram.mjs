import { GUARDS, STEPS, TRANSITIONS } from "./machine.mjs";

const OWNER_LABELS = { llm: "LLM", engine: "エンジン", none: "-" };

function edgeLabel({ on, guard }) {
	return guard ? `${on} [${GUARDS[guard].label}]` : on;
}

export function renderMermaid() {
	const lines = ["stateDiagram-v2"];
	for (const [step, { owner, label }] of Object.entries(STEPS)) {
		lines.push(`    state "${label}（${OWNER_LABELS[owner]}）" as ${step}`);
	}
	lines.push("    [*] --> read: start");
	for (const t of TRANSITIONS) {
		lines.push(`    ${t.from} --> ${t.to}: ${edgeLabel(t)}`);
	}
	lines.push("    done --> [*]");
	return lines.join("\n");
}

export function renderFlowDoc() {
	const stepRows = Object.entries(STEPS).map(
		([step, { owner, label, command }]) => `| \`${step}\` | ${label} | ${OWNER_LABELS[owner]} | ${command ? `\`${command}\`` : owner === "llm" ? `\`design-flow report ${step}\`` : "-"} |`,
	);
	const transitionRows = TRANSITIONS.map(
		(t) => `| \`${t.from}\` | \`${t.on}\` | ${t.guard ? GUARDS[t.guard].label : "-"} | \`${t.to}\` |`,
	);
	return `# design-flow の状態遷移

このファイルは \`pnpm docs:flow\` で \`scripts/lib/flow/machine.mjs\` の遷移表から生成している。手で書き換えず、遷移表を直してから生成し直す。

\`\`\`mermaid
${renderMermaid()}
\`\`\`

## 手順

| 手順 | 内容 | 担当 | 終えるときのコマンド |
| --- | --- | --- | --- |
${stepRows.join("\n")}

## 遷移

同じ手順・同じ入力の行は、上の行の条件から順に見て、最初に当てはまった行の行き先へ進む。\`report\` で条件に当てはまらないときは、報告を拒否して手順は進まない。

| 手順 | 入力 | 条件 | 行き先 |
| --- | --- | --- | --- |
${transitionRows.join("\n")}
`;
}
