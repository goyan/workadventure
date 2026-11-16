import { describe, expect, it, vi } from "vitest";
import {
    JUNGLE_COMPANION_ANNOUNCE_MS,
    JUNGLE_COMPANION_EVENT,
    JUNGLE_COMPANION_EXPIRY_MS,
} from "../../../../../src/front/Phaser/Game/Jungle/JungleCompanionProtocol";
import type { JungleCompanionMessage } from "../../../../../src/front/Phaser/Game/Jungle/JungleCompanionProtocol";
import { JungleCompanions } from "../../../../../src/front/Phaser/Game/Jungle/JungleCompanions";
import type { JungleCompanionWorld } from "../../../../../src/front/Phaser/Game/Jungle/JungleCompanions";
import type { JungleAnimal } from "../../../../../src/front/Phaser/Game/Jungle/JunglePlan";
import type { WanderLead } from "../../../../../src/front/Phaser/Game/Wander/WanderingCharactersManager";
import type { Point } from "../../../../../src/front/Phaser/Game/Wander/WanderSchedule";

const ME = 5;
const LION: JungleAnimal = { id: "jungle:tree-1", sheetPath: "lion-sheet.png", nest: { x: 320, y: 320 } };
const TIGER: JungleAnimal = { id: "jungle:tree-2", sheetPath: "tigre-sheet.png", nest: { x: 640, y: 320 } };

function makeWorld(options: { animals?: JungleAnimal[] } = {}) {
    const animals = options.animals ?? [LION, TIGER];
    const feet = new Map<number, Point>([[ME, { x: 320, y: 352 }]]);
    const poses = new Map<string, Point>(animals.map((animal) => [animal.id, animal.nest]));
    const sent: JungleCompanionMessage[] = [];
    const leads = new Map<string, WanderLead>();
    const prompt: { kind: "tame" | "release" | undefined; action: (() => void) | undefined } = {
        kind: undefined,
        action: undefined,
    };
    const state = { editorOpen: false, serverNow: 1_000_000, animals, inWater: new Set<number>() };
    const world: JungleCompanionWorld = {
        localUserId: () => ME,
        playerFeet: (userId) => feet.get(userId),
        playerInWater: (userId) => state.inWater.has(userId),
        animals: () => state.animals,
        animalPose: (id) => poses.get(id),
        editorOpen: () => state.editorOpen,
        serverNow: () => state.serverNow,
        send: (message) => sent.push(message),
        setLead: (id, lead) => {
            if (lead) leads.set(id, lead);
            else leads.delete(id);
        },
        showPrompt: (kind, action) => {
            prompt.kind = kind;
            prompt.action = action;
        },
        hidePrompt: () => {
            prompt.kind = undefined;
            prompt.action = undefined;
        },
    };
    return { world, feet, poses, sent, leads, prompt, state };
}

function claim(animal: string | null, since: number) {
    return { name: JUNGLE_COMPANION_EVENT, data: { animal, since } };
}

