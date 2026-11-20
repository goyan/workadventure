import { describe, expect, it, vi } from "vitest";
import {
    JUNGLE_COMPANION_ANNOUNCE_MS,
    JUNGLE_COMPANION_EVENT,
    JUNGLE_COMPANION_EXPIRY_MS,
} from "../../../../../src/front/Phaser/Game/Jungle/JungleCompanionProtocol";
import type { JungleCompanionMessage } from "../../../../../src/front/Phaser/Game/Jungle/JungleCompanionProtocol";
import { joinedUserId, JungleCompanions } from "../../../../../src/front/Phaser/Game/Jungle/JungleCompanions";
import type { JungleCompanionWorld } from "../../../../../src/front/Phaser/Game/Jungle/JungleCompanions";
import type { JungleAnimal } from "../../../../../src/front/Phaser/Game/Jungle/JunglePlan";
import type { WanderLead } from "../../../../../src/front/Phaser/Game/Wander/WanderingCharactersManager";
import type { Point } from "../../../../../src/front/Phaser/Game/Wander/WanderSchedule";

const ME = 5;
const LION: JungleAnimal = { id: "jungle:tree-1", sheetPath: "lion-sheet.png", nest: { x: 320, y: 320 } };
const TIGER: JungleAnimal = { id: "jungle:tree-2", sheetPath: "tigre-sheet.png", nest: { x: 640, y: 320 } };
const NONE: JungleCompanionMessage = { companions: [] };

