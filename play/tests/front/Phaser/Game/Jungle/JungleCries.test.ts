import { describe, expect, it, vi } from "vitest";
import {
    JUNGLE_CRY_COOLDOWN_MS,
    JUNGLE_CRY_RANGE_PX,
    JUNGLE_SOUNDS,
    JungleCryGate,
    jungleCryLeg,
    jungleCryVolume,
    jungleSoundKey,
    loadJungleSounds,
    playJungleSound,
} from "../../../../../src/front/Phaser/Game/Jungle/JungleCries";
import { LEG_MS, wanderLegOffset } from "../../../../../src/front/Phaser/Game/Wander/WanderSchedule";

const LION = "jungle:tree-1";

/** A moment in leg `leg` of the animal (the legs of its WanderSchedule). */
function inLeg(animalId: string, leg: number): number {
    return leg * LEG_MS - wanderLegOffset(animalId) + 5_000;
}

function cryLegs(animalId: string, legs: number): number[] {
    const found: number[] = [];
    for (let leg = 0; leg < legs; leg++) {
        const cry = jungleCryLeg(animalId, inLeg(animalId, leg));
        if (cry !== undefined) found.push(cry);
    }
    return found;
}

describe("JungleCries", () => {
    it("about one leg in twelve has a cry", () => {
        const legs = cryLegs(LION, 1200);
        expect(legs.length).toBeGreaterThanOrEqual(60);
        expect(legs.length).toBeLessThanOrEqual(140);
        // The leg given is the leg of the moment asked about.
        for (const leg of legs.slice(0, 5)) expect(jungleCryLeg(LION, inLeg(LION, leg) + 10_000)).toBe(leg);
    });

    it("the same legs for every client", () => {
        expect(cryLegs(LION, 300)).toEqual(cryLegs(LION, 300));
        expect(cryLegs("jungle:tree-2", 300)).not.toEqual(cryLegs(LION, 300));
    });

    it("volume fades with the distance", () => {
        expect(jungleCryVolume(0)).toBe(1);
        expect(jungleCryVolume(192)).toBeCloseTo(0.5);
        expect(jungleCryVolume(JUNGLE_CRY_RANGE_PX)).toBe(0);
        expect(jungleCryVolume(384)).toBe(0);
        expect(jungleCryVolume(500)).toBe(0);
    });

    it("one cry per animal and leg", () => {
        const gate = new JungleCryGate();
        expect(gate.shouldPlay(LION, 7, 1_000)).toBe(true);
        expect(gate.shouldPlay(LION, 7, 1_000 + JUNGLE_CRY_COOLDOWN_MS + 1)).toBe(false);
        expect(gate.shouldPlay(LION, 8, 1_000 + JUNGLE_CRY_COOLDOWN_MS + 1)).toBe(true);
    });

    it("at most one cry every 20 seconds", () => {
        const gate = new JungleCryGate();
        expect(gate.shouldPlay(LION, 7, 1_000)).toBe(true);
        expect(gate.shouldPlay("jungle:tree-2", 3, 6_000)).toBe(false);
        expect(gate.shouldPlay("jungle:tree-2", 3, 21_000)).toBe(true);
    });

    it("lion and tiger sheets give their sound, another sheet none", () => {
        expect(jungleSoundKey("lion-sheet.png")).toBe("jungle-lion");
        expect(jungleSoundKey("tigre-sheet.png")).toBe("jungle-tigre");
        // As the collections give it: an absolute URL, in a folder named after its content.
        expect(jungleSoundKey("https://wa-beta.example/~/maps/infogene-animaux-0a1b2c3d/tigre-sheet.png?v=2")).toBe(
            "jungle-tigre",
        );
        expect(jungleSoundKey("https://wa-beta.example/~/maps/infogene-animaux-0a1b2c3d/canard-sheet.png")).toBe(
            undefined,
        );
        expect(jungleSoundKey("https://wa-beta.example/lion-sheet.png/canard.png")).toBe(undefined);
    });

    it("a sound that is not loaded plays nothing and throws nothing", () => {
        const sound = { play: vi.fn() };
        expect(playJungleSound(sound, { exists: () => false }, "jungle-lion", 0.3)).toBe(false);
        expect(sound.play).not.toHaveBeenCalled();
        const broken = {
            play: vi.fn(() => {
                throw new Error('Audio key "jungle-lion" missing from cache');
            }),
        };
        expect(playJungleSound(broken, { exists: () => true }, "jungle-lion", 0.3)).toBe(false);
        expect(playJungleSound(sound, { exists: () => true }, "jungle-lion", 0)).toBe(false);
        expect(playJungleSound(sound, { exists: () => true }, "jungle-lion", 0.3)).toBe(true);
        expect(sound.play).toHaveBeenCalledWith("jungle-lion", { volume: 0.3 });
    });

    it("the sounds are asked for once per page, even when they fail to load", () => {
        const load = { audio: vi.fn(), start: vi.fn() };
        const requested = new Set<string>();
        loadJungleSounds(load, { exists: () => false }, requested);
        // Another scene of the same page (a reconnection), after the files failed to load: not asked for again.
        loadJungleSounds(load, { exists: () => false }, requested);
        expect(load.audio.mock.calls).toEqual(JUNGLE_SOUNDS.map(({ key, url }) => [key, url]));
        expect(load.start).toHaveBeenCalledOnce();
        const cached = { audio: vi.fn(), start: vi.fn() };
        loadJungleSounds(cached, { exists: () => true }, new Set());
        expect(cached.audio).not.toHaveBeenCalled();
        expect(cached.start).not.toHaveBeenCalled();
    });
});
