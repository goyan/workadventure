import { describe, expect, it } from "vitest";
import { TreeFireState } from "@wa/front/Phaser/Game/Fire/TreeFireState";
import { GROW_STEPS, growShare, growStep, lyingWay } from "@wa/front/Phaser/Game/Nature/FallenTreeTexture";
import {
    isPalm,
    LYING_DEPTH,
    lyingLayout,
    lyingVector,
    treeBodyOf,
} from "@wa/front/Phaser/Game/Nature/FallenTreeShape";
import { FALL_MS, fallTilt, leaningImage, lyingShare, turnedShare } from "@wa/front/Phaser/Game/Nature/FallenTreeView";

/**
 * An image of a tree of the map as its catalogue draws it (76 × 126, as "Nature:tree-2-10"): leaves from row 4 to row
 * 95, a trunk 8 pixels wide from row 88 to row 120 around column 38, the shadow painted under it from row 117 to 125.
 */
function treeImage(): Uint8ClampedArray {
    const width = 76;
    const height = 126;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const paint = (column: number, row: number, rgb: [number, number, number]) => {
        pixels.set([...rgb, 255], (row * width + column) * 4);
    };
    for (let row = 117; row < 126; row++) for (let column = 20; column < 58; column++) paint(column, row, [50, 50, 55]);
    for (let row = 88; row <= 120; row++)
        for (let column = 34; column < 42; column++) paint(column, row, [110, 70, 40]);
    for (let row = 4; row <= 95; row++) {
        const half = Math.min(34, (row - 4) * 0.6 + 2);
        for (let column = Math.round(38 - half); column < Math.round(38 + half); column++) {
            if (row > 88 && column >= 34 && column < 42) continue;
            paint(column, row, [60, 140, 60]);
        }
    }
    return pixels;
}

const told = (trees: { id: string; fire: number; damage: number; fallen: number }[], whole = false) => ({
    trees,
    whole,
    embers: [],
});

/**
 * A palm as the catalogue draws it (106 × 144, as "Nature:nature-4"): a trunk 10 pixels wide from row 45 to row 130,
 * a tuft of fronds from row 2 to row 85 hanging round its top, the trunk seen between them.
 */
function palmImage(): Uint8ClampedArray {
    const width = 106;
    const height = 144;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const paint = (column: number, row: number, rgb: [number, number, number]) => {
        pixels.set([...rgb, 255], (row * width + column) * 4);
    };
    for (let row = 2; row <= 85; row++) {
        const half = row < 45 ? Math.min(52, 10 + row) : 52 - (row - 45);
        for (let column = 53 - half; column < 53 + half; column++) {
            if (row >= 45 && Math.abs(column - 53) < 14) continue;
            paint(column, row, [70, 150, 50]);
        }
    }
    for (let row = 45; row <= 130; row++)
        for (let column = 48; column < 58; column++) paint(column, row, [150, 100, 60]);
    return pixels;
}

