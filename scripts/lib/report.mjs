export const SUMMARY_VERSION = 1;

const MAX_CONSOLE_CLUSTERS = 5;

export function formatConsoleReport(summary, outDir) {
	const { pass, diffRatio, diffRatioThreshold, diffClustersCssPx: clusters, deviceScaleFactor } = summary;
	const lines = [
		`${pass ? "PASS" : "FAIL"} diffRatio=${(diffRatio * 100).toFixed(2)}% (threshold=${(diffRatioThreshold * 100).toFixed(2)}%)`,
	];
	if (!pass) {
		if (clusters.length > 0) {
			lines.push("差分クラスタ（CSS px 概算、差分量の大きい順）:");
			clusters.slice(0, MAX_CONSOLE_CLUSTERS).forEach((c, i) => {
				lines.push(`  ${i + 1}. x=${c.x} y=${c.y} w=${c.width} h=${c.height} 差分量=${c.diffPixels}`);
			});
			const rest = clusters.length - MAX_CONSOLE_CLUSTERS;
			if (rest > 0) lines.push(`  …他 ${rest} 件（summary.json 参照）`);
		} else {
			lines.push("差分クラスタなし（ノイズ級の微小差分が散在）。compare.png で全体を確認する");
		}
		lines.push(
			`画像確認はまず compare.png（figma | actual | diff の縮小横並び）、詰めの確認のみ原寸 3 枚を読む（原寸画像上の座標はクラスタ座標の ${deviceScaleFactor} 倍）`,
		);
	}
	lines.push(`出力先: ${outDir}`);
	return lines;
}
