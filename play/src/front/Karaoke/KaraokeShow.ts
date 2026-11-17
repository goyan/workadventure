import { derived, writable } from "svelte/store";
import { KARAOKE_LEADERBOARD_SIZE } from "@workadventure/map-editor";
import type { KaraokeLeaderboardEntry } from "@workadventure/map-editor";
import type { LyricLine } from "./Lrc";
import { karaokeStagesStore } from "./KaraokeStage";

/** The dots shown before a verse: one per second, like a karaoke bar's countdown. */
export const KARAOKE_COUNTDOWN_BEATS = 3;
const BEAT_MS = 1000;
/** A sung line followed this much later by the next one is an instrumental break, even without an empty line. */
const LONG_BREAK_MS = 12_000;

export interface KaraokeCountdown {
    /** The line the countdown leads to. */
    line: number;
    /** The dots still lit: 3, 2, then 1. */
    beats: number;
}

/** Counts in the next verse after an intro or an instrumental break; nothing while lines follow each other. */
export function karaokeCountdown(
    lines: readonly LyricLine[],
    positionMs: number,
    active: number,
): KaraokeCountdown | undefined {
    const line = lines.findIndex((candidate, index) => index > active && candidate.text.trim() !== "");
    if (line < 0) return undefined;
    const remaining = lines[line].atMs - positionMs;
    if (remaining <= 0 || remaining > KARAOKE_COUNTDOWN_BEATS * BEAT_MS) return undefined;
    const current = active >= 0 ? lines[active] : undefined;
    const quiet = !current || current.text.trim() === "" || lines[line].atMs - current.atMs >= LONG_BREAK_MS;
    return quiet ? { line, beats: Math.ceil(remaining / BEAT_MS) } : undefined;
}

export type KaraokeJudgement = "perfect" | "great" | "good" | "miss";

/** The word shown when a note ends, from its quality (0 to 1, see KaraokeScoring.judge). */
export function karaokeJudgement(quality: number): KaraokeJudgement {
    if (quality >= 0.85) return "perfect";
    if (quality >= 0.6) return "great";
    if (quality >= 0.3) return "good";
    return "miss";
}

/** Zero to five stars, by half stars, out of the 10 000 points. */
export function karaokeStars(score: number): number {
    return Math.min(5, Math.max(0, Math.round(score / 1000) / 2));
}

export type KaraokeRank = "legend" | "star" | "rising" | "amateur" | "shower";

export function karaokeRank(score: number): KaraokeRank {
    if (score >= 9000) return "legend";
    if (score >= 7500) return "star";
    if (score >= 5000) return "rising";
    if (score >= 2500) return "amateur";
    return "shower";
}

export interface KaraokeTrailPoint {
    atMs: number;
    /** The sung note brought to the octave of the expected one: the trail follows the melody's lanes. */
    midi: number | undefined;
}

/** What only the local microphone knows: shown on the note highway, never sent to the others. */
export interface KaraokeLiveVoice {
    trail: readonly KaraokeTrailPoint[];
    midi: number | undefined;
    latencyMs: number;
    /** Note index to quality, for the notes already passed. */
    judgements: ReadonlyMap<number, number>;
    /** The last note judged; the id changes with every judgement, so the same word can show twice in a row. */
    judged: KaraokeJudged | undefined;
    streak: number;
    multiplier: number;
    /** The singer's score now, out of 10 000. */
    score: number;
}

export interface KaraokeJudged {
    index: number;
    quality: number;
    id: number;
    /** The points this note added to the score. */
    gained: number;
    golden: boolean;
    /** The note ended a run that had raised the multiplier. */
    broken: boolean;
    /** The note raised the multiplier: its new value. */
    levelUp: number | undefined;
}

export const karaokeLiveVoiceStore = writable<KaraokeLiveVoice | undefined>(undefined);

const TRAIL_MS = 1500;

export function appendKaraokeTrail(trail: readonly KaraokeTrailPoint[], point: KaraokeTrailPoint): KaraokeTrailPoint[] {
    return [...trail.filter((previous) => previous.atMs > point.atMs - TRAIL_MS && previous.atMs < point.atMs), point];
}

export interface KaraokeRankRow {
    rank: number;
    name: string;
    score: number;
    accuracy: number;
    mine: boolean;
}

/**
 * Where a turn just sung would rank on its song, between the singers just ahead and just behind: the score of this turn,
 * not the singer's best. The server keeps the 11 best: a turn below them ranks "12+" (`beyond`).
 */
export function karaokeRankWindow(
    entries: readonly KaraokeLeaderboardEntry[],
    turn: Pick<KaraokeLeaderboardEntry, "singerUuid" | "name" | "score" | "accuracy">,
    around = 2,
): { rows: KaraokeRankRow[]; beyond: boolean } {
    const others = entries.filter((entry) => entry.singerUuid !== turn.singerUuid);
    const position = others.filter(
        (entry) => entry.score > turn.score || (entry.score === turn.score && entry.accuracy > turn.accuracy),
    ).length;
    const ranked = [
        ...others.slice(0, position).map((entry) => ({ ...entry, mine: false })),
        { ...turn, mine: true },
        ...others.slice(position).map((entry) => ({ ...entry, mine: false })),
    ];
    const rows = ranked
        .map((entry, index) => ({
            rank: index + 1,
            name: entry.name,
            score: entry.score,
            accuracy: entry.accuracy,
            mine: entry.mine,
        }))
        .slice(Math.max(0, position - around), position + around + 1);
    return { rows, beyond: position >= KARAOKE_LEADERBOARD_SIZE };
}

export const KARAOKE_MEDALS = ["🥇", "🥈", "🥉"];

/** Who is on a stage now, to light them up on the map. */
export const karaokeSpotlightStore = derived(
    karaokeStagesStore,
    (stages) =>
        new Set(
            [...stages.values()]
                .filter((stage) => stage.enabled && stage.singerUuid !== null)
                .map((stage) => stage.singerUuid ?? ""),
        ),
);
