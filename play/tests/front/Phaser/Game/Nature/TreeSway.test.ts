import * as Phaser from "phaser";
import { describe, expect, it, vi } from "vitest";
import {
    isSwayingTree,
    swayAmplitude,
    swayFrequency,
    swayPose,
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

describe("swayPose", () => {
    it("turns the tree around the middle of its foot, which stays where it is", () => {
        const width = 64;
        const height = 96;
        const angle = (3 * Math.PI) / 180;
        const pose = swayPose(100, 200, width, height, angle);
        // The foot of the image, turned with it from its top left corner, lands on the foot of the still tree.
        const footX = pose.x + Math.cos(angle) * (width / 2) - Math.sin(angle) * height;
        const footY = pose.y + Math.sin(angle) * (width / 2) + Math.cos(angle) * height;
        expect(footX).toBeCloseTo(100 + width / 2, 9);
        expect(footY).toBeCloseTo(200 + height, 9);
        expect(pose.rotation).toBe(angle);
    });
});

describe("isSwayingTree", () => {
    it("sways the trees of the nature catalogue only", () => {
        expect(isSwayingTree("Nature:tree-oak")).toBe(true);
        expect(isSwayingTree("Nature:bush-small")).toBe(false);
        expect(isSwayingTree("Office:plant")).toBe(false);
    });
});

describe("TreeSway", () => {
    function fixture(enabled = true, reducedMotion = false) {
        const events = new Phaser.Events.EventEmitter();
        const markDirty = vi.fn();
        const scene = { events, markDirty } as unknown as Phaser.Scene & { markDirty(): void };
        const tree = { x: 100, y: 200, rotation: 0, displayWidth: 64, displayHeight: 96 };
        const sway = new TreeSway(scene, {
            trees: () => [{ id: "oak", object: tree }],
            windSpeed: () => 40,
            enabled: () => enabled,
            reducedMotion,
        });
        return { events, markDirty, tree, sway };
    }

    it("leans the tree just for the drawing, then puts it back where it stands", () => {
        const { events, markDirty, tree, sway } = fixture();
        sway.update(0, 1_234_567);
        expect(markDirty).toHaveBeenCalled();
        events.emit(Phaser.Scenes.Events.PRE_RENDER);
        expect(tree.rotation).not.toBe(0);
        expect(tree.x).not.toBe(100);
        events.emit(Phaser.Scenes.Events.RENDER);
        expect(tree).toEqual({ x: 100, y: 200, rotation: 0, displayWidth: 64, displayHeight: 96 });
        sway.destroy();
    });

    it.each([
        ["while editing the map", false, false],
        ["with reduced motion", true, true],
    ])("keeps the trees still %s", (_, enabled, reduced) => {
        const { events, tree, sway } = fixture(enabled, reduced);
        sway.update(0, 1_234_567);
        events.emit(Phaser.Scenes.Events.PRE_RENDER);
        expect(tree.rotation).toBe(0);
        events.emit(Phaser.Scenes.Events.RENDER);
        sway.destroy();
    });
});
