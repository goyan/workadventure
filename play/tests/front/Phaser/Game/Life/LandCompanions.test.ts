import { describe, expect, it, vi } from "vitest";
import { AquaticLife } from "../../../../../src/front/Phaser/Game/Life/AquaticLife";
import { LandCompanions } from "../../../../../src/front/Phaser/Game/Life/LandCompanions";
import type { LandCompanionWorld } from "../../../../../src/front/Phaser/Game/Life/LandCompanions";
import { isLandKind } from "../../../../../src/front/Phaser/Game/Life/LandSprites";

const ANTELOPE = 4;
const LION = 6;
const TIGER = 8;
const ME = 7;
const OTHER = 9;

function create(custom: Partial<LandCompanionWorld> = {}) {
    const life = new AquaticLife(isLandKind);
    const feet = new Map<number, { x: number; y: number }>([[ME, { x: 100, y: 100 }]]);
    const prompt: { kind?: "tame" | "release"; action?: () => void } = {};
    const tame = vi.fn();
    const release = vi.fn();
    const state = { editor: false, shown: true, ground: true, others: 0 };
    const world: LandCompanionWorld = {
        localUserId: () => ME,
        playerFeet: (userId) => feet.get(userId),
        playerInWater: () => false,
        editorOpen: () => state.editor,
        playerOnGround: () => state.ground,
        shown: () => state.shown,
        otherCompanions: () => state.others,
        tame,
        release,
        showPrompt: (kind, action) => {
            prompt.kind = kind;
            prompt.action = action;
        },
        hidePrompt: () => {
            prompt.kind = undefined;
            prompt.action = undefined;
        },
        ...custom,
    };
    const companions = new LandCompanions(life, world);
    let now = 0;
    /** The server tells these animals, then a frame goes by. */
    const tell = (animals: { id: number; kind: number; x: number; y: number; owner?: number }[]): void => {
        life.receive(animals, now);
        // Past the glide: each one is where the server said.
        now += 2000;
        companions.update(now);
    };
    const frame = (ms = 16): void => {
        now += ms;
        companions.update(now);
    };
    return { companions, life, feet, prompt, tame, release, state, tell, frame, time: () => now };
}

describe("LandCompanions, the prompt", () => {
    it("offers to tame a free lion a tile and a half away at most", () => {
        const { prompt, tell, tame } = create();
        tell([{ id: 1, kind: LION, x: 148, y: 100 }]);
        expect(prompt.kind).toBe("tame");
        prompt.action?.();
        expect(tame).toHaveBeenCalledWith(1);
    });

    it("offers nothing for a lion further, an antelope, or the lion of someone else", () => {
        const { prompt, tell } = create();
        tell([
            { id: 1, kind: LION, x: 149, y: 100 },
            { id: 2, kind: ANTELOPE, x: 110, y: 100 },
            { id: 3, kind: TIGER, x: 110, y: 100, owner: OTHER },
        ]);
        expect(prompt.kind).toBeUndefined();
    });

    it("offers the nearest of two", () => {
        const { prompt, tell, tame } = create();
        tell([
            { id: 1, kind: LION, x: 140, y: 100 },
            { id: 2, kind: TIGER, x: 120, y: 100 },
        ]);
        prompt.action?.();
        expect(tame).toHaveBeenCalledWith(2);
    });

    it("offers nothing in the editor, on a raised floor or while the jungle is hidden", () => {
        for (const key of ["editor", "ground", "shown"] as const) {
            const { prompt, tell, state } = create();
            state[key] = key === "editor";
            tell([{ id: 1, kind: LION, x: 110, y: 100 }]);
            expect(prompt.kind, key).toBeUndefined();
        }
    });

    it("offers no sixth companion, the wandering ones counted", () => {
        const animals = [
            { id: 1, kind: LION, x: 100, y: 140, owner: ME },
            { id: 2, kind: LION, x: 100, y: 140, owner: ME },
            // The nearest: right under the feet of the player.
            { id: 3, kind: LION, x: 100, y: 100 },
        ];
        const room = create();
        room.state.others = 2;
        room.tell(animals);
        expect(room.prompt.kind).toBe("tame");
        const full = create();
        full.state.others = 3;
        full.tell(animals);
        expect(full.prompt.kind).not.toBe("tame");
    });

    it("offers to let go one's own lion beside oneself", () => {
        const { prompt, tell, release, companions } = create();
        tell([{ id: 1, kind: LION, x: 100, y: 100, owner: ME }]);
        expect(companions.tamedCount).toBe(1);
        expect(prompt.kind).toBe("release");
        prompt.action?.();
        expect(release).toHaveBeenCalledWith(1);
    });

    it("lets all go from the wheel, only when there is one", () => {
        const { tell, release, companions } = create();
        companions.releaseAll();
        expect(release).not.toHaveBeenCalled();
        tell([{ id: 1, kind: LION, x: 100, y: 100, owner: ME }]);
        companions.releaseAll();
        expect(release).toHaveBeenCalledWith();
    });

    it("lets all go when the editor opens, once", () => {
        const { tell, frame, release, state } = create();
        tell([{ id: 1, kind: LION, x: 100, y: 100, owner: ME }]);
        state.editor = true;
        frame();
        frame();
        expect(release).toHaveBeenCalledTimes(1);
    });
});

