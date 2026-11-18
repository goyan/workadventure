import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { argv, env, exit } from "node:process";
import { PUBLISHED } from "./release-note-pattern.mjs";

// Checks that the commits of a pull request will publish at least one note in « Nouveautés », and prints the notes.
// Usage: node play/scripts/check-release-note.mjs [<base>..<head>]   (default: origin/infogene..HEAD)
// A pull request with nothing to announce (docs, CI, tests, refactoring) says so in a commit message, with a line
// "Nouveautes: aucune".
const NOTHING_TO_ANNOUNCE = /^Nouveaut[ée]s\s*:\s*aucune\s*$/im;

const range = argv[2] ?? "origin/infogene..HEAD";
const fields = execFileSync("git", ["log", "-z", "--no-merges", "--format=%s%x00%b", range], {
    encoding: "utf8",
}).split("\0");

const notes = [];
let nothingToAnnounce = false;
for (let index = 0; index + 1 < fields.length; index += 2) {
    const subject = fields[index].trim();
    const match = PUBLISHED.exec(subject);
    if (match) {
        notes.push(`${match[1] === "feat" ? "Nouveauté" : "Correctif"} : ${match[2]}`);
    }
    nothingToAnnounce ||= NOTHING_TO_ANNOUNCE.test(fields[index + 1]);
}

const lines = [];
let failed = false;
if (notes.length > 0) {
    lines.push("Notes publiées dans « Nouveautés » à la fusion :", ...notes.map((note) => `- ${note}`));
} else if (nothingToAnnounce) {
    lines.push("Aucune note dans « Nouveautés » : un commit porte « Nouveautes: aucune ».");
} else {
    failed = true;
    lines.push(
        "Aucun commit de cette pull request ne paraîtra dans « Nouveautés ».",
        "Ajouter un commit dont le sujet est « feat(front): … », « fix(front): … », « feat(carte): … » ou",
        "« fix(carte): … », rédigé pour un lecteur non technique : c'est le texte affiché en jeu.",
        "S'il n'y a rien à annoncer (docs, CI, tests), écrire la ligne « Nouveautes: aucune » dans le message",
        "d'un commit.",
        "Ne pas fusionner en « squash » : le sujet deviendrait le titre de la pull request.",
    );
}

const report = lines.join("\n");
console.log(report);
if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `### Nouveautés\n\n${report}\n`);
}
exit(failed ? 1 : 0);
