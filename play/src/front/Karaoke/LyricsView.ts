import type { LyricLine } from "./Lrc";

const RIGHT_TO_LEFT_LETTER = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;

const LATIN_LETTER = /\p{Script=Latin}/u;
/**
 * Arabic words that always announce what follows them (a vocative, a conjunction, a preposition): a line cannot end
 * with one of them.
 */
const LEADING_WORDS = new Set([
    "يا",
    "و",
    "ف",
    "ب",
    "ل",
    "في",
    "من",
    "على",
    "عل",
    "مع",
    "إلا",
    "الا",
    "حتى",
    "غير",
    "اللي",
    "الي",
    "باش",
    "بلا",
    "ولا",
    "أو",
    "او",
]);

/**
 * The reading direction of a line: right to left as soon as it holds Arabic (or Hebrew), even mixed with Latin words,
 * so the lines of a song never switch side; left to right for Latin only.
 */
export function lyricDirection(text: string): "rtl" | "ltr" {
    return RIGHT_TO_LEFT_LETTER.test(text) ? "rtl" : "ltr";
}

/**
 * A mixed Arabic and Latin line in its sung order. Lyrics sites keep the order their contributor typed: some typed the
 * groups of words for a left to right display, which reads backwards right to left. Such a line gives itself away by
 * ending with a word that announces a following one (`… mommy يا` for `يا mommy`): its groups are put back in order,
 * the words inside each group untouched. Any other line is left as typed.
 */
export function lyricInSungOrder(text: string): string {
    const groups = wordGroups(text);
    const last = groups.at(-1);
    if (!last?.rightToLeft || !groups.some((group) => !group.rightToLeft)) return text;
    const lastWord = (last.words.at(-1) ?? "").replace(/[^\u0600-\u06FF]/gu, "");
    if (!LEADING_WORDS.has(lastWord)) return text;
    return [...groups]
        .reverse()
        .map((group) => group.words.join(" "))
        .join(" ");
}

/** Consecutive words of the same script; words without letters (punctuation, numbers) stay with the previous ones. */
function wordGroups(text: string): { rightToLeft: boolean; words: string[] }[] {
    return text
        .trim()
        .split(/\s+/u)
        .filter((word) => word !== "")
        .reduce<{ rightToLeft: boolean; words: string[] }[]>((groups, word) => {
            const rightToLeft = RIGHT_TO_LEFT_LETTER.test(word)
                ? true
                : LATIN_LETTER.test(word)
                  ? false
                  : (groups.at(-1)?.rightToLeft ?? false);
            const previous = groups.at(-1);
            return previous && previous.rightToLeft === rightToLeft
                ? [...groups.slice(0, -1), { rightToLeft, words: [...previous.words, word] }]
                : [...groups, { rightToLeft, words: [word] }];
        }, []);
}

/**
 * How far the playback is through a line, from 0 to 1: a line ends where the next later one starts, the last one
 * with the track. Undefined when that end is unknown: LRC lines only carry their start.
 */
export function lyricLineProgress(
    lines: readonly LyricLine[],
    index: number,
    positionMs: number,
    trackDurationMs?: number,
): number | undefined {
    const line = lines.at(index);
    if (!line || index < 0) return undefined;
    // Lines sharing a timestamp end together.
    const endMs = lines.slice(index + 1).find((next) => next.atMs > line.atMs)?.atMs ?? trackDurationMs;
    if (endMs === undefined || endMs <= line.atMs) return undefined;
    return Math.min(1, Math.max(0, (positionMs - line.atMs) / (endMs - line.atMs)));
}

/** The scroll position that shows a line in the middle of its view. */
export function centeredScrollTop(lineTop: number, lineHeight: number, viewHeight: number): number {
    return Math.max(0, lineTop - (viewHeight - lineHeight) / 2);
}
