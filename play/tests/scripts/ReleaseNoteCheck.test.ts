import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { env, execPath } from "node:process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("release note check of a pull request", () => {
    let repository: string;
    const script = resolve("scripts/check-release-note.mjs");

    function git(args: string[]): void {
        execFileSync("git", args, { cwd: repository, encoding: "utf8" });
    }

    function commit(message: string): void {
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
            message,
        ]);
    }

    function check(): { status: number | null; output: string } {
        // The check also writes its report to the summary of a CI run: not from a test.
        const environment = { ...env };
        delete environment.GITHUB_STEP_SUMMARY;
        const result = spawnSync(execPath, [script, "main..feature"], {
            cwd: repository,
            encoding: "utf8",
            env: environment,
        });
        return { status: result.status, output: result.stdout };
    }

    beforeEach(() => {
        repository = mkdtempSync(join(tmpdir(), "wa-release-note-check-"));
        git(["init", "--initial-branch=main"]);
        commit("feat(front): already on the base branch");
        git(["switch", "-q", "-c", "feature"]);
    });

    afterEach(() => {
        rmSync(repository, { recursive: true, force: true });
    });

    it("refuses a pull request none of whose commits will be published", () => {
        commit("wip(carte): paliers");
        commit("feat(back): Côté serveur seulement");
        commit("test(front): regression coverage");

        const { status, output } = check();

        expect(status).toBe(1);
        expect(output).toContain("Aucun commit de cette pull request ne paraîtra");
    });

    it("accepts a pull request with a published commit and lists its notes", () => {
        commit("wip(carte): paliers");
        commit("feat(carte): Paliers et escaliers");
        commit("fix(front): Assise à l'arrêt");

        const { status, output } = check();

        expect(status).toBe(0);
        expect(output).toContain("- Nouveauté : Paliers et escaliers");
        expect(output).toContain("- Correctif : Assise à l'arrêt");
        expect(output).not.toContain("already on the base branch");
    });

    it("accepts a pull request that states it has nothing to announce", () => {
        commit("ci: contrôle des notes\n\nNouveautes: aucune");

        const { status, output } = check();

        expect(status).toBe(0);
        expect(output).toContain("Aucune note");
    });

    it("does not take a mention inside a sentence for the statement", () => {
        commit("docs: guide\n\nVoir la ligne Nouveautes: aucune dans le guide.");

        expect(check().status).toBe(1);
    });
});
