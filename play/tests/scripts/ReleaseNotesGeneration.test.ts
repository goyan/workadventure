import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { env, execPath } from "node:process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("release history generation", () => {
    let repository: string;
    const script = resolve("scripts/generate-release-notes.mjs");
    const date = "2026-10-30T16:34:39+01:00";

    function git(args: string[]): string {
        return execFileSync("git", args, {
            cwd: repository,
            encoding: "utf8",
            env: { ...env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
        }).trim();
    }

    function commit(subject: string): string {
        git([
            "-c",
            "user.name=Contributor",
            "-c",
            "user.email=contributor@example.org",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "--allow-empty",
            "-m",
            subject,
        ]);
        return git(["rev-parse", "HEAD"]);
    }

    beforeEach(() => {
        repository = mkdtempSync(join(tmpdir(), "wa-release-notes-"));
        mkdirSync(join(repository, "play/src/common"), { recursive: true });
        git(["init", "--initial-branch=main"]);
        commit("feat(front): upstream baseline");
        git(["tag", "v1.32.6"]);
    });

    afterEach(() => {
        rmSync(repository, { recursive: true, force: true });
    });

    it("publishes only front features and fixes after the baseline, newest first, without emails or bodies", () => {
        const feature = commit("feat(front): Historique des nouveautés\n\nInternal commit body");
        commit("docs: documentation");
        commit("ci: build pipeline");
        commit("test(front): regression coverage");
        const fix = commit("fix(front): Description de la mise à jour");

        execFileSync(execPath, [script], { cwd: repository });
        const serialized = readFileSync(join(repository, "play/src/common/release-notes.json"), "utf8");
        const notes: unknown = JSON.parse(serialized);

        expect(notes).toEqual([
            { id: fix, date, author: "Contributor", type: "fix", description: "Description de la mise à jour" },
            { id: feature, date, author: "Contributor", type: "feat", description: "Historique des nouveautés" },
        ]);
        expect(serialized).not.toContain("contributor@example.org");
        expect(serialized).not.toContain("Internal commit body");
        expect(serialized).not.toContain("upstream baseline");
    });

    it("publishes the front commits of a pull request merged with a merge commit, at the date of the merge", () => {
        git(["switch", "-q", "-c", "feature"]);
        const feature = commit("feat(front): Bruits de pas");
        commit("feat(back): Côté serveur seulement");
        git(["switch", "-q", "main"]);
        const direct = commit("fix(front): Correctif direct");
        git([
            "-c",
            "user.name=Merger",
            "-c",
            "user.email=merger@example.org",
            "merge",
            "--no-ff",
            "-q",
            "-m",
            "Merge pull request #1 from goyan/feature",
            "feature",
        ]);

        execFileSync(execPath, [script], { cwd: repository });
        const notes: unknown = JSON.parse(readFileSync(join(repository, "play/src/common/release-notes.json"), "utf8"));

        expect(notes).toEqual([
            { id: feature, date, author: "Contributor", type: "feat", description: "Bruits de pas" },
            { id: direct, date, author: "Contributor", type: "fix", description: "Correctif direct" },
        ]);
    });
});
