import { describe, expect, it, vi } from "vitest";
import type * as Phaser from "phaser";
import type { Entity } from "../../../../../../src/front/Phaser/ECS/Entity";
import { mapLayerPrefabId } from "../../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
import { DOOR_SOUND_KEYS, DoorAnimator } from "../../../../../../src/front/Phaser/Game/MapEditor/MapLayer/DoorAnimator";
import type { DoorCharacter } from "../../../../../../src/front/Phaser/Game/MapEditor/MapLayer/DoorAnimator";

vi.mock("../../../../../../src/front/Phaser/Helpers/TexturesHelper", () => ({
    TexturesHelper: { loadEntityImage: () => Promise.resolve() },
}));

type Point = { x: number; y: number };

const FRAME_STEP_MS = 40;

// Left piece of a horizontal door at (128, 160): the door covers 128..192 x 160..192. Its frames are not in the
// catalog (getPrefab resolves to undefined): the door does not change its texture, but it still opens and closes.
// The local player stands in the room under the door: they hear it, whoever opens it.
function makeAnimator(name = "porte-h-gris-g", x = 128, y = 160) {
    const prefabId = mapLayerPrefabId("Carte Portes", name);
    const entity = {
        entityId: "door",
        x,
        y,
        depth: 0,
        texture: { key: `${name}.png` },
        getPrefab: () => ({ collectionName: "Carte Portes", id: prefabId, imagePath: `${name}.png` }),
        setDepth: () => entity,
    } as unknown as Entity;
    const playSound = vi.fn();
    const animator = new DoorAnimator(
        {} as Phaser.Scene,
        () => [entity],
        () => Promise.resolve(undefined),
        playSound,
        () => {},
        () => [{ x: 96, y: 192, width: 128, height: 128 }],
    );
    return { animator, playSound };
}

const IN_DOOR = { x: 160, y: 176 };
const AWAY = { x: 160, y: 260 };

/** Runs the animator every 40 ms from `from` to `to`, with the characters given by `at(time)`. */
function run(
    animator: DoorAnimator,
    from: number,
    to: number,
    at: (time: number) => DoorCharacter[],
    listener: DoorCharacter,
): void {
    for (let time = from; time <= to; time += FRAME_STEP_MS) {
        animator.update(time, [listener, ...at(time)], listener);
    }
}

function soundsOf(playSound: ReturnType<typeof vi.fn>): string[] {
    return playSound.mock.calls.map(([key]) => key as string);
}

describe("DoorAnimator sounds", () => {
    it("a door opened by the local player is heard opening and closing", () => {
        const { animator, playSound } = makeAnimator();
        const player = { ...IN_DOOR };
        run(animator, 0, 1_000, () => [], player);
        player.y = AWAY.y;
        run(animator, 1_040, 3_000, () => [], player);
        expect(soundsOf(playSound)).toEqual([DOOR_SOUND_KEYS.open, DOOR_SOUND_KEYS.close]);
    });

    it("a door opened by a silent character (an animal) opens and closes without a sound", () => {
        const { animator, playSound } = makeAnimator();
        const listener = { ...AWAY };
        run(animator, 0, 1_000, () => [{ ...IN_DOOR, silent: true }], listener);
        run(animator, 1_040, 3_000, () => [], listener);
        expect(playSound).not.toHaveBeenCalled();
    });

    it("a player who goes through a door an animal opened makes it heard when it closes", () => {
        const { animator, playSound } = makeAnimator();
        const listener = { ...AWAY };
        run(animator, 0, 1_000, () => [{ ...IN_DOOR, silent: true }], listener);
        listener.y = IN_DOOR.y;
        run(animator, 1_040, 1_500, () => [], listener);
        listener.y = AWAY.y;
        run(animator, 1_540, 3_000, () => [], listener);
        expect(soundsOf(playSound)).toEqual([DOOR_SOUND_KEYS.close]);
    });
});

