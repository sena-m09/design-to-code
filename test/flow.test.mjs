import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyMeasure, applyReport, applyVerify, createState, nextDirective } from "../scripts/lib/flow/machine.mjs";

const NOW = "2026-10-14T00:00:00.000Z";
const PATHS = { notes: "/p/.figma-diff/flow/reading.md" };
const CONFIG = { figma: "/p/comp.png", url: "http://localhost", selector: "main", width: 375, threshold: 0.02, maxAdjust: 3, tag: "baseline", checks: ["pnpm typecheck"] };

function measured(state, diffRatio, treeHash) {
	return applyMeasure(
		state,
		{ diffRatio, pass: diffRatio <= 0.02, summaryPath: `${treeHash}/summary.json`, comparePath: `${treeHash}/compare.png`, treeHash },
		{ now: NOW },
	);
}

function verified(state) {
	return applyVerify(state, [{ command: "pnpm typecheck", exitCode: 0 }], { now: NOW });
}

function implementedAndMeasured(diffRatio) {
	let state = createState(CONFIG, { treeHash: "t0", now: NOW });
	state = applyReport(state, "read", { notesWritten: true, treeHash: "t0", now: NOW });
	state = applyReport(state, "implement", { treeHash: "t1", now: NOW });
	return measured(verified(state), diffRatio, "t1");
}

function adjustedAndMeasured(state, diffRatio, treeHash) {
	return measured(verified(applyReport(state, "adjust", { treeHash, now: NOW })), diffRatio, treeHash);
}

describe("画像の読み取りと実装", () => {
	test("読み取り結果のファイルが無いうちは、読み取りを終えたと報告できない", () => {
		const state = createState(CONFIG, { treeHash: "t0", now: NOW });
		assert.throws(() => applyReport(state, "read", { notesWritten: false, treeHash: "t0", now: NOW }), /読み取り結果/);
		assert.equal(applyReport(state, "read", { notesWritten: true, treeHash: "t0", now: NOW }).step, "implement");
	});

	test("ファイルを変えずに実装を報告しても受け付けず、変えていれば検証に進む", () => {
		const state = applyReport(createState(CONFIG, { treeHash: "t0", now: NOW }), "read", { notesWritten: true, treeHash: "t0", now: NOW });
		assert.throws(() => applyReport(state, "implement", { treeHash: "t0", now: NOW }), /変わっていません/);
		assert.equal(applyReport(state, "implement", { treeHash: "t1", now: NOW }).step, "verify");
	});

	test("いまの手順と違う手順は報告できない", () => {
		const state = createState(CONFIG, { treeHash: "t0", now: NOW });
		assert.throws(() => applyReport(state, "review", { treeHash: "t0", now: NOW }), /いまの手順は read/);
	});
});

describe("検証", () => {
	test("検証のコマンドが 1 つでも失敗したら、修正の手順になり失敗したコマンドが渡される", () => {
		let state = createState(CONFIG, { treeHash: "t0", now: NOW });
		state = applyReport(state, "read", { notesWritten: true, treeHash: "t0", now: NOW });
		state = applyReport(state, "implement", { treeHash: "t1", now: NOW });
		state = applyVerify(state, [{ command: "pnpm typecheck", exitCode: 2 }], { now: NOW });
		assert.equal(state.step, "fix");
		assert.deepEqual(nextDirective(state, PATHS).context.failures.map((f) => f.command), ["pnpm typecheck"]);
	});
});

describe("差分の判定", () => {
	test("閾値以下になれば、調整せずに自己レビューへ進む", () => {
		assert.equal(implementedAndMeasured(0.01).step, "review");
	});

	test("閾値を超えていれば調整の手順になり、何回目の調整かが渡される", () => {
		const state = implementedAndMeasured(0.3);
		assert.equal(state.step, "adjust");
		assert.equal(nextDirective(state, PATHS).context.adjustment, 1);
	});

	test("調整で差分が減れば、続けて調整する", () => {
		const state = adjustedAndMeasured(implementedAndMeasured(0.3), 0.2, "t2");
		assert.equal(state.step, "adjust");
	});

	test("調整で差分が減らなければ、それまでで一番良かった状態に戻す手順になる", () => {
		const state = adjustedAndMeasured(implementedAndMeasured(0.3), 0.35, "t2");
		assert.equal(state.step, "revert");
		assert.equal(nextDirective(state, PATHS).context.revertTo, 0);
	});

	test("戻したと報告しても一番良かったときの作業ツリーと違えば受け付けず、同じなら次の調整に進む", () => {
		const state = adjustedAndMeasured(implementedAndMeasured(0.3), 0.35, "t2");
		assert.throws(() => applyReport(state, "revert", { treeHash: "t3", now: NOW }), /一致しません/);
		assert.equal(applyReport(state, "revert", { treeHash: "t1", now: NOW }).step, "adjust");
	});

	test("調整が上限の回数に達したら、合格していなくても打ち切って自己レビューへ進む", () => {
		let state = implementedAndMeasured(0.3);
		state = adjustedAndMeasured(state, 0.25, "t2");
		state = adjustedAndMeasured(state, 0.2, "t3");
		state = adjustedAndMeasured(state, 0.15, "t4");
		assert.equal(state.step, "review");
		assert.equal(state.gaveUp, true);
		assert.deepEqual(state.attempts.map((a) => a.adjustments), [0, 1, 2, 3]);
	});

	test("最後の調整で差分が増えたら、一番良かった状態に戻してから打ち切り、報告ではその回の比較画像を示す", () => {
		let state = implementedAndMeasured(0.3);
		state = adjustedAndMeasured(state, 0.25, "t2");
		state = adjustedAndMeasured(state, 0.2, "t3");
		state = adjustedAndMeasured(state, 0.4, "t4");
		assert.equal(state.step, "revert");
		assert.equal(state.gaveUp, true);

		state = applyReport(state, "revert", { treeHash: "t3", now: NOW });
		assert.equal(state.step, "review");

		state = applyReport(state, "review", { treeHash: "t3", now: NOW });
		assert.deepEqual(nextDirective(state, PATHS).context, {
			diffRatios: [0.3, 0.25, 0.2, 0.4],
			pass: false,
			gaveUp: true,
			comparePath: "t3/compare.png",
		});
	});
});
