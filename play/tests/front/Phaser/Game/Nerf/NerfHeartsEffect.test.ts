import * as Phaser from "phaser";
import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";
import { NerfHeartsEffect } from "../../../../../src/front/Phaser/Game/Nerf/NerfHeartsEffect";
import { heartPixels } from "../../../../../src/front/Phaser/Game/Nerf/NerfHeartShape";

describe("NerfHeartsEffect", () => {
    it("shows a row of hearts above an equipped avatar and hides it otherwise", () => {
        const scene = mock<Phaser.Scene>();
        scene.sys = mock<Phaser.Scenes.Systems>();
        scene.sys.displayList = mock<Phaser.GameObjects.DisplayList>();
        const row = new Phaser.GameObjects.Graphics(scene);
        scene.add = mock<Phaser.GameObjects.GameObjectFactory>({ graphics: () => row });
        const container = mock<Phaser.GameObjects.Container>();
        const effect = new NerfHeartsEffect(scene, container);
        expect(container.add.mock.calls).toEqual([[row]]);
        expect(row.visible).toBe(false);
        effect.update(15, true);
        expect(row.visible).toBe(true);
        expect(row.y).toBeLessThan(0);
        effect.update(undefined, true);
        expect(row.visible).toBe(false);
        effect.update(7, false);
        expect(row.visible).toBe(false);
        effect.destroy();
    });
});

describe("heartPixels", () => {
    it("fills more of the heart for each third", () => {
        const filled = ([0, 1, 2, 3] as const).map((fill) => heartPixels(fill).filter((pixel) => pixel.filled).length);
        expect(filled[0]).toBe(0);
        expect(filled[1]).toBeGreaterThan(filled[0]);
        expect(filled[2]).toBeGreaterThan(filled[1]);
        expect(filled[3]).toBeGreaterThan(filled[2]);
        expect(heartPixels(3).every((pixel) => pixel.filled)).toBe(true);
    });
});