// The wandering animals walk from tile centre to tile centre, and open the doors with the middle of their body, half a
// tile above their feet. Walking along a wall, that point runs exactly on the border of the door next to it.
describe("DoorAnimator borders", () => {
    // Walks a character from `from` to `to` in 4 s and reports whether the door made its opening sound.
    function opensWhileWalking(animator: DoorAnimator, playSound: ReturnType<typeof vi.fn>, from: Point, to: Point) {
        const walker = { ...from };
        for (let time = 0; time <= 4_000; time += FRAME_STEP_MS) {
            walker.x = from.x + ((to.x - from.x) * time) / 4_000;
            walker.y = from.y + ((to.y - from.y) * time) / 4_000;
            animator.update(time, [walker], walker);
        }
        return soundsOf(playSound).includes(DOOR_SOUND_KEYS.open);
    }

    it("an animal walking along the wall south of a horizontal door does not open it", () => {
        // Door 128..192 x 160..192; feet on the centres of the row under it (y = 208), body half a tile higher.
        const { animator, playSound } = makeAnimator();
        expect(opensWhileWalking(animator, playSound, { x: 80, y: 192 }, { x: 240, y: 192 })).toBe(false);
    });

    it("an animal walking along a vertical wall does not open its door", () => {
        // Door centred on the line x = 128, 112..144 x 160..224; the animal walks the column of tile centres x = 112.
        const { animator, playSound } = makeAnimator("porte-v-gris-haut", 96, 160);
        expect(opensWhileWalking(animator, playSound, { x: 112, y: 100 }, { x: 112, y: 280 })).toBe(false);
    });

    it("an animal going through a horizontal door opens it", () => {
        const { animator, playSound } = makeAnimator();
        expect(opensWhileWalking(animator, playSound, { x: 144, y: 128 }, { x: 144, y: 224 })).toBe(true);
    });

    it("an animal going through a vertical door opens it", () => {
        const { animator, playSound } = makeAnimator("porte-v-gris-haut", 96, 160);
        expect(opensWhileWalking(animator, playSound, { x: 80, y: 176 }, { x: 176, y: 176 })).toBe(true);
    });
});

// A locked area: its doors stay closed except for the players who leave it (or left it a moment ago) and those who
// hold a pass. The zone is the room under the door of makeAnimator.
describe("DoorAnimator locked areas", () => {
    const ZONE = { areaId: "z", x: 96, y: 192, width: 128, height: 128 };
    const NO_PASS = { zones: [ZONE], hasPass: () => false };

    // Walks a character in 4 s, the animator being given `locks`; reports the sound of opening and whether the door opened.
    function walk(
        animator: DoorAnimator,
        playSound: ReturnType<typeof vi.fn>,
        from: Point,
        to: Point,
        extra: Partial<DoorCharacter>,
        locks?: Parameters<DoorAnimator["update"]>[3],
    ) {
        const walker: DoorCharacter = { ...from, ...extra };
        let everOpen = false;
        for (let time = 0; time <= 4_000; time += FRAME_STEP_MS) {
            walker.x = from.x + ((to.x - from.x) * time) / 4_000;
            walker.y = from.y + ((to.y - from.y) * time) / 4_000;
            animator.update(time, [walker], walker, locks);
            everOpen ||= animator.isDoorOpen("door");
        }
        return { sound: soundsOf(playSound).includes(DOOR_SOUND_KEYS.open), everOpen };
    }

    const NORTH = { x: 160, y: 120 };
    const SOUTH = { x: 160, y: 240 };

    it("a passer-by coming from the north does not open the door", () => {
        const { animator, playSound } = makeAnimator();
        const result = walk(animator, playSound, NORTH, SOUTH, { uuid: "p" }, NO_PASS);
        expect(result.sound).toBe(false);
        expect(result.everOpen).toBe(false);
    });

    it("an animal never opens the door", () => {
        const { animator, playSound } = makeAnimator();
        const result = walk(animator, playSound, NORTH, SOUTH, { uuid: "a", silent: true }, NO_PASS);
        expect(result.everOpen).toBe(false);
    });

    it("an animal does not open the door even with a pass", () => {
        const { animator, playSound } = makeAnimator();
        const locks = { zones: [ZONE], hasPass: () => true };
        const result = walk(animator, playSound, NORTH, SOUTH, { uuid: "a", silent: true }, locks);
        expect(result.everOpen).toBe(false);
    });

    it("a character without uuid never opens the door", () => {
        const { animator, playSound } = makeAnimator();
        const locks = { zones: [ZONE], hasPass: () => true };
        expect(walk(animator, playSound, NORTH, SOUTH, {}, locks).sound).toBe(false);
    });

    it("an occupant leaving the area opens the door", () => {
        const { animator, playSound } = makeAnimator();
        expect(walk(animator, playSound, SOUTH, NORTH, { uuid: "o" }, NO_PASS).sound).toBe(true);
    });

    it("a visitor with a pass opens the door", () => {
        const { animator, playSound } = makeAnimator();
        const locks = { zones: [ZONE], hasPass: (uuid: string, areaId: string) => uuid === "v" && areaId === "z" };
        expect(walk(animator, playSound, NORTH, SOUTH, { uuid: "v" }, locks).sound).toBe(true);
    });

    it("someone who left the area more than the grace period ago does not open the door", () => {
        const { animator, playSound } = makeAnimator();
        const walker: DoorCharacter = { ...SOUTH, uuid: "o" };
        animator.update(0, [walker], walker, NO_PASS);
        walker.x = 160;
        walker.y = 100;
        animator.update(100, [walker], walker, NO_PASS);
        // Back at the door a long time after: the memory of the area is gone.
        walker.y = 176;
        for (let time = 5_000; time <= 6_000; time += FRAME_STEP_MS) {
            animator.update(time, [walker], walker, NO_PASS);
        }
        expect(soundsOf(playSound)).not.toContain(DOOR_SOUND_KEYS.open);
    });

    it("the same paths without locks open the door as before", () => {
        const { animator, playSound } = makeAnimator();
        expect(walk(animator, playSound, NORTH, SOUTH, { uuid: "p" }).sound).toBe(true);
    });

    it("a door outside every locked zone is not affected", () => {
        const { animator, playSound } = makeAnimator();
        const far = { zones: [{ areaId: "f", x: 1_000, y: 1_000, width: 64, height: 64 }], hasPass: () => false };
        expect(walk(animator, playSound, NORTH, SOUTH, { uuid: "p" }, far).sound).toBe(true);
    });

    it("isDoorOpen is false for an unknown entity", () => {
        const { animator } = makeAnimator();
        expect(animator.isDoorOpen("nope")).toBe(false);
    });
});

