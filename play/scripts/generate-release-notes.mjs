import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// Only public commit subjects and author names are published, never emails or commit bodies.
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const FORMAT = "--format=%H%x00%cI%x00%aN%x00%P%x00%s";
const PULL_REQUEST_MERGE = /^Merge pull request #\d+ from goyan\//;

const notes = [];
for (const applied of log(["--first-parent", "v1.32.6..HEAD"])) {
    addNote(applied, applied.date);
    // A pull request of the fork merged with a plain merge commit brings its own commits: they land on the branch
    // with the merge. A merge titled like a commit already describes its pull request, and merges of the upstream
    // project are not this fork's news.
    const [mainline, merged] = applied.parents;
    if (merged && PULL_REQUEST_MERGE.test(applied.subject)) {
        for (const commit of log(["--no-merges", `${mainline}..${merged}`])) {
            addNote(commit, applied.date);
        }
    }
}
writeFileSync(join(root, "play/src/common/release-notes.json"), JSON.stringify(notes, null, 4) + "\n");

function addNote({ id, author, subject }, date) {
    const match = /^(feat|fix)\(front\): (.+)$/.exec(subject);
    if (match) {
        notes.push({ id, date, author, type: match[1], description: match[2] });
    }
}

function log(args) {
    const fields = execFileSync("git", ["log", "-z", FORMAT, ...args], { cwd: root, encoding: "utf8" }).split("\0");
    const commits = [];
    for (let index = 0; index + 4 < fields.length; index += 5) {
        const [id, date, author, parents, subject] = fields.slice(index, index + 5);
        commits.push({ id: id.trim(), date, author, parents: parents.split(" ").filter(Boolean), subject });
    }
    return commits;
}
