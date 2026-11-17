import { z } from "zod";

export enum KaraokeReferenceSource {
    UltraStar = "ultrastar",
    Voice = "voice",
    /** Built by the host's desktop app from Spotify's analysis of the track: approximate. */
    Auto = "auto",
}
export const KaraokeNoteSchema = z
    .object({
        startMs: z.number().finite().min(0).max(900_000),
        endMs: z.number().finite().positive().max(900_000),
        midi: z.number().finite().min(24).max(108),
        golden: z.boolean(),
    })
    .refine((note) => note.endMs > note.startMs);
export const KaraokeReferenceSchema = z
    .object({
        id: z.string().uuid(),
        recordingKey: z.string().min(1).max(1000),
        title: z.string().min(1).max(200),
        artist: z.string().min(1).max(200),
        source: z.nativeEnum(KaraokeReferenceSource),
        notes: z.array(KaraokeNoteSchema).min(1).max(2000),
    })
    .refine(({ notes }) => notes.every((note, index) => index === 0 || note.startMs >= notes[index - 1].endMs));
export type KaraokeNote = z.infer<typeof KaraokeNoteSchema>;
export type KaraokeReference = z.infer<typeof KaraokeReferenceSchema>;

export const KARAOKE_SCORE_EVENT = "workadventure.karaoke-score";
export const KaraokeScoreReportSchema = z.object({
    hostUuid: z.string().min(1).max(256),
    singerUuid: z.string().min(1).max(256),
    turnId: z.string().uuid(),
    referenceId: z.string().uuid(),
    score: z.number().int().min(0).max(10_000),
    accuracy: z.number().int().min(0).max(100),
    coverage: z.number().int().min(0).max(100),
    combo: z.number().int().min(0).max(10_000),
    finished: z.boolean(),
});
export type KaraokeScoreReport = z.infer<typeof KaraokeScoreReportSchema>;