describe("JungleCompanions", () => {
    it("tells the room it has no companion when it starts", () => {
        const { world, sent } = makeWorld();
        new JungleCompanions(world);
        expect(sent).toEqual([{ animal: null, since: 0 }]);
    });

    it("offers to tame a free animal within a tile and a half, and nothing further", () => {
        const { world, feet, prompt } = makeWorld();
        const companions = new JungleCompanions(world);
        companions.update(0);
        expect(prompt.kind).toBe("tame");
        feet.set(ME, { x: 320, y: 320 + 49 });
        companions.update(16);
        expect(prompt.kind).toBeUndefined();
    });

    it("taming tells the room and makes the animal follow its master", () => {
        const { world, sent, leads, prompt } = makeWorld();
        const companions = new JungleCompanions(world);
        companions.update(0);
        prompt.action?.();
        expect(sent.at(-1)).toEqual({ animal: LION.id, since: 1_000_000 });
        companions.update(16);
        expect(leads.has(LION.id)).toBe(true);
        expect(leads.get(LION.id)?.poseAt(16)).toMatchObject({ x: 320, y: 320 });
        // Its companion stands two tiles behind at most: the prompt does not sit on the interaction key.
        expect(prompt.kind).toBe("release");
    });

    it("one companion: no other animal is offered, and the same key near it releases it", () => {
        const { world, feet, sent, leads, prompt, poses } = makeWorld();
        const companions = new JungleCompanions(world);
        companions.update(0);
        prompt.action?.();
        companions.update(16);
        // Next to the tiger, the lion two tiles behind.
        feet.set(ME, { x: 640, y: 352 });
        poses.set(LION.id, { x: 576, y: 352 });
        companions.update(32);
        expect(prompt.kind).toBeUndefined();
        poses.set(LION.id, { x: 610, y: 352 });
        companions.update(48);
        expect(prompt.kind).toBe("release");
        prompt.action?.();
        expect(sent.at(-1)).toEqual({ animal: null, since: 0 });
        companions.update(64);
        expect(leads.has(LION.id)).toBe(false);
        expect(prompt.kind).toBe("tame");
    });

    it("announces its companion every five seconds", () => {
        const { world, sent, prompt } = makeWorld();
        const companions = new JungleCompanions(world);
        companions.update(0);
        prompt.action?.();
        const count = sent.length;
        companions.update(JUNGLE_COMPANION_ANNOUNCE_MS - 1);
        expect(sent).toHaveLength(count);
        companions.update(JUNGLE_COMPANION_ANNOUNCE_MS);
        expect(sent).toHaveLength(count + 1);
        expect(sent.at(-1)).toEqual({ animal: LION.id, since: 1_000_000 });
    });

    it("an animal another player tamed follows them, cannot be tamed, and goes back once released", () => {
        const { world, feet, leads, prompt } = makeWorld();
        feet.set(9, { x: 360, y: 352 });
        const companions = new JungleCompanions(world);
        companions.receive(9, claim(LION.id, 500).name, claim(LION.id, 500).data, 0);
        companions.update(0);
        expect(prompt.kind).toBeUndefined();
        expect(leads.has(LION.id)).toBe(true);
        companions.receive(9, claim(null, 0).name, claim(null, 0).data, 100);
        companions.update(100);
        expect(leads.has(LION.id)).toBe(false);
        expect(prompt.kind).toBe("tame");
    });

    it("hides the companion of a player out of view, and drops a claim that is not announced again", () => {
        const { world, leads } = makeWorld();
        const companions = new JungleCompanions(world);
        companions.receive(9, JUNGLE_COMPANION_EVENT, { animal: LION.id, since: 500 }, 0);
        companions.update(0);
        // Player 9 is far away: the lion is with them, neither here nor wandering around its nest.
        expect(leads.get(LION.id)?.poseAt(0)).toBeUndefined();
        companions.update(JUNGLE_COMPANION_EXPIRY_MS + 1);
        expect(leads.has(LION.id)).toBe(false);
    });

    it("loses a race silently: the first claim wins", () => {
        const { world, sent, leads, prompt } = makeWorld();
        const companions = new JungleCompanions(world);
        companions.update(0);
        prompt.action?.();
        // Player 9 tamed it a moment earlier: their message crossed ours.
        companions.receive(9, JUNGLE_COMPANION_EVENT, { animal: LION.id, since: 999_000 }, 10);
        companions.update(16);
        expect(sent.at(-1)).toEqual({ animal: null, since: 0 });
        expect(leads.has(LION.id)).toBe(true);
        expect(prompt.kind).toBeUndefined();
    });

    it("wins a race against a later claim, and against the same instant with a larger user id", () => {
        const { world, sent, prompt } = makeWorld();
        const companions = new JungleCompanions(world);
        companions.update(0);
        prompt.action?.();
        companions.receive(9, JUNGLE_COMPANION_EVENT, { animal: LION.id, since: 1_000_000 }, 10);
        companions.receive(8, JUNGLE_COMPANION_EVENT, { animal: LION.id, since: 1_000_001 }, 10);
        companions.update(16);
        expect(sent.at(-1)).toEqual({ animal: LION.id, since: 1_000_000 });
        expect(prompt.kind).toBe("release");
    });

    it("ignores its own echo and claims on animals it does not have", () => {
        const { world, leads, prompt } = makeWorld();
        const companions = new JungleCompanions(world);
        companions.receive(ME, JUNGLE_COMPANION_EVENT, { animal: LION.id, since: 1 }, 0);
        companions.receive(9, JUNGLE_COMPANION_EVENT, { animal: "jungle:elsewhere", since: 1 }, 0);
        companions.update(0);
        expect(leads.size).toBe(0);
        expect(prompt.kind).toBe("tame");
    });

    it("no companion in the map editor: it is released and nothing is offered", () => {
        const { world, sent, leads, prompt, state } = makeWorld();
        const companions = new JungleCompanions(world);
        companions.update(0);
        prompt.action?.();
        companions.update(16);
        state.editorOpen = true;
        companions.update(32);
        expect(sent.at(-1)).toEqual({ animal: null, since: 0 });
        expect(leads.has(LION.id)).toBe(false);
        expect(prompt.kind).toBeUndefined();
    });

    it("an animal gone from the jungle (switched off, another day) is released", () => {
        const { world, sent, leads, prompt, state } = makeWorld();
        const companions = new JungleCompanions(world);
        companions.update(0);
        prompt.action?.();
        companions.update(16);
        state.animals = [TIGER];
        companions.update(32);
        expect(sent.at(-1)).toEqual({ animal: null, since: 0 });
        expect(leads.size).toBe(0);
    });

    it("another species on the same tree is led again (the wandering characters made a new one)", () => {
        const { world, leads, prompt, state } = makeWorld();
        const companions = new JungleCompanions(world);
        companions.update(0);
        prompt.action?.();
        companions.update(16);
        const first = leads.get(LION.id);
        state.animals = [{ ...LION, sheetPath: "tigre-sheet.png" }, TIGER];
        companions.update(32);
        expect(leads.get(LION.id)).toBeDefined();
        expect(leads.get(LION.id)).not.toBe(first);
    });

    it("destroy releases the companion and takes the prompt away", () => {
        const { world, sent, leads, prompt } = makeWorld();
        const setLead = vi.spyOn(world, "setLead");
        const companions = new JungleCompanions(world);
        companions.update(0);
        prompt.action?.();
        companions.update(16);
        companions.destroy();
        expect(sent.at(-1)).toEqual({ animal: null, since: 0 });
        expect(setLead).toHaveBeenLastCalledWith(LION.id, undefined);
        expect(leads.size).toBe(0);
        expect(prompt.kind).toBeUndefined();
    });
});
