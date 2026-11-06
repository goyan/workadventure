import type * as Phaser from "phaser";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import type * as SwimwearModule from "../../../../src/front/Phaser/Entity/Swimwear";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import { SwimwearEffect } from "../../../../src/front/Phaser/Entity/SwimwearEffect";
import { Swimwear } from "../../../../src/front/Phaser/Entity/Swimwear";

vi.mock("../../../../src/front/Phaser/Entity/Swimwear", async (original) => ({
    ...(await original<typeof SwimwearModule>()),
    loadSwimwearAssets: (): Promise<unknown> => Promise.resolve({}),
    getSwimwearTexture: (): string => "native-swimwear",
}));

describe("native swimsuit binding", () => {
    it("copies all walking and idle transforms, crops in water and restores clothes on exit", async () => {
        const outfit = mock<Phaser.GameObjects.Sprite>();
        outfit.setTexture.mockReturnValue(outfit);
        outfit.setOrigin.mockReturnValue(outfit);
        outfit.setPosition.mockReturnValue(outfit);
        outfit.setAngle.mockReturnValue(outfit);
        outfit.setScale.mockReturnValue(outfit);
        outfit.setFlip.mockReturnValue(outfit);
        outfit.setAlpha.mockReturnValue(outfit);
        const scene = mock<GameScene>();
        const factory = mock<Phaser.GameObjects.GameObjectFactory>();
        factory.sprite.mockReturnValue(outfit);
        scene.add = factory;
        const body = mock<Phaser.GameObjects.Sprite>();
        body.texture = mock<Phaser.Textures.Texture>({ key: "body3" });
        body.x = 2;
        body.y = -4;
        body.angle = 12;
        body.originX = 0.5;
        body.originY = 0.75;
        body.scaleX = 1.2;
        body.scaleY = 0.9;
        body.flipX = true;
        body.flipY = false;
        body.alpha = 0.8;
        body.visible = true;
        const clothes = mock<Phaser.GameObjects.Sprite>({ visible: false });
        const sprites = new Map([
            ["body3", body],
            ["clothes2", clothes],
        ]);
        const effect = new SwimwearEffect(scene, mock<Phaser.GameObjects.Container>());
        await Promise.resolve();
        for (const frame of ["0", "1", "2", "4", "7", "10", "1", "1"]) {
            body.frame = mock<Phaser.Textures.Frame>({ name: frame });
            effect.update(true, false, sprites, Swimwear.TwoPiece);
            expect(outfit.setTexture.mock.calls.at(-1)).toEqual(["native-swimwear", frame]);
            expect(outfit.setPosition.mock.calls.at(-1)).toEqual([2, -4]);
            expect(outfit.setOrigin.mock.calls.at(-1)).toEqual([0.5, 0.75]);
            expect(outfit.setAngle.mock.calls.at(-1)).toEqual([12]);
            expect(outfit.setScale.mock.calls.at(-1)).toEqual([1.2, 0.9]);
            expect(outfit.setFlip.mock.calls.at(-1)).toEqual([true, false]);
            expect(outfit.setAlpha.mock.calls.at(-1)).toEqual([0.8]);
        }
        effect.update(true, true, sprites, Swimwear.TwoPiece);
        expect(outfit.setCrop.mock.calls.at(-1)).toEqual([0, 0, 32, 20]);
        effect.update(false, false, sprites, Swimwear.TwoPiece);
        expect(body.setVisible.mock.calls.at(-1)).toEqual([true]);
        expect(clothes.setVisible.mock.calls.at(-1)).toEqual([false]);
        expect(outfit.setVisible.mock.calls.at(-1)).toEqual([false]);
        effect.destroy();
        expect(outfit.destroy.mock.calls).toHaveLength(1);
    });
});
