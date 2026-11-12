import * as Phaser from "phaser";
import { PositionMessage_Direction } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";
import { TorchFlameEffect } from "../../../../../src/front/Phaser/Game/Torch/TorchFlameEffect";

describe("TorchFlameEffect", () => {
    it("holds a torch in the hand, its flame drawn in the shape it has now, and hides it when put away", () => {
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

        const still = { sway: 0, height: 1, width: 1, ember: undefined };
        effect.update(true, PositionMessage_Direction.RIGHT, false, still);
        expect(flame.visible).toBe(true);
        expect({ x: flame.x, y: flame.y }).toEqual({ x: 5, y: -4 });
        // The handle is drawn downwards from the base of the flame, the flame upwards.
        expect({ x: stick.x, y: stick.y }).toEqual({ x: flame.x, y: flame.y });
        const drawnStill = JSON.stringify(flame.commandBuffer);
        effect.update(true, PositionMessage_Direction.LEFT, false, still);
        expect(flame.x).toBe(-5);
        // The same shape is not drawn again.
        expect(JSON.stringify(flame.commandBuffer)).toBe(drawnStill);

        // A flame that sways and stretches is drawn again, its tip leaning over and higher than before.
        effect.update(true, PositionMessage_Direction.LEFT, false, {
            sway: 1.5,
            height: 1.1,
            width: 0.9,
            ember: undefined,
        });
        expect(JSON.stringify(flame.commandBuffer)).not.toBe(drawnStill);
        const withEmber = { sway: 0, height: 1, width: 1, ember: { x: 1, y: -14, alpha: 0.5 } };
        effect.update(true, PositionMessage_Direction.LEFT, false, withEmber);
        expect(flame.commandBuffer.length).toBeGreaterThan(JSON.parse(drawnStill).length);

        effect.update(false, PositionMessage_Direction.DOWN, false, still);
        expect(stick.visible).toBe(false);
        expect(flame.visible).toBe(false);
        effect.destroy();
        expect(stick.scene).toBeUndefined();
        expect(flame.scene).toBeUndefined();
    });
});
