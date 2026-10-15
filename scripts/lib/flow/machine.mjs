export const FLOW_VERSION = 1;

export class FlowError extends Error {}

export const STEPS = {
	read: { owner: "llm", label: "画像の読み取り" },
	implement: { owner: "llm", label: "実装" },
	verify: { owner: "engine", label: "検証", command: "design-flow verify" },
	fix: { owner: "llm", label: "エラーの修正" },
	measure: { owner: "engine", label: "差分の計測", command: "design-flow measure" },
	adjust: { owner: "llm", label: "調整" },
	revert: { owner: "llm", label: "調整を戻す" },
	review: { owner: "llm", label: "自己レビュー" },
	report: { owner: "llm", label: "報告" },
	done: { owner: "none", label: "完了" },
};

function bestAttempt(attempts) {
	return attempts.reduce((best, a) => (best === null || a.diffRatio < best.diffRatio ? a : best), null);
}

function bestBeforeLatest(state) {
	return bestAttempt(state.attempts.slice(0, -1));
}

export const GUARDS = {
	notesWritten: {
		label: "読み取り結果を書いた",
		test: (c) => c.notesWritten,
		rejection: () => "読み取り結果のファイルがまだありません。directive の notesPath に書いてから報告してください。",
	},
	treeChanged: {
		label: "ファイルが変わった",
		test: (c) => c.treeHash !== c.state.lastTreeHash,
		rejection: () => "前の手順から作業ツリーが変わっていません。ファイルを変更してから報告してください。",
	},
	revertedToBest: {
		label: "一番良かった計測時と中身が同じ",
		test: (c) => c.treeHash === bestBeforeLatest(c.state).treeHash,
		rejection: (c) =>
			`作業ツリーが ${bestBeforeLatest(c.state).index} 回目の計測時と一致しません。その時点の状態に戻してから報告してください（コミットしたかどうかは問いません）。`,
	},
	allPassed: { label: "すべて成功", test: (c) => c.failures.length === 0 },
	anyFailed: { label: "失敗あり", test: (c) => c.failures.length > 0 },
	passed: { label: "合格", test: (c) => c.attempt.pass },
	limitReached: { label: "調整が上限の回数に達した", test: (c) => c.state.adjustments >= c.state.config.maxAdjust },
	notImproved: {
		label: "それまでの最良より減っていない",
		test: (c) => {
			const best = bestAttempt(c.state.attempts);
			return best !== null && c.attempt.diffRatio >= best.diffRatio;
		},
	},
	otherwise: { label: "それ以外", test: () => true },
};

// 同じ from と on の行は上ほど優先される。並べ替えると判定が変わる
export const TRANSITIONS = [
	{ from: "read", on: "report", guard: "notesWritten", to: "implement" },
	{ from: "implement", on: "report", guard: "treeChanged", to: "verify" },
	{ from: "fix", on: "report", guard: "treeChanged", to: "verify" },
	{ from: "adjust", on: "report", guard: "treeChanged", to: "verify" },
	{ from: "revert", on: "report", guard: "revertedToBest", to: "adjust" },
	{ from: "review", on: "report", to: "report" },
	{ from: "report", on: "report", to: "done" },
	{ from: "verify", on: "verify", guard: "allPassed", to: "measure" },
	{ from: "verify", on: "verify", guard: "anyFailed", to: "fix" },
	{ from: "measure", on: "measure", guard: "passed", to: "review" },
	{ from: "measure", on: "measure", guard: "limitReached", to: "review" },
	{ from: "measure", on: "measure", guard: "notImproved", to: "revert" },
	{ from: "measure", on: "measure", guard: "otherwise", to: "adjust" },
];

function transition(on, context) {
	const { state } = context;
	const candidates = TRANSITIONS.filter((t) => t.from === state.step && t.on === on);
	if (candidates.length === 0) {
		throw new FlowError(`いまの手順は ${state.step} です。${on} では進められません。design-flow next で次の手順を確かめてください。`);
	}
	const matched = candidates.find((t) => !t.guard || GUARDS[t.guard].test(context));
	if (!matched) throw new FlowError(GUARDS[candidates[0].guard].rejection(context));
	return matched;
}

function withEvent(state, step, event, now, detail = {}) {
	return { ...state, history: [...state.history, { step, event, at: now, ...detail }] };
}

export function createState(config, { treeHash, now }) {
	return {
		version: FLOW_VERSION,
		config,
		step: "read",
		adjustments: 0,
		gaveUp: false,
		baselineTreeHash: treeHash,
		lastTreeHash: treeHash,
		attempts: [],
		verifyRuns: 0,
		lastVerifyFailures: [],
		history: [{ step: "start", event: "started", at: now }],
	};
}

export function nextDirective(state, paths) {
	const { step } = state;
	const { owner, label, command } = STEPS[step];
	if (owner === "none") return { step, owner, message: "フローは終わっています。" };
	if (owner === "engine") return { step, owner, command };

	const directive = { step, owner, guide: `SKILL.md の「${label}」`, report: `design-flow report ${step}` };
	const latest = state.attempts.at(-1);
	switch (step) {
		case "read":
			directive.context = { image: state.config.figma, notesPath: paths.notes };
			break;
		case "fix":
			directive.context = { failures: state.lastVerifyFailures };
			break;
		case "adjust":
			directive.context = {
				adjustment: state.adjustments + 1,
				maxAdjust: state.config.maxAdjust,
				diffRatios: state.attempts.map((a) => a.diffRatio),
				summaryPath: latest.summaryPath,
				comparePath: latest.comparePath,
			};
			break;
		case "revert": {
			const best = bestBeforeLatest(state);
			directive.context = {
				reason: `調整後の diffRatio ${latest.diffRatio} が、それまでの最良 ${best.diffRatio}（${best.index} 回目の計測）より良くなっていません。`,
				revertTo: best.index,
			};
			break;
		}
		case "report":
			directive.context = {
				diffRatios: state.attempts.map((a) => a.diffRatio),
				pass: latest?.pass ?? false,
				gaveUp: state.gaveUp,
				comparePath: latest?.comparePath,
			};
			break;
	}
	return directive;
}

export function applyReport(state, step, { treeHash, notesWritten, now }) {
	if (state.step !== step) {
		throw new FlowError(`いまの手順は ${state.step} です。${step} は報告できません。design-flow next で次の手順を確かめてください。`);
	}
	const t = transition("report", { state, treeHash, notesWritten });
	const next = { ...withEvent(state, step, "completed", now), step: t.to };
	if (t.guard === "treeChanged" || t.guard === "revertedToBest") next.lastTreeHash = treeHash;
	if (step === "adjust") next.adjustments = state.adjustments + 1;
	return next;
}

export function applyVerify(state, results, { now }) {
	const failures = results.filter((r) => r.exitCode !== 0);
	const t = transition("verify", { state, failures });
	return {
		...withEvent(state, "verify", t.guard === "allPassed" ? "passed" : "failed", now, { failed: failures.map((f) => f.command) }),
		verifyRuns: state.verifyRuns + 1,
		lastVerifyFailures: failures,
		step: t.to,
	};
}

export function applyMeasure(state, attempt, { now }) {
	const t = transition("measure", { state, attempt });
	const recorded = { ...attempt, index: state.attempts.length, adjustments: state.adjustments };
	return {
		...withEvent(state, "measure", "measured", now, { diffRatio: attempt.diffRatio, pass: attempt.pass }),
		attempts: [...state.attempts, recorded],
		step: t.to,
		gaveUp: t.guard === "limitReached",
	};
}
