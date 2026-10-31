import { describe, expect, it } from "vitest";
import { KONAMI_CODE, advanceKonamiProgress } from "./KonamiCodeDetector";

function feed(codes: string[]): number {
    return codes.reduce((progress, code) => advanceKonamiProgress(progress, code), 0);
}

describe("advanceKonamiProgress", () => {
    it("completes the sequence when the whole code is entered", () => {
        expect(feed(KONAMI_CODE)).toBe(KONAMI_CODE.length);
    });

    it("resets the progress on a wrong key", () => {
        expect(feed(["ArrowUp", "ArrowUp", "z"])).toBe(0);
    });

    it("keeps the progress when the first key is pressed again", () => {
        expect(feed(["ArrowUp", "ArrowUp", "ArrowUp"])).toBe(1);
    });

    it("completes the sequence after a failed attempt", () => {
        expect(feed(["ArrowUp", "z", ...KONAMI_CODE])).toBe(KONAMI_CODE.length);
    });
});
