import { get } from "svelte/store";
import { expect, it } from "vitest";
import { enterKaraokeGame, karaokeGameActiveStore } from "../../../src/front/Karaoke/KaraokeGameStore";

it("isolates conversations until the last Game view closes, with idempotent cleanup", () => {
    expect(get(karaokeGameActiveStore)).toBe(false);
    const leaveFirst = enterKaraokeGame();
    const leaveSecond = enterKaraokeGame();
    leaveFirst();
    leaveFirst();
    expect(get(karaokeGameActiveStore)).toBe(true);
    leaveSecond();
    expect(get(karaokeGameActiveStore)).toBe(false);
});
