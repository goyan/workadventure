import type * as Phaser from "phaser";
import { PositionMessage_Direction } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";
import {
    drawHeadphonesFrame,
    headFrameOffset,
    isHumanAvatar,
    MusicHeadphonesEffect,
} from "../../../../src/front/Phaser/Entity/MusicHeadphonesEffect";

describe("music headphones", () => {
    it("centers the artwork on the human head's pixel column, with no independent origin", () => {
        const context = mock<CanvasRenderingContext2D>();
        drawHeadphonesFrame(context, PositionMessage_Direction.DOWN, { x: 0, y: 0 });
        expect(context.translate.mock.calls).toEqual([[17, 16]]);
        expect(context.save.mock.calls).toHaveLength(1);
        expect(context.restore.mock.calls).toHaveLength(1);
    });
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

    it("binds the same frame and transform through walking, stopping and poses without repositioning the accessory", () => {
        const accessory = mock<Phaser.GameObjects.Sprite>();
        accessory.setTexture.mockReturnValue(accessory);
        accessory.setOrigin.mockReturnValue(accessory);
        accessory.setPosition.mockReturnValue(accessory);
        accessory.setAngle.mockReturnValue(accessory);
        accessory.setScale.mockReturnValue(accessory);
        accessory.setFlip.mockReturnValue(accessory);
        accessory.setAlpha.mockReturnValue(accessory);
        const scene = mock<Phaser.Scene>();
        const factory = mock<Phaser.GameObjects.GameObjectFactory>();
        factory.sprite.mockReturnValue(accessory);
        scene.add = factory;
        const textures = mock<Phaser.Textures.TextureManager>();
        textures.exists.mockReturnValue(true);
        scene.textures = textures;
        const body = mock<Phaser.GameObjects.Sprite>();
        body.texture = mock<Phaser.Textures.Texture>({ key: "body3" });
        body.frame = mock<Phaser.Textures.Frame>();
        body.x = 2;
        body.y = -4;
        body.angle = 12;
        body.originX = 0.5;
        body.originY = 0.5;
        body.scaleX = 1;
        body.scaleY = 1;
        body.flipX = false;
        body.flipY = false;
        body.alpha = 0.8;
        const effect = new MusicHeadphonesEffect(scene, mock<Phaser.GameObjects.Container>());
        for (const frame of ["0", "1", "2", "1", "1", "1"]) {
            body.frame = mock<Phaser.Textures.Frame>({ name: frame });
            effect.update(true, body);
            expect(accessory.setTexture.mock.calls.at(-1)).toEqual(["music-headphones-body3", frame]);
            expect(accessory.setPosition.mock.calls.at(-1)).toEqual([2, -4]);
            expect(accessory.setOrigin.mock.calls.at(-1)).toEqual([0.5, 0.5]);
            expect(accessory.setAngle.mock.calls.at(-1)).toEqual([12]);
            expect(accessory.setAlpha.mock.calls.at(-1)).toEqual([0.8]);
            expect(accessory.setVisible.mock.calls.at(-1)).toEqual([true]);
        }
        effect.update(false, body);
        expect(accessory.setVisible.mock.calls.at(-1)).toEqual([false]);
        effect.update(true);
        expect(accessory.setVisible.mock.calls.at(-1)).toEqual([false]);
        effect.destroy();
        expect(accessory.destroy.mock.calls).toHaveLength(1);
    });
});
