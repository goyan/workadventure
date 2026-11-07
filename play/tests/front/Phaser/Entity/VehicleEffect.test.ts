import type * as Phaser from "phaser";
import { PositionMessage_Direction } from "@workadventure/messages";
import { describe, expect, it, vi } from "vitest";
import { mock, mockDeep } from "vitest-mock-extended";
import { VehicleEffect } from "@wa/front/Phaser/Vehicle/VehicleEffect";
import { readVehicleColors } from "@wa/front/Phaser/Vehicle/Vehicle";
import { vehicleHeading, turnVehicleTowards } from "@wa/front/Phaser/Vehicle/VehicleFrames";

describe("skateboard movement and lifetime", () => {
    it.each([
        [0, 1, 0],
        [-1, 1, 1],
        [-1, 0, 2],
        [-1, -1, 3],
        [0, -1, 4],
        [1, -1, 5],
        [1, 0, 6],
        [1, 1, 7],
    ])("maps %s,%s to heading %s", (x, y, heading) => {
        expect(vehicleHeading(x, y)).toBe(heading);
    });
    it("turns smoothly along the shortest route", () => {
        expect(turnVehicleTowards(7, 0, 42.5)).toBe(7.5);
        expect(turnVehicleTowards(0, 7, 85)).toBe(7);
    });
    it("keeps the board under the feet, independently tints its three parts, and releases sprites", () => {
        const scene = mockDeep<Phaser.Scene>();
        scene.textures.exists.mockReturnValue(true);
        scene.add.sprite.mockImplementation(() => {
            const sprite = mock<Phaser.GameObjects.Sprite>();
            sprite.setVisible.mockReturnValue(sprite);
            sprite.setFrame.mockReturnValue(sprite);
            sprite.setAngle.mockReturnValue(sprite);
            sprite.setTint.mockReturnValue(sprite);
            return sprite;
        });
        const container = mock<Phaser.GameObjects.Container>();
        Object.assign(container, { x: 0, y: 0 });
        const effect = new VehicleEffect(scene, container);
        effect.update(
            true,
            PositionMessage_Direction.DOWN,
            readVehicleColors({ color: "#112233", edgeColor: "#445566", wheelsColor: "#778899" }),
            false,
            0,
        );
        expect(scene.add.sprite.mock.calls.map((call) => call.slice(0, 2))).toEqual(
            Array.from({ length: 5 }, () => [0, 16]),
        );
        const results = scene.add.sprite.mock.results;
        expect(results.slice(1, 4).map((result) => vi.mocked(result.value.setTint).mock.lastCall)).toEqual([
            [0x445566],
            [0x112233],
            [0x778899],
        ]);
        effect.update(true, PositionMessage_Direction.DOWN, readVehicleColors(null), true, 70);
        expect(vi.mocked(results[0].value.setFrame).mock.lastCall).toEqual([8]);
        effect.update(true, PositionMessage_Direction.DOWN, readVehicleColors(null), true, 140);
        expect(vi.mocked(results[0].value.setFrame).mock.lastCall).toEqual([16]);
        effect.update(true, PositionMessage_Direction.DOWN, readVehicleColors(null), false, 210);
        expect(vi.mocked(results[0].value.setFrame).mock.lastCall).toEqual([0]);
        effect.destroy();
        for (const result of results) expect(vi.mocked(result.value.destroy).mock.calls).toHaveLength(1);
        expect(scene.textures.remove.mock.calls).toHaveLength(0);
    });
});
