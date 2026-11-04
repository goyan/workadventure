import { describe, expect, it, vi } from "vitest";
import type * as Phaser from "phaser";
import type { Entity } from "../../../../../../src/front/Phaser/ECS/Entity";
import { mapLayerPrefabId } from "../../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
import { DOOR_SOUND_KEYS, DoorAnimator } from "../../../../../../src/front/Phaser/Game/MapEditor/MapLayer/DoorAnimator";
import type { DoorCharacter } from "../../../../../../src/front/Phaser/Game/MapEditor/MapLayer/DoorAnimator";

vi.mock("../../../../../../src/front/Phaser/Helpers/TexturesHelper", () => ({
    TexturesHelper: { loadEntityImage: () => Promise.resolve() },
}));

const FRAME_STEP_MS = 40;

// Left piece of a horizontal door at (128, 160): the door covers 128..192 x 160..192. Its frames are not in the
// catalog (getPrefab resolves to undefined): the door does not change its texture, but it still opens and closes.
// The local player stands in the room under the door: they hear it, whoever opens it.
function makeAnimator() {
    const prefabId = mapLayerPrefabId("Carte Portes", "porte-h-gris-g");
    const entity = {
        entityId: "door",
        x: 128,
        y: 160,
        depth: 0,
        texture: { key: "porte-h-gris-g.png" },
        getPrefab: () => ({ collectionName: "Carte Portes", id: prefabId, imagePath: "porte-h-gris-g.png" }),
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
