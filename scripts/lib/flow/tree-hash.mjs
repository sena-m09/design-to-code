import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// コミットの有無で値が変わらないよう、HEAD ではなくファイルの中身から求める
export function workingTreeHash(cwd) {
	const listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
		cwd,
		encoding: "utf8",
	});
	const files = [...new Set(listed.split("\0").filter(Boolean))].sort();
	const hash = createHash("sha256");
	for (const file of files) {
		hash.update(file);
		hash.update("\0");
		try {
			hash.update(readFileSync(join(cwd, file)));
		} catch {
			hash.update("<missing>");
		}
		hash.update("\0");
	}
	return hash.digest("hex");
}
