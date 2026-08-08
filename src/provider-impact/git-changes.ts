import { execFileSync } from "node:child_process";
import path from "node:path";

export type FileChanges = {
	changedFiles: string[];
	changedFileSet: Set<string>;
	deletedFiles: string[];
	newFiles: string[];
	newFileSet: Set<string>;
};

export class GitChanges {
	getFileChanges(cwd: string): FileChanges {
		const changedFiles = new Set<string>();
		const deletedFiles = new Set<string>();
		const newFiles = new Set<string>();
		const cwdFromGitRoot = this.getCwdFromGitRoot(cwd);
		const output = execFileSync("git", ["status", "--porcelain"], {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});

		for (const line of output.split("\n")) {
			if (!line) continue;

			const status = line.slice(0, 2);
			const file = line.slice(3).split(" -> ").at(-1) ?? "";
			const normalized = this.normalizeGitPath(file, cwdFromGitRoot);

			if (!normalized) continue;

			if (status.includes("D")) {
				deletedFiles.add(normalized);
				continue;
			}

			if (status.includes("?") || status.includes("A")) {
				newFiles.add(normalized);
			} else {
				changedFiles.add(normalized);
			}
		}

		return {
			changedFiles: [...changedFiles],
			changedFileSet: changedFiles,
			deletedFiles: [...deletedFiles],
			newFiles: [...newFiles],
			newFileSet: newFiles,
		};
	}

	getChangedLineRangesByFile(
		cwd: string,
	): Map<string, Array<[number, number]>> {
		const ranges = new Map<string, Array<[number, number]>>();
		const cwdFromGitRoot = this.getCwdFromGitRoot(cwd);

		for (const args of [
			["diff", "--unified=0", "--no-ext-diff"],
			["diff", "--cached", "--unified=0", "--no-ext-diff"],
		]) {
			const output = execFileSync("git", args, {
				cwd,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			});
			let currentFile: string | null = null;

			for (const line of output.split("\n")) {
				if (line.startsWith("+++ b/")) {
					currentFile = this.normalizeGitPath(
						line.slice("+++ b/".length),
						cwdFromGitRoot,
					);
					continue;
				}

				if (!currentFile || !line.startsWith("@@")) continue;

				const match = /\+(\d+)(?:,(\d+))?/.exec(line);
				if (!match) continue;

				const start = Number(match[1]);
				const length = Number(match[2] ?? "1");
				const end = start + Math.max(length, 1) - 1;
				ranges.set(currentFile, [
					...(ranges.get(currentFile) ?? []),
					[start, end],
				]);
			}
		}

		return ranges;
	}

	getHeadFileContent(cwd: string, file: string): string | null {
		const cwdFromGitRoot = this.getCwdFromGitRoot(cwd);
		const gitPath = cwdFromGitRoot ? `${cwdFromGitRoot}/${file}` : file;

		try {
			return execFileSync("git", ["show", `HEAD:${gitPath}`], {
				cwd,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			});
		} catch {
			return null;
		}
	}

	isLineChanged(
		rangesByFile: Map<string, Array<[number, number]>>,
		file: string,
		line: number,
	): boolean {
		return (rangesByFile.get(file) ?? []).some(
			([start, end]) => line >= start && line <= end,
		);
	}

	toRelativePath(cwd: string, filePath: string): string {
		return this.normalizePath(path.relative(cwd, filePath));
	}

	private getCwdFromGitRoot(cwd: string): string {
		const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();

		return this.normalizePath(path.relative(gitRoot, cwd));
	}

	private normalizePath(filePath: string): string {
		return filePath.trim().replaceAll(path.sep, "/");
	}

	private normalizeGitPath(filePath: string, cwdFromGitRoot: string): string {
		const normalized = this.normalizePath(filePath);

		if (!normalized || !cwdFromGitRoot) return normalized;

		return normalized.startsWith(`${cwdFromGitRoot}/`)
			? normalized.slice(cwdFromGitRoot.length + 1)
			: normalized;
	}
}
