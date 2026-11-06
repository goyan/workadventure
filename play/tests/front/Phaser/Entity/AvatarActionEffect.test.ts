import type * as Phaser from "phaser";
import { PositionMessage_Direction } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";
import { AvatarAction } from "../../../../src/front/Phaser/Entity/AvatarAction";
import { AvatarActionEffect } from "../../../../src/front/Phaser/Entity/AvatarActionEffect";

function setup(): {
    effect: AvatarActionEffect;
    sprite: ReturnType<typeof mock<Phaser.GameObjects.Sprite>>;
    graphics: ReturnType<typeof mock<Phaser.GameObjects.Graphics>>;
} {
    const graphics = mock<Phaser.GameObjects.Graphics>();
    graphics.fillStyle.mockReturnValue(graphics);
    graphics.lineStyle.mockReturnValue(graphics);
    graphics.strokeRect.mockReturnValue(graphics);
    graphics.lineBetween.mockReturnValue(graphics);
    const scene = mock<Phaser.Scene>();
    const factory = mock<Phaser.GameObjects.GameObjectFactory>();
    factory.graphics.mockReturnValue(graphics);
    scene.add = factory;
    const sprite = mock<Phaser.GameObjects.Sprite>();
    sprite.anims = mock<Phaser.Animations.AnimationState>();
    const container = mock<Phaser.GameObjects.Container>();
    return { effect: new AvatarActionEffect(scene, container), sprite, graphics };
}

describe("avatar action lifecycle", () => {
    it("animates every layer facing the requested direction and resets its transform when stopped", () => {
        const { effect, sprite, graphics } = setup();
        effect.update(AvatarAction.Dance, 150, [sprite], false, PositionMessage_Direction.RIGHT);
        expect(sprite.setFrame.mock.calls).toEqual([[7]]);
        expect(sprite.setAngle.mock.calls.at(-1)).toEqual([12]);
        effect.update(AvatarAction.Sleep, 150, [sprite], false, PositionMessage_Direction.RIGHT);
        expect(sprite.setAngle.mock.calls.at(-1)).toEqual([90]);
        effect.update(AvatarAction.Idle, 150, [sprite], false, PositionMessage_Direction.RIGHT);
        expect(sprite.setAngle.mock.calls.at(-1)).toEqual([0]);
        expect(sprite.setPosition.mock.calls.at(-1)).toEqual([0, 0]);
        expect(graphics.clear.mock.calls).toHaveLength(3);
        effect.destroy();
        expect(graphics.destroy.mock.calls).toHaveLength(1);
    });

    it("covers the lower body with opaque pixels while using the toilet and clears them on exit", () => {
        const { effect, sprite, graphics } = setup();
        effect.update(AvatarAction.Toilet, 0, [sprite], false, PositionMessage_Direction.DOWN);
        expect(graphics.fillRect.mock.calls).toHaveLength(30);
        expect(graphics.fillStyle.mock.calls.every((call) => call[1] === undefined)).toBe(true);
        effect.update(AvatarAction.Idle, 0, [sprite], false, PositionMessage_Direction.DOWN);
        expect(graphics.clear.mock.calls).toHaveLength(2);
        expect(graphics.fillRect.mock.calls).toHaveLength(30);
    });
});
