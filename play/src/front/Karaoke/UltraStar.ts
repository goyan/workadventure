import { KaraokeReferenceSchema, KaraokeReferenceSource } from "@workadventure/map-editor";
import type { KaraokeNote, KaraokeReference } from "@workadventure/map-editor";

/** UltraStar's pitch zero is MIDI C4; a beat is a quarter of the declared BPM beat. */
export function parseUltraStar(text: string, recordingKey: string): KaraokeReference {
    if (text.length > 300_000) throw new Error("UltraStar file too large");
    const rows = text.replace(/^\uFEFF/, "").split(/\r?\n/);
    const headers = new Map<string, string>();
    for (const row of rows) {
        const tag = /^#([^:]+):(.*)$/.exec(row);
        if (tag) headers.set(tag[1].toUpperCase(), tag[2].trim());
    }
    if (headers.get("RELATIVE")?.toUpperCase() === "YES") throw new Error("Relative UltraStar timing is unsupported");
    const bpm = Number(headers.get("BPM")?.replace(",", "."));
    const gap = Number((headers.get("GAP") ?? "0").replace(",", "."));
    if (!Number.isFinite(bpm) || bpm <= 0 || bpm > 1000 || !Number.isFinite(gap)) throw new Error("Invalid BPM or GAP");
    const notes: KaraokeNote[] = [];
    let voice = 1;
    for (const raw of rows) {
        const row = raw.trim();
        if (!row || row.startsWith("#") || row.startsWith("-") || row === "E") continue;
        if (/^P[12]$/.test(row)) {
            voice = Number(row.slice(1));
            continue;
        }
        if (voice !== 1) continue;
        const match = /^([:*FRG])\s+(-?\d+)\s+(\d+)\s+(-?\d+)(?:\s|$)/.exec(row);
        if (!match) throw new Error("Invalid UltraStar note");
        // Spoken/rap notes have no target pitch and do not enter the justness score.
        if (["F", "R", "G"].includes(match[1])) continue;
        const startMs = gap + (Number(match[2]) * 60_000) / (bpm * 4);
        const endMs = startMs + (Number(match[3]) * 60_000) / (bpm * 4);
        const note = { startMs: Math.max(0, startMs), endMs, midi: Number(match[4]) + 60, golden: match[1] === "*" };
        if (endMs > 0) notes[notes.length] = note;
    }
    return KaraokeReferenceSchema.parse({
        id: crypto.randomUUID(),
        recordingKey,
        title: headers.get("TITLE"),
        artist: headers.get("ARTIST"),
        source: KaraokeReferenceSource.UltraStar,
        notes,
    });
}

/** Keep the edition selected by the player; metadata mismatches require another partition. */
export function sameKaraokeSong(a: string, b: string): boolean {
    const normalize = (text: string): string =>
        text
            .normalize("NFD")
            .replace(/\p{M}/gu, "")
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]/gu, "");
    return normalize(a) === normalize(b);
}
