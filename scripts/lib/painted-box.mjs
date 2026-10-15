import { cropPng } from "./png.mjs";

// screenshot() は小数の辺を外側へ、描画は最寄りへ丸めるので、縁に付く空白を落とす
export function cropToPaintedBox(png, rect, deviceScaleFactor) {
	// 整数でない dsf で切り出すと対象の端が削れる
	if (Math.abs(deviceScaleFactor - Math.round(deviceScaleFactor)) > 1e-6) return png;
	const toDevicePx = (cssPx) => Math.round(cssPx * deviceScaleFactor);
	const paintedLeft = Math.round(rect.left);
	const paintedTop = Math.round(rect.top);
	const x = toDevicePx(paintedLeft - Math.floor(rect.left));
	const y = toDevicePx(paintedTop - Math.floor(rect.top));
	const width = toDevicePx(Math.round(rect.right) - paintedLeft);
	const height = toDevicePx(Math.round(rect.bottom) - paintedTop);
	if (width <= 0 || height <= 0 || x + width > png.width || y + height > png.height) return png;
	return cropPng(png, { x, y, width, height });
}
