export const FLOW_VERSION = 1;

export class FlowError extends Error {}

const GUIDES = {
	read: "SKILL.md の「画像の読み取り」",
	implement: "SKILL.md の「実装」",
	fix: "SKILL.md の「エラーの修正」",
	adjust: "SKILL.md の「調整」",
	revert: "SKILL.md の「調整を戻す」",
	review: "SKILL.md の「自己レビュー」",
	report: "SKILL.md の「報告」",
};

const ENGINE_COMMANDS = {
	verify: "design-flow verify",
	measure: "design-flow measure",
};

function withEvent(state, step, event, now, detail = {}) {
	return { ...state, history: [...state.history, { step, event, at: now, ...detail }] };
}

function bestAttempt(attempts) {
	return attempts.reduce((best, a) => (best === null || a.diffRatio < best.diffRatio ? a : best), null);
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
	if (step === "done") {
		return { step, owner: "none", message: "フローは終わっています。" };
	}
	if (ENGINE_COMMANDS[step]) {
		return { step, owner: "engine", command: ENGINE_COMMANDS[step] };
	}
	const directive = { step, owner: "llm", guide: GUIDES[step], report: `design-flow report ${step}` };
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
			const best = bestAttempt(state.attempts.slice(0, -1));
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

function expectStep(state, step) {
	if (state.step !== step) {
		throw new FlowError(`いまの手順は ${state.step} です。${step} は報告できません。design-flow next で次の手順を確かめてください。`);
	}
}

export function applyReport(state, step, { treeHash, notesWritten, now }) {
	expectStep(state, step);
	switch (step) {
		case "read":
			if (!notesWritten) {
				throw new FlowError("読み取り結果のファイルがまだありません。directive の notesPath に書いてから報告してください。");
			}
			return { ...withEvent(state, step, "completed", now), step: "implement" };
		case "implement":
		case "fix":
		case "adjust": {
			if (treeHash === state.lastTreeHash) {
				throw new FlowError("前の手順から作業ツリーが変わっていません。ファイルを変更してから報告してください。");
			}
			const adjustments = step === "adjust" ? state.adjustments + 1 : state.adjustments;
			return { ...withEvent(state, step, "completed", now), step: "verify", adjustments, lastTreeHash: treeHash };
		}
		case "revert": {
			const best = bestAttempt(state.attempts.slice(0, -1));
			if (treeHash !== best.treeHash) {
				throw new FlowError(
					`作業ツリーが ${best.index} 回目の計測時と一致しません。その時点の状態に戻してから報告してください（コミットしたかどうかは問いません）。`,
				);
			}
			return { ...withEvent(state, step, "completed", now, { revertTo: best.index }), step: "adjust", lastTreeHash: treeHash };
		}
		case "review":
			return { ...withEvent(state, step, "completed", now), step: "report" };
		case "report":
			return { ...withEvent(state, step, "completed", now), step: "done" };
		default:
			throw new FlowError(`${step} は報告で進める手順ではありません。`);
	}
}

export function applyVerify(state, results, { now }) {
	expectStep(state, "verify");
	const failures = results.filter((r) => r.exitCode !== 0);
	const next = withEvent(state, "verify", failures.length === 0 ? "passed" : "failed", now, {
		failed: failures.map((f) => f.command),
	});
	return {
		...next,
		verifyRuns: state.verifyRuns + 1,
		lastVerifyFailures: failures,
		step: failures.length === 0 ? "measure" : "fix",
	};
}

export function applyMeasure(state, attempt, { now }) {
	expectStep(state, "measure");
	const recorded = { ...attempt, index: state.attempts.length, adjustments: state.adjustments };
	const attempts = [...state.attempts, recorded];
	const base = { ...withEvent(state, "measure", "measured", now, { diffRatio: attempt.diffRatio, pass: attempt.pass }), attempts };

	if (attempt.pass) return { ...base, step: "review" };
	if (state.adjustments >= state.config.maxAdjust) return { ...base, step: "review", gaveUp: true };
	const previousBest = bestAttempt(state.attempts);
	if (previousBest && attempt.diffRatio >= previousBest.diffRatio) return { ...base, step: "revert" };
	return { ...base, step: "adjust" };
}
