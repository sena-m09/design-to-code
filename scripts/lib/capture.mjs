import { chromium } from "playwright";

export class CaptureError extends Error {}

const MAX_ERROR_LINE_LENGTH = 300;
function errorText(error) {
	const message = error instanceof Error ? error.message : String(error);
	return message
		.replace(/\u001b\[[0-9;]*m/g, "")
		.split("\n")
		.filter((line) => line.length <= MAX_ERROR_LINE_LENGTH)
		.join("\n");
}

export async function captureElement({ url, selector, width, height, deviceScaleFactor, wait, hideSelector }) {
	let browser;
	try {
		browser = await chromium.launch();
	} catch (error) {
		throw new CaptureError(
			`Chromium を起動できません。playwright install chromium を実行済みか、サンドボックス内で実行していないか確認してください。\n${errorText(error)}`,
		);
	}
	try {
		// 新しいコンテキストではオープニングの演出が毎回再生される
		const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor, reducedMotion: "reduce" });
		const page = await context.newPage();
		try {
			await page.goto(url, { waitUntil: "networkidle" });
		} catch (error) {
			throw new CaptureError(
				`ページの読み込みに失敗しました: ${url}\n開発サーバーが起動しているか、--url の値が正しいか確認してください。\n${errorText(error)}`,
			);
		}
		// scrollbar-gutter: stable だと、幅 0 のスクロールバーの分の空白が右端に残る
		await page.addStyleTag({ content: ":root { scrollbar-gutter: auto !important; }" });

		const locator = page.locator(selector);
		try {
			await locator.waitFor({ state: "visible", timeout: 10_000 });
		} catch (error) {
			if (error instanceof Error && error.name === "TimeoutError") {
				throw new CaptureError(
					`要素が見つかりませんでした: ${selector}\nセレクタが正しいか、変更が描画先に反映されている（ビルドが必要なプロジェクトならビルド済み）か確認してください。`,
				);
			}
			throw new CaptureError(`セレクタの解決に失敗しました: ${selector}\n${errorText(error)}`);
		}
		if (hideSelector) {
			// display: none だと通常フローの要素を隠したときに対象の位置がずれる
			await page.addStyleTag({ content: `${hideSelector} { visibility: hidden !important; }` });
		}
		// 画面外のまま撮ると負の z-index の背景が合成されない。screenshot() 自身のスクロールでは描画が間に合わない
		await locator.scrollIntoViewIfNeeded();
		await page.waitForTimeout(wait);
		// boundingBox() はビューポート基準なので、スクロール後の値が撮影範囲とずれる
		const rect = await locator.evaluate((el) => {
			const r = el.getBoundingClientRect();
			return {
				left: r.left + window.scrollX,
				top: r.top + window.scrollY,
				right: r.right + window.scrollX,
				bottom: r.bottom + window.scrollY,
			};
		});
		return { buffer: await locator.screenshot(), rect };
	} finally {
		await browser.close();
	}
}