describe("LandCompanions, where a tamed animal is shown", () => {
    it("leaves a free animal where the server says", () => {
        const { companions, tell, time } = create();
        tell([{ id: 1, kind: LION, x: 300, y: 300 }]);
        expect(companions.poseOf(1, time())).toBeUndefined();
    });

    it("walks a tamed lion to two tiles behind its master, and stops there", () => {
        const { companions, tell, frame, feet, time } = create();
        tell([{ id: 1, kind: LION, x: 100, y: 100, owner: ME }]);
        // The master walks to the right, ten tiles in five seconds.
        for (let step = 0; step < 300; step++) {
            feet.set(ME, { x: 100 + (step + 1) * (320 / 300), y: 100 });
            frame();
            companions.poseOf(1, time());
        }
        for (let step = 0; step < 120; step++) {
            frame();
            companions.poseOf(1, time());
        }
        const pose = companions.poseOf(1, time());
        expect(pose).not.toBe("hidden");
        if (!pose || pose === "hidden") throw new Error("not led");
        expect(pose.x).toBeGreaterThan(420 - 64 - 8);
        expect(pose.x).toBeLessThan(420 - 64 + 8);
        expect(Math.abs(pose.y - 100)).toBeLessThan(4);
        expect(pose.moving).toBe(false);
    });

    it("hides the lion of a master out of view, and shows it at their feet when they come back", () => {
        const { companions, tell, frame, feet, time } = create();
        tell([{ id: 1, kind: LION, x: 100, y: 100, owner: OTHER }]);
        expect(companions.poseOf(1, time())).toBe("hidden");
        feet.set(OTHER, { x: 500, y: 500 });
        frame();
        const pose = companions.poseOf(1, time());
        if (!pose || pose === "hidden") throw new Error("not led");
        expect(Math.hypot(pose.x - 500, pose.y - 500)).toBeLessThan(80);
    });

    it("gives the lions of a master different places, after their wandering companions", () => {
        const { companions, tell, frame, state, time } = create();
        state.others = 1;
        tell([
            { id: 1, kind: LION, x: 100, y: 100, owner: ME },
            { id: 2, kind: TIGER, x: 100, y: 100, owner: ME },
        ]);
        // The time to take their places.
        for (let step = 0; step < 60; step++) {
            frame();
            companions.poseOf(1, time());
            companions.poseOf(2, time());
        }
        const first = companions.poseOf(1, time());
        const second = companions.poseOf(2, time());
        if (!first || first === "hidden" || !second || second === "hidden") throw new Error("not led");
        expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThan(16);
    });

    it("frees on the screen a lion the server says free again", () => {
        const { companions, tell, time, prompt } = create();
        tell([{ id: 1, kind: LION, x: 100, y: 100, owner: ME }]);
        tell([{ id: 1, kind: LION, x: 100, y: 100 }]);
        expect(companions.poseOf(1, time())).toBeUndefined();
        expect(companions.tamedCount).toBe(0);
        expect(prompt.kind).toBe("tame");
    });
});