describe("a tree the wind laid down, as the browser draws it", () => {
    it("lies the way the wind blew, uncharred, then grows back from a sapling as the server tells it", () => {
        const state = new TreeFireState();
        // Laid down by a wind from the east (90 degrees, told 91): it lies towards the west.
        state.receive(told([{ id: "oak", fire: 0, damage: 16, fallen: 91 }]), 0);
        expect(state.fallenOf("oak")).toEqual({ toward: 270, lying: true, grown: 0 });
        expect(state.degreeOf("oak")).toBe(0);
        state.receive(told([{ id: "oak", fire: 0, damage: 4, fallen: 91 }]), 1);
        expect(state.fallenOf("oak")).toEqual({ toward: 270, lying: false, grown: 0.75 });
        state.receive(told([{ id: "oak", fire: 0, damage: 0, fallen: 0 }]), 2);
        expect(state.fallenOf("oak")).toBeUndefined();
    });

    it("keeps a charred tree charred and standing", () => {
        const state = new TreeFireState();
        state.receive(told([{ id: "pine", fire: 0, damage: 16, fallen: 0 }]), 0);
        expect(state.fallenOf("pine")).toBeUndefined();
        expect(state.degreeOf("pine")).toBe(4);
    });

    it("grows back in GROW_STEPS sizes, from a sapling to its own size", () => {
        expect(growStep(0.01)).toBe(1);
        expect(growStep(0.5)).toBe(GROW_STEPS / 2);
        expect(growStep(1)).toBe(GROW_STEPS);
        expect(growShare(1)).toBeCloseTo(0.15 + 0.85 / GROW_STEPS);
        expect(growShare(GROW_STEPS)).toBe(1);
    });

    it("lies foreshortened up and down the screen, at its length across it, in one of 16 ways", () => {
        expect(lyingVector(90).x).toBeCloseTo(1);
        expect(lyingVector(90).y).toBeCloseTo(0);
        expect(lyingVector(180).x).toBeCloseTo(0);
        expect(lyingVector(180).y).toBeCloseTo(LYING_DEPTH);
        expect(lyingVector(0).y).toBeCloseTo(-LYING_DEPTH);
        expect(lyingWay(0)).toBe(0);
        expect(lyingWay(181)).toBe(180);
        expect(lyingWay(350)).toBe(0);
        expect(lyingWay(-90)).toBe(270);
    });

    it("finds the foot of a tree of the map at the bottom of its trunk, not at the bottom of its image", () => {
        const body = treeBodyOf(treeImage(), 76, 126);
        expect(body.footX).toBeCloseTo(38, 0);
        expect(body.footY).toBe(121);
        expect(body.crownTop).toBe(4);
        expect(body.crownBottom).toBe(95);
        expect(body.trunkTop).toBe(96);
        expect(body.trunkWidth).toBeCloseTo(8, 0);
        expect(body.crownRows).toHaveLength(92);
    });

    it("lays a tree down the screen shortened, its crown under its foot, its roots drawn first", () => {
        const body = treeBodyOf(treeImage(), 76, 126);
        const south = lyingLayout(body, 180);
        expect(south.tip.x).toBeCloseTo(0);
        expect(south.tip.y).toBeCloseTo((121 - 4) * LYING_DEPTH);
        expect(south.centre.y).toBeGreaterThan(0);
        expect(south.crownFirst).toBe(false);
        // Its crown on the ground: its own outline as it stood, a little wider, its length shortened.
        const xs = south.outline.map((point) => point.x);
        const ys = south.outline.map((point) => point.y);
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(68);
        expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo((95 - 4) * LYING_DEPTH, 0);
        // Its top, narrow, lies farthest from its foot.
        const far = south.outline.filter((point) => point.y > Math.max(...ys) - 3);
        expect(Math.max(...far.map((point) => point.x)) - Math.min(...far.map((point) => point.x))).toBeLessThan(10);
        const north = lyingLayout(body, 0);
        expect(north.centre.y).toBeLessThan(0);
        // Up the screen, a bit of trunk shows past the plate of roots standing in front of it, before the crown.
        const crownStart = Math.max(...north.outline.map((point) => point.y));
        expect(north.plate.y - north.plate.height - crownStart).toBeGreaterThanOrEqual(8);
        // The plate: about twice and a half as wide as the trunk.
        expect(2 * north.plate.width).toBeCloseTo(8 * 2.3, 0);
        expect(north.crownFirst).toBe(true);
        const east = lyingLayout(body, 90);
        // Across the screen, a half tree: only the half of its crown above the trunk, the other pressed into the ground.
        expect(Math.max(...east.outline.map((point) => point.y))).toBeLessThan(1);
        expect(Math.min(...east.outline.map((point) => point.y))).toBeLessThan(-20);
        expect(east.tip.x).toBeCloseTo(121 - 4);
        expect(east.tip.y).toBeCloseTo(0);
        // A bare crown lying: a limb and seven branches, each with a twig; across the screen, all above the trunk.
        expect(east.branches).toEqual([]);
        const bareEast = lyingLayout(body, 90, "bare");
        const bareSouth = lyingLayout(body, 180, "bare");
        expect(bareEast.branches).toHaveLength(1 + 2 * 7);
        expect(Math.max(...bareEast.branches.flatMap((branch) => [branch.from.y, branch.to.y]))).toBeLessThan(1);
        expect(bareSouth.branches.some((branch) => branch.to.x > 5)).toBe(true);
        expect(bareSouth.branches.some((branch) => branch.to.x < -5)).toBe(true);
        // The hole beside the plate, no larger than it.
        expect(south.pit.width).toBeLessThanOrEqual(south.plate.width);
        // The plate of roots seen face on when the tree lies up or down the screen, edge on across it.
        expect(south.plate.width).toBeGreaterThan(2 * east.plate.width);
        expect(south.plate.y).toBeLessThan(0);
    });

    it("is seen falling only when it fell before the eyes of this player, not when found lying", () => {
        const state = new TreeFireState();
        state.receive(told([{ id: "oak", fire: 0, damage: 16, fallen: 91 }], true), 1000);
        expect(state.fellAt("oak")).toBeUndefined();
        state.receive(told([{ id: "elm", fire: 0, damage: 16, fallen: 1 }]), 2000);
        expect(state.fellAt("elm")).toBe(2000);
        // Told again lying: it still fell then.
        state.receive(told([{ id: "elm", fire: 0, damage: 16, fallen: 1 }]), 2500);
        expect(state.fellAt("elm")).toBe(2000);
        state.receive(told([{ id: "elm", fire: 0, damage: 8, fallen: 1 }]), 3000);
        expect(state.fellAt("elm")).toBeUndefined();
    });

    it("falls faster and faster to the ground in FALL_MS, bounces a little, then lies", () => {
        expect(fallTilt(0)).toBe(0);
        const quarter = fallTilt(FALL_MS / 4);
        const half = fallTilt(FALL_MS / 2);
        expect(half).toBeGreaterThan(2 * quarter);
        expect(fallTilt(FALL_MS - 1)).toBeCloseTo(Math.PI / 2, 2);
        expect(fallTilt(FALL_MS + 160)).toBeLessThan(Math.PI / 2);
        expect(fallTilt(FALL_MS + 5000)).toBe(Math.PI / 2);
    });

    it("draws a tree falling east turned on its foot, one falling south shortened then laid down the screen", () => {
        const east = leaningImage(90, Math.PI / 4);
        expect(east.rotation).toBeCloseTo(Math.PI / 4);
        expect(east.scaleY).toBeCloseTo(1);
        const south = leaningImage(180, Math.PI / 6);
        expect(south.rotation).toBeCloseTo(0);
        expect(south.scaleY).toBeCloseTo(Math.cos(Math.PI / 6) - LYING_DEPTH * Math.sin(Math.PI / 6));
        // On the ground: as long as the tree lying (lyingVector).
        const lying = leaningImage(180, Math.PI / 2);
        expect(Math.abs(lying.rotation)).toBeCloseTo(Math.PI);
        expect(lying.scaleY).toBeCloseTo(LYING_DEPTH);
    });

    it("hands over to the tree lying during the bounce", () => {
        expect(lyingShare(0)).toBe(0);
        expect(lyingShare(FALL_MS)).toBe(0);
        expect(lyingShare(FALL_MS + 160)).toBeCloseTo(0.5);
        expect(lyingShare(FALL_MS + 5000)).toBe(1);
    });

    it("never shows a tree falling towards the player upside down: the tree lying takes over before", () => {
        // Falling south: its standing image shortens to nothing near atan(1 / LYING_DEPTH), then would turn over.
        const turn = Math.atan(1 / LYING_DEPTH);
        expect(turnedShare(180, turn - 0.3)).toBe(0);
        expect(turnedShare(180, turn)).toBeCloseTo(0.5, 1);
        expect(turnedShare(180, turn + 0.3)).toBe(1);
        expect(leaningImage(180, turn + 0.3).rotation).toBeCloseTo(Math.PI);
        // Across the screen or away from the player: the standing image is never upside down.
        expect(turnedShare(90, Math.PI / 2)).toBe(0);
        expect(turnedShare(0, Math.PI / 2)).toBe(0);
    });

    it("tells a palm by its shape: its trunk seen up to 60 % of its height and more, its fronds at its top", () => {
        const palm = treeBodyOf(palmImage(), 106, 144);
        expect(isPalm(palm)).toBe(true);
        expect(isPalm(treeBodyOf(treeImage(), 76, 126))).toBe(false);
        // Lying across the screen: its fronds from the top of its trunk, all on the side of the sky, arched.
        const east = lyingLayout(palm, 90, "palm");
        // Its trunk is read as wood from a bit over a third of the image down (treePixelPart): row 51 to its foot.
        expect(east.trunkEnd.x).toBeCloseTo(131 - 51, 0);
        expect(east.fronds.length).toBeGreaterThanOrEqual(5);
        for (const frond of east.fronds) {
            expect(frond[0].x).toBeCloseTo(east.trunkEnd.x, 0);
            expect(Math.max(...frond.map((point) => point.y))).toBeLessThan(1);
        }
        // Up or down the screen: fronds to both sides.
        const south = lyingLayout(palm, 180, "palm");
        expect(south.fronds.some((frond) => frond[frond.length - 1].x > 20)).toBe(true);
        expect(south.fronds.some((frond) => frond[frond.length - 1].x < -20)).toBe(true);
    });
});