// A red padlock marks the doors of a locked area: one per door, in its middle.
describe("DoorAnimator locked door markers", () => {
    const ZONE = { x: 96, y: 192, width: 128, height: 128 };

    // Both pieces of the horizontal door 128..192 x 160..192.
    function makeDoubleDoor() {
        const prefabOf = (name: string) => mapLayerPrefabId("Carte Portes", name);
        const piece = (entityId: string, name: string, x: number) =>
            ({
                entityId,
                x,
                y: 160,
                depth: 0,
                texture: { key: `${name}.png` },
                getPrefab: () => ({ collectionName: "Carte Portes", id: prefabOf(name), imagePath: `${name}.png` }),
                setDepth: () => undefined,
            }) as unknown as Entity;
        const entities = [piece("left", "porte-h-gris-g", 128), piece("right", "porte-h-gris-d", 160)];
        return new DoorAnimator(
            {} as Phaser.Scene,
            () => entities,
            () => Promise.resolve(undefined),
            () => {},
            () => {},
            () => [],
        );
    }

    /** Lets the animator find its doors (they are read on the first update). */
    function scanned(animator: DoorAnimator): DoorAnimator {
        animator.update(0, [], { x: 0, y: 0 });
        return animator;
    }

    it("marks a door of a locked zone in its middle", () => {
        const { animator } = makeAnimator();
        expect(Array.from(scanned(animator).getLockedDoorMarkers([ZONE]).values())).toEqual([{ x: 160, y: 176 }]);
    });

    it("marks a vertical door in the middle of what is seen of it", () => {
        // Door centred on x = 128, 112..144 x 160..224, on the left edge of the zone. Its last 12 px are under the joint
        // of the vertex below: the door is seen from 160 to 212.
        const { animator } = makeAnimator("porte-v-gris-haut", 96, 160);
        const zone = { x: 128, y: 160, width: 128, height: 64 };
        expect(Array.from(scanned(animator).getLockedDoorMarkers([zone]).values())).toEqual([{ x: 128, y: 186 }]);
    });

    it("marks the two pieces of a door once", () => {
        expect(Array.from(scanned(makeDoubleDoor()).getLockedDoorMarkers([ZONE]).values())).toEqual([
            { x: 160, y: 176 },
        ]);
    });

    it("does not mark a door outside every locked zone", () => {
        const { animator } = makeAnimator();
        const far = { x: 1_000, y: 1_000, width: 64, height: 64 };
        expect(scanned(animator).getLockedDoorMarkers([far]).size).toBe(0);
    });

    it("marks nothing without a locked zone", () => {
        const { animator } = makeAnimator();
        expect(scanned(animator).getLockedDoorMarkers([]).size).toBe(0);
    });

    it("marks a door once when it belongs to two locked zones", () => {
        const { animator } = makeAnimator();
        const north = { x: 96, y: 32, width: 128, height: 128 };
        expect(scanned(animator).getLockedDoorMarkers([ZONE, north]).size).toBe(1);
    });
});
