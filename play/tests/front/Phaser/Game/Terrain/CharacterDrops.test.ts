import { describe, expect, it } from "vitest";
import * as Phaser from "phaser";
import { CharacterDrops } from "../../../../../src/front/Phaser/Game/Terrain/CharacterDrops";

function fakeScene() {
    const handlers = new Map<string, (() => void)[]>();
    return {
        events: {
            on: (event: string, handler: () => void) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
            off: (event: string, handler: () => void) =>
                handlers.set(
                    event,
                    (handlers.get(event) ?? []).filter((each) => each !== handler),
                ),
        },
        emit: (event: string) => (handlers.get(event) ?? []).forEach((handler) => handler()),
    };
}

describe("the characters drawn lower in the hollows", () => {
    it("are moved down only while the image is drawn", () => {
        const scene = fakeScene();
        const avatar = { y: 100, getGroundDrop: () => 64 };
        const other = { y: 300, getGroundDrop: () => 0 };
        const drops = new CharacterDrops(scene as never, () => [avatar, other]);
        scene.emit(Phaser.Scenes.Events.PRE_RENDER);
        expect(avatar.y).toBe(164);
        expect(other.y).toBe(300);
        scene.emit(Phaser.Scenes.Events.RENDER);
        expect(avatar.y).toBe(100);
        drops.destroy();
        scene.emit(Phaser.Scenes.Events.PRE_RENDER);
        expect(avatar.y).toBe(100);
    });

    it("puts back the place it moved even if the drop changed meanwhile", () => {
        const scene = fakeScene();
        let drop = 64;
        const avatar = { y: 100, getGroundDrop: () => drop };
        new CharacterDrops(scene as never, () => [avatar]);
        scene.emit(Phaser.Scenes.Events.PRE_RENDER);
        drop = 10;
        scene.emit(Phaser.Scenes.Events.RENDER);
        expect(avatar.y).toBe(100);
    });
});
