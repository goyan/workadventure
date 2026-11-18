import * as Phaser from "phaser";
import { describe, expect, it, vi } from "vitest";
import {
    isSwayingTree,
    swayAmplitude,
    swayFrequency,
    treeSwayAngle,
    TreeSway,
} from "../../../../../src/front/Phaser/Game/Nature/TreeSway";

describe("treeSwayAngle", () => {
    it("sways more and faster as the wind blows harder, within bounds", () => {
        expect(swayAmplitude(5)).toBeLessThan(swayAmplitude(20));
        expect(swayAmplitude(20)).toBeLessThan(swayAmplitude(50));
        expect(swayAmplitude(0)).toBeGreaterThan(0);
        expect(swayAmplitude(200)).toBe(swayAmplitude(80));
        expect(swayAmplitude(200)).toBeLessThanOrEqual(4);
        expect(swayFrequency(5)).toBeLessThan(swayFrequency(50));
    });

    it("never leans further than the amplitude, and each tree in its own time", () => {
        let widest = 0;
        for (let tenth = 0; tenth < 200; tenth++) {
            widest = Math.max(widest, Math.abs(treeSwayAngle(tenth / 10, 30, 0.2)));
        }
        expect(widest).toBeLessThanOrEqual(swayAmplitude(30) + 1e-9);
        expect(widest).toBeGreaterThan(swayAmplitude(30) / 2);
        expect(treeSwayAngle(3, 30, 0.2)).not.toBe(treeSwayAngle(3, 30, 0.7));
    });
});

describe("isSwayingTree", () => {
    it("sways the trees of the nature catalogue only", () => {
        expect(isSwayingTree("Nature:tree-oak")).toBe(true);
        expect(isSwayingTree("Nature:bush-small")).toBe(false);
        expect(isSwayingTree("Office:plant")).toBe(false);
    });
    it("sways the snowy, seasonal and big trees too, but not stumps, rocks, bushes or grass", () => {
        for (const id of [
            "Nature:seasonal-1:Default:Down",
            "Nature:snow-tree-3:Default:Down",
            "Nature:snow-evergreen-10:Default:Down",
            "Nature:winter-auto-2:Default:Down",
            "Nature:nature-1:Default:Down",
            "Nature:nature-6:Default:Down",
        ])
            expect(isSwayingTree(id)).toBe(true);
        for (const id of [
            "Nature:nature-7:Default:Down",
            "Nature:nature-12:Default:Down",
            "Nature:snow-detail-1:Default:Down",
            "Nature:detail-rocks-2:Default:Down",
        ])
            expect(isSwayingTree(id)).toBe(false);
    });
});

describe("TreeSway", () => {
    function fixture(enabled = true, reducedMotion = false, readable = true) {
        const events = new Phaser.Events.EventEmitter();
        const markDirty = vi.fn();
        const scene = { events, markDirty } as unknown as Phaser.Scene & { markDirty(): void };
        const tree = {
            x: 100,
            scaleX: 1,
            texture: { key: "oak.png" },
            setTexture(key: string) {
                this.texture = { key };
            },
        };
        const sway = new TreeSway(scene, {
            trees: () => [{ id: "oak", object: tree }],
            windSpeed: () => 80,
            // A west wind: the tree leans to the right.
            windFrom: () => 270,
            enabled: () => enabled,
            poseTexture: (key, pose) => (readable ? `${key}@${pose}` : undefined),
            reducedMotion,
        });
        return { events, markDirty, tree, sway };
    }

    it("shows the bent image of the tree just for the drawing, then gives it its own back", () => {
        const { events, markDirty, tree, sway } = fixture();
        sway.update(0, 1_234_567);
        expect(markDirty).toHaveBeenCalled();
        const pose = sway.poseOf("oak");
        expect(pose).toBeGreaterThan(0);
        events.emit(Phaser.Scenes.Events.PRE_RENDER);
        expect(tree.texture.key).toBe(`oak.png@${pose}`);
        // The bent image has room on each side: the trunk stays where the tree stands.
        expect(tree.x).toBe(100 - 4);
        events.emit(Phaser.Scenes.Events.RENDER);
        expect(tree.texture.key).toBe("oak.png");
        expect(tree.x).toBe(100);
        sway.destroy();
    });

    it("draws the map again only when a tree changes pose", () => {
        const { markDirty, sway } = fixture();
        sway.update(0, 1_234_567);
        const pose = sway.poseOf("oak");
        markDirty.mockClear();
        // A tenth of a second later the tree is still in the same pose.
        sway.update(100, 1_234_567 + 100);
        expect(sway.poseOf("oak")).toBe(pose);
        expect(markDirty).not.toHaveBeenCalled();
    });

    it("leaves a tree whose image cannot be bent as it is", () => {
        const { events, tree, sway } = fixture(true, false, false);
        sway.update(0, 1_234_567);
        events.emit(Phaser.Scenes.Events.PRE_RENDER);
        expect(tree.texture.key).toBe("oak.png");
        expect(tree.x).toBe(100);
        events.emit(Phaser.Scenes.Events.RENDER);
        sway.destroy();
    });

    it.each([
        ["while editing the map", false, false],
        ["with reduced motion", true, true],
    ])("keeps the trees still %s", (_, enabled, reduced) => {
        const { events, tree, sway } = fixture(enabled, reduced);
        sway.update(0, 1_234_567);
        expect(sway.poseOf("oak")).toBe(0);
        events.emit(Phaser.Scenes.Events.PRE_RENDER);
        expect(tree.texture.key).toBe("oak.png");
        events.emit(Phaser.Scenes.Events.RENDER);
        sway.destroy();
    });
});
