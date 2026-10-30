import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// Only public commit subjects and author names are published, never emails or commit bodies.
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const fields = execFileSync(
    "git",
    ["log", "--first-parent", "-z", "--format=%H%x00%cI%x00%aN%x00%s", "v1.32.6..HEAD"],
    { cwd: root, encoding: "utf8" },
).split("\0");
const notes = [];
for (let index = 0; index + 3 < fields.length; index += 4) {
    const [id, date, author, subject] = fields.slice(index, index + 4);
    const match = /^(feat|fix)\(front\): (.+)$/.exec(subject);
    if (match) {
        notes.push({ id, date, author, type: match[1], description: match[2] });
    }
}
writeFileSync(join(root, "play/src/common/release-notes.json"), JSON.stringify(notes, null, 4) + "\n");