function makeWorld(options: { animals?: JungleAnimal[] } = {}) {
    const animals = options.animals ?? [LION, TIGER];
    const feet = new Map<number, Point>([[ME, { x: 320, y: 352 }]]);
    const poses = new Map<string, Point>(animals.map((animal) => [animal.id, animal.nest]));
    const sent: JungleCompanionMessage[] = [];
    const leads = new Map<string, WanderLead>();
    const prompt: {
        kind: "tame" | "release" | undefined;
        action: (() => void) | undefined;
    } = { kind: undefined, action: undefined };
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

function claim(...companions: [string, number][]) {
    return { companions: companions.map(([animal, since]) => ({ animal, since })) };
}

/** Tames the animal the prompt offers now. */
function tameNow(companions: JungleCompanions, prompt: { action: (() => void) | undefined }, nowMs: number): void {
    companions.update(nowMs);
    prompt.action?.();
}

describe("JungleCompanions", () => {
    it("tells the room it has no companion once there is an animal to tame, once", () => {
        const { world, sent } = makeWorld();
        const companions = new JungleCompanions(world);
        expect(sent).toEqual([]);
        companions.update(0);
        companions.update(16);
        expect(sent).toEqual([NONE]);
    });

    it("says nothing on a map without an animal to tame, not even when it goes", () => {
        const { world, sent } = makeWorld({ animals: [] });
        const companions = new JungleCompanions(world);
        companions.update(0);
        companions.receive(9, JUNGLE_COMPANION_EVENT, NONE, 0);
        companions.destroy();
        expect(sent).toEqual([]);
    });

    it("announces its companions at once to a player who just arrived (their empty list), once a second at most", () => {
        const { world, sent, prompt } = makeWorld();
        const companions = new JungleCompanions(world);
        tameNow(companions, prompt, 0);
        const count = sent.length;
        companions.receive(9, JUNGLE_COMPANION_EVENT, NONE, 100);
        expect(sent).toHaveLength(count + 1);
        expect(sent.at(-1)).toEqual(claim([LION.id, 1_000_000]));
        companions.receive(8, JUNGLE_COMPANION_EVENT, NONE, 600);
        expect(sent).toHaveLength(count + 1);
        companions.receive(8, JUNGLE_COMPANION_EVENT, NONE, 1100);
        expect(sent).toHaveLength(count + 2);
    });

    it("after a gap in its announces longer than their expiry, an arrival releases the companions instead", () => {
        const { world, sent, prompt } = makeWorld();
        const companions = new JungleCompanions(world);
        tameNow(companions, prompt, 0);
        // The computer slept: nothing announced for longer than the expiry, the others let the lion go.
        companions.receive(9, JUNGLE_COMPANION_EVENT, NONE, JUNGLE_COMPANION_EXPIRY_MS + 1);
        expect(sent.at(-1)).toEqual(NONE);
        companions.update(JUNGLE_COMPANION_EXPIRY_MS + 2);
        expect(prompt.kind).toBe("tame");
    });

    it("keeps an animal with the master seen holding it: an older claim arriving later does not take it", () => {
        const { world, feet, leads } = makeWorld();
        feet.set(7, { x: 360, y: 352 });
        const companions = new JungleCompanions(world);
        companions.receive(7, JUNGLE_COMPANION_EVENT, claim([LION.id, 900_000]), 0);
        companions.update(0);
        companions.update(4000);
        // Player 9 says they tamed it long before: too late, player 7 has it.
        companions.receive(9, JUNGLE_COMPANION_EVENT, claim([LION.id, 1]), 4000);
        companions.update(4016);
        expect(leads.get(LION.id)?.poseAt(4016)).toBeDefined();
        companions.update(10_000);
        expect(leads.get(LION.id)?.poseAt(10_000)).toBeDefined();
        // In view, player 9 would be followed if they were its master: it follows player 7, out of view now.
        feet.set(9, { x: 360, y: 352 });
        feet.delete(7);
        expect(leads.get(LION.id)?.poseAt(10_016)).toBeUndefined();
    });

    it("gives the lead again to an animal the wandering characters made anew (a placed object edited)", () => {
        const { world, leads, prompt } = makeWorld();
        const companions = new JungleCompanions(world);
        tameNow(companions, prompt, 0);
        companions.update(16);
        const lead = leads.get(LION.id);
        leads.delete(LION.id);
        companions.update(32);
        expect(leads.get(LION.id)).toBe(lead);
    });

    it("tames a placed animal like a jungle one", () => {
        const DUCK: JungleAnimal = { id: "entity:duck-1", sheetPath: "duck.png", nest: { x: 320, y: 330 } };
        const { world, sent, leads, prompt } = makeWorld({ animals: [DUCK] });
        const companions = new JungleCompanions(world);
        tameNow(companions, prompt, 0);
        expect(sent.at(-1)).toEqual(claim([DUCK.id, 1_000_000]));
        companions.update(16);
        expect(leads.has(DUCK.id)).toBe(true);
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

    it("a stale tame action does nothing once the animal is out of reach or taken", () => {
        const { world, feet, sent, leads, prompt } = makeWorld();
        const companions = new JungleCompanions(world);
        companions.update(0);
        const stale = prompt.action;
        // The player walked away from the lion: the action of the prompt shown next to it is called anyway.
        feet.set(ME, { x: 320, y: 600 });
        companions.update(16);
        const count = sent.length;
        stale?.();
        companions.update(32);
        expect(sent).toHaveLength(count);
        expect(leads.size).toBe(0);
        // Back next to it, but player 9 tamed it meanwhile.
        feet.set(ME, { x: 320, y: 352 });
        companions.update(48);
        const next = prompt.action;
        companions.receive(9, JUNGLE_COMPANION_EVENT, claim([LION.id, 1]), 50);
        next?.();
        expect(sent).toHaveLength(count);
    });

    it("taming tells the room and makes the animal follow its master", () => {
        const { world, sent, leads, prompt } = makeWorld();
        const companions = new JungleCompanions(world);
        tameNow(companions, prompt, 0);
        expect(sent.at(-1)).toEqual(claim([LION.id, 1_000_000]));
        companions.update(16);
        expect(leads.has(LION.id)).toBe(true);
        expect(leads.get(LION.id)?.poseAt(16)).toMatchObject({ x: 320, y: 320 });
        // Right after taming, it is still next to its master: the same key lets it go.
        expect(prompt.kind).toBe("release");
    });

    it("tames a second animal: both are announced, and both follow", () => {
        const { world, feet, sent, leads, prompt, poses, state: worldState } = makeWorld();
        const companions = new JungleCompanions(world);
        tameNow(companions, prompt, 0);
        // Next to the tiger, the lion two tiles behind.
        feet.set(ME, { x: 640, y: 352 });
        poses.set(LION.id, { x: 576, y: 352 });
        worldState.serverNow = 1_000_500;
        companions.update(16);
        expect(prompt.kind).toBe("tame");
        prompt.action?.();
        expect(sent.at(-1)).toEqual(claim([LION.id, 1_000_000], [TIGER.id, 1_000_500]));
        companions.update(32);
        expect([...leads.keys()].sort()).toEqual([LION.id, TIGER.id]);
    });

    it("five companions at most: no sixth animal is offered", () => {
        const animals = Array.from({ length: 6 }, (_, i) => ({
            id: `jungle:tree-${i}`,
            sheetPath: "lion-sheet.png",
            nest: { x: 320 + i * 4, y: 320 },
        }));
        const { world, sent, leads, prompt, poses } = makeWorld({ animals });
        const companions = new JungleCompanions(world);
        for (let i = 0; i < 5; i++) {
            // Each tamed animal steps back so that the next free one is the nearest.
            tameNow(companions, prompt, i * 16);
            const tamed = sent.at(-1)?.companions.at(-1)?.animal ?? "";
            poses.set(tamed, { x: 0, y: 0 });
        }
        expect(sent.at(-1)?.companions).toHaveLength(5);
        companions.update(100);
        expect(prompt.kind).toBeUndefined();
        expect(leads.size).toBe(5);
    });

    it("counts the animals of the life the player tamed: five in all", () => {
        const { world, sent, prompt } = makeWorld();
        // Four lions of the life already follow the player: room for one more.
        world.otherCompanions = () => 4;
        const companions = new JungleCompanions(world);
        companions.update(0);
        expect(prompt.kind).toBe("tame");
        const stale = prompt.action;
        // A fifth one meanwhile.
        world.otherCompanions = () => 5;
        companions.update(16);
        expect(prompt.kind).toBeUndefined();
        stale?.();
        expect(sent.at(-1)?.companions).toHaveLength(0);
    });

    it("the same key releases the nearest companion within reach, and only that one", () => {
        const { world, feet, sent, leads, prompt, poses } = makeWorld();
        const companions = new JungleCompanions(world);
        tameNow(companions, prompt, 0);
        feet.set(ME, { x: 640, y: 352 });
        poses.set(LION.id, { x: 576, y: 352 });
        tameNow(companions, prompt, 16);
        // The lion further, the tiger right there: the tiger is let go.
        poses.set(LION.id, { x: 620, y: 352 });
        poses.set(TIGER.id, { x: 640, y: 340 });
        companions.update(32);
        expect(prompt.kind).toBe("release");
        prompt.action?.();
        expect(sent.at(-1)).toEqual(claim([LION.id, 1_000_000]));
        companions.update(48);
        expect([...leads.keys()]).toEqual([LION.id]);
        // The nearest animal is now the free tiger.
        expect(prompt.kind).toBe("tame");
    });

    it("announces its companions every five seconds", () => {
        const { world, sent, prompt } = makeWorld();
        const companions = new JungleCompanions(world);
        tameNow(companions, prompt, 0);
        const count = sent.length;
        companions.update(JUNGLE_COMPANION_ANNOUNCE_MS - 1);
        expect(sent).toHaveLength(count);
        companions.update(JUNGLE_COMPANION_ANNOUNCE_MS);
        expect(sent).toHaveLength(count + 1);
        expect(sent.at(-1)).toEqual(claim([LION.id, 1_000_000]));
    });

    it("announces from a timer too: the frames stop in a hidden tab", () => {
        const { world, sent, prompt } = makeWorld();
        const companions = new JungleCompanions(world);
        tameNow(companions, prompt, 0);
        const count = sent.length;
        companions.announce(JUNGLE_COMPANION_ANNOUNCE_MS);
        expect(sent).toHaveLength(count + 1);
        expect(sent.at(-1)).toEqual(claim([LION.id, 1_000_000]));
    });

    it("a gap in its announces longer than their expiry releases the companions: the others have let them go", () => {
        const { world, sent, prompt } = makeWorld();
        const companions = new JungleCompanions(world);
        tameNow(companions, prompt, 0);
        companions.announce(JUNGLE_COMPANION_EXPIRY_MS + 1);
        expect(sent.at(-1)).toEqual(NONE);
        companions.update(JUNGLE_COMPANION_EXPIRY_MS + 2);
        expect(prompt.kind).toBe("tame");
    });

    it("a master coming back into view has its companion at their feet, not where it was last seen", () => {
        const { world, feet, leads } = makeWorld();
        const companions = new JungleCompanions(world);
        companions.receive(9, JUNGLE_COMPANION_EVENT, claim([LION.id, 500]), 0);
        companions.update(0);
        expect(leads.get(LION.id)?.poseAt(0)).toBeUndefined();
        feet.set(9, { x: 480, y: 352 });
        expect(leads.get(LION.id)?.poseAt(16)).toMatchObject({ x: 480, y: 352 });
    });

    it("an animal another player tamed follows them, cannot be tamed, and goes back once released", () => {
        const { world, feet, leads, prompt } = makeWorld();
        feet.set(9, { x: 360, y: 352 });
        const companions = new JungleCompanions(world);
        companions.receive(9, JUNGLE_COMPANION_EVENT, claim([LION.id, 500]), 0);
        companions.update(0);
        expect(prompt.kind).toBeUndefined();
        expect(leads.has(LION.id)).toBe(true);
        companions.receive(9, JUNGLE_COMPANION_EVENT, NONE, 100);
        companions.update(100);
        expect(leads.has(LION.id)).toBe(false);
        expect(prompt.kind).toBe("tame");
    });

    it("understands a client with one companion (the former format)", () => {
        const { world, leads } = makeWorld();
        const companions = new JungleCompanions(world);
        companions.receive(9, JUNGLE_COMPANION_EVENT, { animal: LION.id, since: 500 }, 0);
        companions.update(0);
        expect(leads.has(LION.id)).toBe(true);
    });

    it("hides the companion of a player out of view, and drops a claim that is not announced again", () => {
        const { world, leads } = makeWorld();
        const companions = new JungleCompanions(world);
        companions.receive(9, JUNGLE_COMPANION_EVENT, claim([LION.id, 500]), 0);
        companions.update(0);
        // Player 9 is far away: the lion is with them, neither here nor wandering around its nest.
        expect(leads.get(LION.id)?.poseAt(0)).toBeUndefined();
        companions.update(JUNGLE_COMPANION_EXPIRY_MS + 1);
        expect(leads.has(LION.id)).toBe(false);
    });

    it("loses a race silently: the first claim of that animal wins, the other companions stay", () => {
        const { world, feet, sent, leads, prompt, poses, state: worldState } = makeWorld();
        const companions = new JungleCompanions(world);
        tameNow(companions, prompt, 0);
        feet.set(ME, { x: 640, y: 352 });
        poses.set(LION.id, { x: 576, y: 352 });
        worldState.serverNow = 1_000_500;
        tameNow(companions, prompt, 16);
        // Player 9 tamed the tiger a moment earlier: their message crossed ours.
        companions.receive(9, JUNGLE_COMPANION_EVENT, claim([TIGER.id, 1_000_400]), 20);
        companions.update(32);
        expect(sent.at(-1)).toEqual(claim([LION.id, 1_000_000]));
        expect(leads.has(TIGER.id)).toBe(true);
        expect(prompt.kind).toBeUndefined();
    });

    it("wins a race against a later claim, and against the same instant with a larger user id", () => {
        const { world, sent, prompt } = makeWorld();
        const companions = new JungleCompanions(world);
        tameNow(companions, prompt, 0);
        companions.receive(9, JUNGLE_COMPANION_EVENT, claim([LION.id, 1_000_000]), 10);
        companions.receive(8, JUNGLE_COMPANION_EVENT, claim([LION.id, 1_000_001]), 10);
        companions.update(16);
        expect(sent.at(-1)).toEqual(claim([LION.id, 1_000_000]));
        expect(prompt.kind).toBe("release");
    });

    it("ignores its own echo and claims on animals it does not have", () => {
        const { world, leads, prompt } = makeWorld();
        const companions = new JungleCompanions(world);
        companions.receive(ME, JUNGLE_COMPANION_EVENT, claim([LION.id, 1]), 0);
        companions.receive(9, JUNGLE_COMPANION_EVENT, claim(["jungle:elsewhere", 1]), 0);
        companions.update(0);
        expect(leads.size).toBe(0);
        expect(prompt.kind).toBe("tame");
    });

    it("no companion in the map editor: they are released and nothing is offered", () => {
        const { world, sent, leads, prompt, state: worldState } = makeWorld();
        const companions = new JungleCompanions(world);
        tameNow(companions, prompt, 0);
        companions.update(16);
        worldState.editorOpen = true;
        companions.update(32);
        expect(sent.at(-1)).toEqual(NONE);
        expect(leads.has(LION.id)).toBe(false);
        expect(prompt.kind).toBeUndefined();
    });

    it("an animal gone from the jungle (switched off, another day) is released, the others stay", () => {
        const { world, feet, sent, leads, prompt, poses, state: worldState } = makeWorld();
        const companions = new JungleCompanions(world);
        tameNow(companions, prompt, 0);
        feet.set(ME, { x: 640, y: 352 });
        poses.set(LION.id, { x: 576, y: 352 });
        worldState.serverNow = 1_000_500;
        tameNow(companions, prompt, 16);
        worldState.animals = [TIGER];
        companions.update(32);
        expect(sent.at(-1)).toEqual(claim([TIGER.id, 1_000_500]));
        expect([...leads.keys()]).toEqual([TIGER.id]);
    });

    it("two companions of the same master stand at two places of the group", () => {
        const { world, feet, prompt, poses, leads } = makeWorld();
        const companions = new JungleCompanions(world);
        tameNow(companions, prompt, 0);
        feet.set(ME, { x: 640, y: 352 });
        poses.set(LION.id, { x: 576, y: 352 });
        tameNow(companions, prompt, 16);
        companions.update(32);
        // The master walks away to the right, then stops: the two stand apart.
        let lion = leads.get(LION.id)?.poseAt(32);
        let tiger = leads.get(TIGER.id)?.poseAt(32);
        for (let t = 48, x = 640; t < 6000; t += 16) {
            x = Math.min(900, x + 4);
            feet.set(ME, { x, y: 352 });
            lion = leads.get(LION.id)?.poseAt(t);
            tiger = leads.get(TIGER.id)?.poseAt(t);
        }
        expect(lion && tiger && Math.hypot(lion.x - tiger.x, lion.y - tiger.y)).toBeGreaterThanOrEqual(31.5);
    });

    it("another species on the same tree is led again (the wandering characters made a new one)", () => {
        const { world, leads, prompt, state: worldState } = makeWorld();
        const companions = new JungleCompanions(world);
        tameNow(companions, prompt, 0);
        companions.update(16);
        const first = leads.get(LION.id);
        worldState.animals = [{ ...LION, sheetPath: "tigre-sheet.png" }, TIGER];
        companions.update(32);
        expect(leads.get(LION.id)).toBeDefined();
        expect(leads.get(LION.id)).not.toBe(first);
    });

    it("destroy releases the companions and takes the prompt away", () => {
        const { world, sent, leads, prompt } = makeWorld();
        const setLead = vi.spyOn(world, "setLead");
        const companions = new JungleCompanions(world);
        tameNow(companions, prompt, 0);
        companions.update(16);
        companions.destroy();
        expect(sent.at(-1)).toEqual(NONE);
        expect(setLead).toHaveBeenLastCalledWith(LION.id, undefined);
        expect(leads.size).toBe(0);
        expect(prompt.kind).toBeUndefined();
    });
});

describe("joinedUserId", () => {
    it("gives the id of the player once the room is joined, and nothing before instead of throwing", () => {
        expect(joinedUserId(undefined)).toBeUndefined();
        expect(joinedUserId({ getUserId: () => 12 })).toBe(12);
        // RoomConnection.getUserId throws until the room is joined: an exception there stops the game loop.
        expect(
            joinedUserId({
                getUserId: () => {
                    throw new Error("UserId cannot be null!");
                },
            }),
        ).toBeUndefined();
    });
});

describe("JungleCompanions on raised floors", () => {
    /** The altitude of each player (undefined: flying), and of each animal where it is shown. */
    function makeFloorWorld() {
        const made = makeWorld();
        const floorZ = new Map<number, number | undefined>([[ME, 0]]);
        const animalZ = new Map<string, number>();
        made.world.playerFloorZ = (userId) => floorZ.get(userId);
        made.world.animalPose = (id) => {
            const pose = made.poses.get(id);
            const z = animalZ.get(id);
            return pose && z ? { ...pose, z } : pose;
        };
        return { ...made, floorZ, animalZ };
    }

    it("only offers to tame an animal standing on the floor of the player", () => {
        const { world, prompt, floorZ, animalZ } = makeFloorWorld();
        const companions = new JungleCompanions(world);
        // The lion is shown right next to the player, but on the floor above.
        animalZ.set(LION.id, 52);
        companions.update(0);
        expect(prompt.kind).toBeUndefined();
        floorZ.set(ME, 52);
        companions.update(16);
        expect(prompt.kind).toBe("tame");
        // On the stair between both, the player is close enough to neither.
        floorZ.set(ME, 26);
        companions.update(32);
        expect(prompt.kind).toBeUndefined();
    });

    it("offers nothing to a flying player", () => {
        const { world, prompt, floorZ } = makeFloorWorld();
        const companions = new JungleCompanions(world);
        floorZ.set(ME, undefined);
        companions.update(0);
        expect(prompt.kind).toBeUndefined();
    });

    it("leads a companion to the floor of its master: its feet on the ground under them, at their altitude", () => {
        const { world, prompt, leads, feet, floorZ } = makeFloorWorld();
        const companions = new JungleCompanions(world);
        tameNow(companions, prompt, 0);
        companions.update(16);
        const lead = leads.get(LION.id);
        expect(lead).toBeDefined();
        // The master is seen far away at once, on a floor at 52 px: drawn 52 px further north than its feet stand.
        feet.set(ME, { x: 2000, y: 948 });
        floorZ.set(ME, 52);
        expect(lead?.poseAt(32)).toMatchObject({ x: 2000, y: 1000, z: 52 });
    });

    it("starts a companion from the floor it was tamed on", () => {
        const { world, prompt, leads, feet, floorZ, animalZ, poses } = makeFloorWorld();
        const companions = new JungleCompanions(world);
        floorZ.set(ME, 52);
        animalZ.set(LION.id, 52);
        // Shown at (320, 320): standing 52 px further south on the ground.
        feet.set(ME, { x: 320, y: 352 });
        tameNow(companions, prompt, 0);
        companions.update(16);
        const pose = leads.get(LION.id)?.poseAt(32);
        expect(poses.get(LION.id)).toEqual({ x: 320, y: 320 });
        expect(pose).toMatchObject({ x: 320, y: 372, z: 52 });
    });
});
