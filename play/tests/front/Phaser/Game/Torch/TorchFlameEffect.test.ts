import * as Phaser from "phaser";
import { PositionMessage_Direction } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";
import { TorchFlameEffect } from "../../../../../src/front/Phaser/Game/Torch/TorchFlameEffect";

describe("TorchFlameEffect", () => {
    it("holds a torch in the hand, its flame breathing with the flicker, and hides it when put away", () => {
        const scene = mock<Phaser.Scene>();
        scene.sys = mock<Phaser.Scenes.Systems>();
        scene.sys.displayList = mock<Phaser.GameObjects.DisplayList>();
        const drawn: Phaser.GameObjects.Graphics[] = [];
        scene.add = mock<Phaser.GameObjects.GameObjectFactory>({
            graphics: () => {
                const graphics = new Phaser.GameObjects.Graphics(scene);
                drawn.push(graphics);
                return graphics;
            },
        });
        const container = mock<Phaser.GameObjects.Container>();
        const effect = new TorchFlameEffect(scene, container);
        const [stick, flame] = drawn;
        expect(container.add.mock.calls).toEqual([[stick], [flame]]);
        expect(stick.visible).toBe(false);
        expect(flame.visible).toBe(false);

        effect.update(true, PositionMessage_Direction.RIGHT, false, 1);
        expect(flame.visible).toBe(true);
        expect({ x: flame.x, y: flame.y }).toEqual({ x: 5, y: -4 });
        // The handle is drawn downwards from the base of the flame, the flame upwards.
        expect({ x: stick.x, y: stick.y }).toEqual({ x: flame.x, y: flame.y });
        const tall = flame.scaleY;
        effect.update(true, PositionMessage_Direction.LEFT, false, 0.8);
        expect(flame.x).toBe(-5);
        expect(flame.scaleY).toBeLessThan(tall);
        expect(flame.scaleY).toBeGreaterThan(0.8);

        effect.update(false, PositionMessage_Direction.DOWN, false, 1);
        expect(stick.visible).toBe(false);
        expect(flame.visible).toBe(false);
        effect.destroy();
        expect(stick.scene).toBeUndefined();
        expect(flame.scene).toBeUndefined();
    });
});
