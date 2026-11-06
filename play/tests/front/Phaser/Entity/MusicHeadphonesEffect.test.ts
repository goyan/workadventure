import type * as Phaser from "phaser";
import { PositionMessage_Direction } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";
import {
    headFrameOffset,
    isHumanAvatar,
    MusicHeadphonesEffect,
} from "../../../../src/front/Phaser/Entity/MusicHeadphonesEffect";

describe("music headphones", () => {
    it("tracks head movement between animation frames, including sideways shifts", () => {
        const still = new Uint8ClampedArray(32 * 20 * 4);
        const step = new Uint8ClampedArray(32 * 20 * 4);
        for (let y = 3; y < 14; y++) {
            for (let x = 12; x < 20; x++) {
                const pixel = [x * 5, y * 5, 120, 255];
                still.set(pixel, (y * 32 + x) * 4);
                step.set(pixel, ((y + 1) * 32 + x - 1) * 4);
            }
        }
        expect(headFrameOffset(step, still)).toEqual({ x: -1, y: 1 });
        expect(headFrameOffset(still, still)).toEqual({ x: 0, y: 0 });
    });
    it("recognizes human catalog bodies, without treating animals or accessories as human", () => {
        expect(isHumanAvatar(["female2"])).toBe(true);
        expect(isHumanAvatar(["male1"])).toBe(true);
        expect(isHumanAvatar(["body3", "hair7"])).toBe(true);
        expect(isHumanAvatar(["duck", "hair7", "hat1"])).toBe(false);
        expect(isHumanAvatar(["cat"])).toBe(false);
        expect(isHumanAvatar([])).toBe(false);
    });

    it("follows the head through all orientations and poses, then hides when playback stops", () => {
        const graphics = mock<Phaser.GameObjects.Graphics>();
        graphics.fillStyle.mockReturnValue(graphics);
        graphics.fillRect.mockReturnValue(graphics);
        graphics.setPosition.mockReturnValue(graphics);
        const scene = mock<Phaser.Scene>();
        const factory = mock<Phaser.GameObjects.GameObjectFactory>();
        factory.graphics.mockReturnValue(graphics);
        scene.add = factory;
        const body = mock<Phaser.GameObjects.Sprite>();
        body.texture = mock<Phaser.Textures.Texture>();
        body.frame = mock<Phaser.Textures.Frame>();
        body.x = 2;
        body.y = -4;
        body.angle = 12;
        const effect = new MusicHeadphonesEffect(scene, mock<Phaser.GameObjects.Container>());
        for (const direction of [
            PositionMessage_Direction.DOWN,
            PositionMessage_Direction.LEFT,
            PositionMessage_Direction.RIGHT,
            PositionMessage_Direction.UP,
        ]) {
            effect.update(true, direction, body);
            expect(graphics.setVisible.mock.calls.at(-1)).toEqual([true]);
            expect(graphics.setPosition.mock.calls.at(-1)).toEqual([2, -4]);
            expect(graphics.setAngle.mock.calls.at(-1)).toEqual([12]);
        }
        const draws = graphics.clear.mock.calls.length;
        effect.update(true, PositionMessage_Direction.UP, body);
        expect(graphics.clear.mock.calls).toHaveLength(draws);
        effect.update(false, PositionMessage_Direction.UP, body);
        expect(graphics.setVisible.mock.calls.at(-1)).toEqual([false]);
        effect.update(true, PositionMessage_Direction.UP);
        expect(graphics.setVisible.mock.calls.at(-1)).toEqual([false]);
        effect.destroy();
        expect(graphics.destroy.mock.calls).toHaveLength(1);
    });
});
