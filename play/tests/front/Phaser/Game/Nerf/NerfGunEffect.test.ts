import * as Phaser from "phaser";
import { PositionMessage_Direction } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";
import { NerfGunEffect } from "../../../../../src/front/Phaser/Game/Nerf/NerfGunEffect";

describe("NerfGunEffect", () => {
    it("attaches an accessory to the avatar and hides it when unequipped", () => {
        const scene = mock<Phaser.Scene>();
        scene.sys = mock<Phaser.Scenes.Systems>();
        scene.sys.displayList = mock<Phaser.GameObjects.DisplayList>();
        const gun = new Phaser.GameObjects.Graphics(scene);
        scene.add = mock<Phaser.GameObjects.GameObjectFactory>({ graphics: () => gun });
        const container = mock<Phaser.GameObjects.Container>();
        const effect = new NerfGunEffect(scene, container);
        expect(container.add.mock.calls).toEqual([[gun]]);
        expect(gun.visible).toBe(false);
        effect.update(true, PositionMessage_Direction.RIGHT, false);
        expect(gun.visible).toBe(true);
        expect(gun.x).toBeGreaterThan(0);
        effect.update(true, PositionMessage_Direction.LEFT, false);
        expect(gun.x).toBeLessThan(0);
        expect(gun.scaleX).toBeLessThan(0);
        effect.update(true, PositionMessage_Direction.UP, false);
        expect(gun.rotation).toBe(-Math.PI / 2);
        effect.update(true, PositionMessage_Direction.DOWN, false);
        expect(gun.rotation).toBe(Math.PI / 2);
        effect.update(false, PositionMessage_Direction.DOWN, false);
        expect(gun.visible).toBe(false);
        effect.destroy();
        expect(gun.scene).toBeUndefined();
    });
});
