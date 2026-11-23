import type * as Phaser from "phaser";
import { isFoliage, isPalm, lyingLayout, treeBodyOf } from "./FallenTreeShape";
import type { CrownKind, LyingLayout, Point, TreeBody } from "./FallenTreeShape";
import { treePixelPart } from "./SnowyTreeTexture";

/** A tree growing back is drawn at one of these many sizes. */
export const GROW_STEPS = 8;
/** The size a tree grows back from, a share of its own: a sapling. */
const SAPLING_SHARE = 0.15;
/** A tree lying is drawn in one of these many ways round its foot. */
const LYING_WAYS = 16;
/** The earth of the plate of roots, its edge, the roots in it, the grass on its top, and the hole it left. */
const EARTH = "#5e4128";
const EARTH_TOP = "#94744c";
const EARTH_EDGE = "#3b2a1a";
const ROOTS = "#3b2a1a";
const GRASS = "#55702c";
const PIT = "rgba(52, 37, 22, 0.5)";
/** Under this share of leaves (green, bright or snowy pixels), a crown is bare: drawn lying in branches. */
const BARE_FOLIAGE = 0.35;
/** The tufts of leaves the crown lying is drawn with: their radius against the width of the crown. */
const TUFT_RADIUS = 0.055;
/** The shadow right under what lies on the ground, whatever the light. */
const CONTACT_SHADOW = "rgba(0, 0, 0, 0.3)";

/** The size step a tree growing back is drawn at, from 1 (a sapling) to GROW_STEPS (as before). */
export function growStep(grown: number): number {
    if (!Number.isFinite(grown)) return GROW_STEPS;
    return Math.min(GROW_STEPS, Math.max(1, Math.ceil(grown * GROW_STEPS)));
}

/** The share of its own size a tree is drawn at, at a size step. */
export function growShare(step: number): number {
    return SAPLING_SHARE + ((1 - SAPLING_SHARE) * Math.min(GROW_STEPS, Math.max(1, step))) / GROW_STEPS;
}

/** The way a tree lies, rounded to one of LYING_WAYS (degrees). */
export function lyingWay(toward: number): number {
    const step = 360 / LYING_WAYS;
    const way = Math.round((Number.isFinite(toward) ? toward : 0) / step) % LYING_WAYS;
    return (((way + LYING_WAYS) % LYING_WAYS) * step) % 360;
}

/** An image of a tree read once: its pixels by part (its leaves, its wood, both without the shadow painted under). */
interface ReadTree {
    body: TreeBody;
    width: number;
    height: number;
    /** The bare trunk alone. */
    wood: HTMLCanvasElement;
    /** The tree without the shadow painted under it. */
    standing: HTMLCanvasElement;
    /** The colours of its leaves, from their shade to their light, and of their outline (CSS). */
    palette: { outline: string; shade: string; middle: string; light: string };
    /**
     * Its crown: leaves (tufts), hardly any leaves (a bare tree in winter: branches), or a palm (fronds), read from its
     * image (isPalm), not its name.
     */
    kind: CrownKind;
}

const read = new Map<string, ReadTree | null>();

function canvasOf(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

/** The colours of the leaves of a tree, darkest to lightest, at these shares of their number. */
function paletteOf(leaves: [number, number, number][]): ReadTree["palette"] {
    const sorted = leaves
        .map((rgb) => ({ rgb, lightness: Math.max(...rgb) + Math.min(...rgb) }))
        .sort((first, second) => first.lightness - second.lightness);
    const at = (share: number): string => {
        const rgb = sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))]?.rgb ?? [60, 110, 50];
        return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    };
    return { outline: at(0.03), shade: at(0.2), middle: at(0.5), light: at(0.85) };
}

/** The image of a tree read by part, once; undefined while it is not loaded. */
function readTree(scene: Phaser.Scene, sourceKey: string): ReadTree | undefined {
    const known = read.get(sourceKey);
    if (known !== undefined) return known ?? undefined;
    if (!scene.textures.exists(sourceKey)) return undefined;
    const frame = scene.textures.getFrame(sourceKey);
    const source = frame?.source.image as CanvasImageSource | undefined;
    if (!frame || !source) return undefined;
    const width = frame.cutWidth;
    const height = frame.cutHeight;
    const whole = canvasOf(width, height).getContext("2d", { willReadFrequently: true });
    if (!whole) {
        read.set(sourceKey, null);
        return undefined;
    }
    whole.drawImage(source, frame.cutX, frame.cutY, width, height, 0, 0, width, height);
    const pixels = whole.getImageData(0, 0, width, height);
    const body = treeBodyOf(pixels.data, width, height);
    const wood = new ImageData(width, height);
    const standing = new ImageData(width, height);
    const leaves: [number, number, number][] = [];
    const trunkHalf = body.trunkWidth / 2 + 1;
    for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
            const at = (row * width + column) * 4;
            const pixel = pixels.data.subarray(at, at + 4);
            const part = treePixelPart([pixel[0], pixel[1], pixel[2], pixel[3]], row / height);
            if (part === "clear" || part === "shadow") continue;
            standing.data.set(pixel, at);
            const inTrunk =
                Math.abs(column + 0.5 - body.footX) <= trunkHalf &&
                (row >= body.trunkTop - 3 || (row >= body.trunkSeenTop && !isFoliage([pixel[0], pixel[1], pixel[2]])));
            if (inTrunk) wood.data.set(pixel, at);
            else if (row <= body.crownBottom) leaves.push([pixel[0], pixel[1], pixel[2]]);
        }
    }
    const put = (data: ImageData): HTMLCanvasElement => {
        const canvas = canvasOf(width, height);
        canvas.getContext("2d")?.putImageData(data, 0, 0);
        return canvas;
    };
    const tree: ReadTree = {
        body,
        width,
        height,
        wood: put(wood),
        standing: put(standing),
        palette: paletteOf(leaves),
        kind:
            leaves.filter((rgb) => isFoliage(rgb)).length < BARE_FOLIAGE * leaves.length
                ? "bare"
                : isPalm(body)
                  ? "palm"
                  : "leafy",
    };
    read.set(sourceKey, tree);
    return tree;
}

/** Where the foot of a tree is in its image (the bottom middle until its image is loaded). */
export function treeFoot(scene: Phaser.Scene, sourceKey: string): { x: number; y: number } {
    const tree = readTree(scene, sourceKey);
    if (tree) return { x: tree.body.footX, y: tree.body.footY };
    const frame = scene.textures.exists(sourceKey) ? scene.textures.getFrame(sourceKey) : undefined;
    return { x: (frame?.cutWidth ?? 0) / 2, y: frame?.cutHeight ?? 0 };
}

/** The read body of a tree: its height and its crown, for where its leaves fly. */
export function treeBody(scene: Phaser.Scene, sourceKey: string): TreeBody | undefined {
    return readTree(scene, sourceKey)?.body;
}

/** A texture of the size of the image of a tree, drawn once by `draw`; its key, or undefined. */
function madeTexture(
    scene: Phaser.Scene,
    key: string,
    width: number,
    height: number,
    draw: (context: CanvasRenderingContext2D) => void,
): string | undefined {
    if (scene.textures.exists(key)) return key;
    const canvas = scene.textures.createCanvas(key, Math.max(1, width), Math.max(1, height));
    const context = canvas?.getContext();
    if (!canvas || !context) return undefined;
    context.imageSmoothingEnabled = false;
    draw(context);
    canvas.refresh();
    return key;
}

/**
 * What is left standing where a tree was uprooted: nothing (its plate of roots and the hole are drawn with the tree
 * lying, FallenTreeView). The size of its image, so that the object keeps its place.
 */
export function uprootedTexture(scene: Phaser.Scene, sourceKey: string): string | undefined {
    const tree = readTree(scene, sourceKey);
    if (!tree) return undefined;
    return madeTexture(scene, `tree-uprooted:${tree.width}x${tree.height}`, tree.width, tree.height, () => {});
}

/** The image of a tree without the shadow painted under it: the one that falls. */
export function fallingTreeTexture(scene: Phaser.Scene, sourceKey: string): string | undefined {
    const tree = readTree(scene, sourceKey);
    if (!tree) return undefined;
    return madeTexture(scene, `tree-falling:${sourceKey}`, tree.width, tree.height, (context) => {
        context.drawImage(tree.standing, 0, 0);
    });
}

/** A tree growing back, at a size step: its own image smaller, its foot where it was. */
export function growingTreeTexture(scene: Phaser.Scene, sourceKey: string, step: number): string | undefined {
    const at = Math.min(GROW_STEPS, Math.max(1, Math.round(step)));
    if (at >= GROW_STEPS) return scene.textures.exists(sourceKey) ? sourceKey : undefined;
    const tree = readTree(scene, sourceKey);
    if (!tree) return undefined;
    const share = growShare(at);
    const { footX, footY } = tree.body;
    return madeTexture(scene, `tree-grow:${sourceKey}:${at}`, tree.width, tree.height, (context) => {
        context.drawImage(
            tree.standing,
            footX - footX * share,
            footY - footY * share,
            tree.width * share,
            tree.height * share,
        );
    });
}

/** A closed path through `points`, `rise` pixels above the ground. */
function outlinePath(context: CanvasRenderingContext2D, points: readonly Point[], rise: number): void {
    context.beginPath();
    points.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y - rise);
        else context.lineTo(point.x, point.y - rise);
    });
    context.closePath();
}

/** Whether (x, y) is inside the polygon `points`, `rise` pixels above the ground. */
function inside(points: readonly Point[], rise: number, x: number, y: number): boolean {
    let crossed = false;
    for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
        const a = points[index];
        const b = points[previous];
        const ay = a.y - rise;
        const by = b.y - rise;
        if (ay > y !== by > y && x < ((b.x - a.x) * (y - ay)) / (by - ay) + a.x) crossed = !crossed;
    }
    return crossed;
}

/** A number from 0 to 1, the same for the same seed: the tufts of a tree lie where they lay the last time. */
function tuftLuck(seed: number): number {
    const value = Math.sin(seed * 12.9898) * 43758.5453;
    return value - Math.floor(value);
}

/**
 * The crown pressed on the ground, drawn in its own colours: its outline as it stood laid the way it fell, the side
 * of the mass of branches in its shade, its top in tufts of leaves lit from above (never its standing image turned
 * over), its outline in the darkest of its colours.
 */
function drawCrown(context: CanvasRenderingContext2D, tree: ReadTree, layout: LyingLayout): void {
    const { outline, thickness } = layout;
    if (outline.length < 3) return;
    const { palette } = tree;
    outlinePath(context, outline, 0);
    context.fillStyle = palette.outline;
    context.fill();
    outlinePath(context, outline, thickness);
    context.fillStyle = palette.shade;
    context.fill();
    // The tufts of the top, the far ones first: each a shade, its body, its light.
    const xs = outline.map((point) => point.x);
    const ys = outline.map((point) => point.y - thickness);
    const box = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
    const crownWidth = tree.body.crownRight - tree.body.crownLeft + 1;
    const radius = Math.max(2, crownWidth * TUFT_RADIUS);
    const count = Math.ceil(((box.right - box.left) * (box.bottom - box.top)) / (radius * radius * 1.3));
    const tufts: Point[] = [];
    for (let index = 0; index < count; index++) {
        const x = box.left + tuftLuck(index * 2 + 1) * (box.right - box.left);
        const y = box.top + tuftLuck(index * 2 + 2) * (box.bottom - box.top);
        if (inside(outline, thickness, x, y)) tufts.push({ x, y });
    }
    tufts.sort((first, second) => first.y - second.y);
    context.save();
    context.clip();
    for (const tuft of tufts) {
        for (const [dx, dy, share, colour] of [
            [0.3, 0.5, 1, palette.shade],
            [0, 0, 0.8, palette.middle],
            [-0.3, -0.35, 0.4, palette.light],
        ] as const) {
            context.beginPath();
            context.arc(tuft.x + dx * radius, tuft.y + dy * radius, radius * share, 0, 2 * Math.PI);
            context.fillStyle = colour;
            context.fill();
        }
    }
    context.restore();
    outlinePath(context, outline, thickness);
    context.lineWidth = 1;
    context.strokeStyle = palette.outline;
    context.stroke();
}

/** A bare crown lying: its limb and its branches in the colours of its wood, an outline under them, lit on top. */
function drawBranches(context: CanvasRenderingContext2D, tree: ReadTree, layout: LyingLayout): void {
    const { palette } = tree;
    context.save();
    context.lineCap = "round";
    for (const [extra, rise, colour] of [
        [2, 0, palette.outline],
        [0, 0, palette.middle],
        [-1, 0.6, palette.light],
    ] as const) {
        context.strokeStyle = colour;
        for (const branch of layout.branches) {
            const width = branch.width + extra;
            if (width < 0.5) continue;
            context.lineWidth = width;
            context.beginPath();
            context.moveTo(branch.from.x, branch.from.y - rise);
            context.lineTo(branch.to.x, branch.to.y - rise);
            context.stroke();
        }
    }
    context.restore();
}

/** How long the leaflets of a frond are, against its length, at its middle; they shorten to its tip. */
const LEAFLET_SHARE = 0.16;

/**
 * The fronds of a palm lying, in the colours of its leaves: each a midrib, lighter, arched from the top of the trunk,
 * its leaflets as teeth slanting back to both sides, an outline under them.
 */
function drawFronds(context: CanvasRenderingContext2D, tree: ReadTree, layout: LyingLayout): void {
    const { palette } = tree;
    context.save();
    context.lineCap = "round";
    for (const frond of layout.fronds) {
        const length = frond
            .slice(1)
            .reduce((sum, point, index) => sum + Math.hypot(point.x - frond[index].x, point.y - frond[index].y), 0);
        const leaflets: [Point, Point][] = [];
        for (let index = 1; index < frond.length; index++) {
            const from = frond[index - 1];
            const to = frond[index];
            const step = Math.hypot(to.x - from.x, to.y - from.y);
            if (step < 1e-6) continue;
            const along = { x: (to.x - from.x) / step, y: (to.y - from.y) / step };
            for (let at = 0; at < step; at += 2) {
                const share = (index - 1 + at / step) / (frond.length - 1);
                const reach = length * LEAFLET_SHARE * Math.sin(Math.PI * Math.min(1, 0.15 + share));
                const base = { x: from.x + along.x * at, y: from.y + along.y * at };
                for (const side of [1, -1]) {
                    // Slanting back to the tip: teeth, not a comb.
                    leaflets.push([
                        base,
                        {
                            x: base.x - along.y * side * reach + along.x * reach * 0.5,
                            y: base.y + along.x * side * reach + along.y * reach * 0.5,
                        },
                    ]);
                }
            }
        }
        for (const [width, colour, lift] of [
            [3, palette.outline, -1],
            [1.5, palette.middle, 0],
        ] as const) {
            context.lineWidth = width;
            context.strokeStyle = colour;
            context.beginPath();
            for (const [from, to] of leaflets) {
                context.moveTo(from.x, from.y - lift);
                context.lineTo(to.x, to.y - lift);
            }
            context.stroke();
        }
        context.lineWidth = 1.5;
        context.strokeStyle = palette.light;
        context.beginPath();
        frond.forEach((point, index) =>
            index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
        );
        context.stroke();
    }
    context.restore();
}

/** The trunk on the ground from the foot, its bark stretched along it. */
function drawTrunk(context: CanvasRenderingContext2D, tree: ReadTree, layout: LyingLayout): void {
    const { body } = tree;
    const length = Math.hypot(layout.trunkEnd.x, layout.trunkEnd.y);
    if (length < 1) return;
    const top = Math.max(0, Math.min(body.trunkTop, body.trunkSeenTop) - 3);
    const barkHeight = Math.max(1, body.footY - top);
    const half = Math.max(1, Math.ceil(body.trunkWidth / 2) + 1);
    context.save();
    context.rotate(Math.atan2(layout.trunkEnd.x, -layout.trunkEnd.y));
    context.drawImage(tree.wood, body.footX - half, top, 2 * half, barkHeight, -half, -length, 2 * half, length);
    context.restore();
}

/** The outline of the plate of roots: an oval made uneven, the same for the same plate. */
function platePath(context: CanvasRenderingContext2D, layout: LyingLayout, shrink: number): void {
    const { plate } = layout;
    context.beginPath();
    for (let corner = 0; corner < 11; corner++) {
        const angle = (corner / 11) * 2 * Math.PI;
        const bump = (0.78 + 0.32 * tuftLuck(corner + 7)) * shrink;
        const x = plate.x + Math.cos(angle) * plate.width * bump;
        const y = plate.y + Math.sin(angle) * plate.height * bump;
        if (corner === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
    }
    context.closePath();
}

/**
 * The plate of roots and earth standing up at the foot: uneven, its earth darker below, lighter on top where the grass
 * was torn up with it, roots sticking out of it.
 */
function drawPlate(context: CanvasRenderingContext2D, layout: LyingLayout): void {
    const { plate } = layout;
    context.lineWidth = 1;
    context.strokeStyle = ROOTS;
    context.beginPath();
    for (let root = 0; root < 6; root++) {
        const angle = Math.PI * (0.05 + 0.9 * (root / 5)) + (root % 2 ? 0.2 : -0.2);
        const reach = 1.15 + 0.35 * tuftLuck(root + 3);
        context.moveTo(plate.x + Math.cos(angle) * plate.width * 0.6, plate.y + Math.sin(angle) * plate.height * 0.6);
        context.lineTo(
            plate.x + Math.cos(angle) * plate.width * reach,
            plate.y + Math.sin(angle) * plate.height * reach,
        );
    }
    context.stroke();
    platePath(context, layout, 1);
    context.fillStyle = EARTH;
    context.fill();
    context.strokeStyle = EARTH_EDGE;
    context.stroke();
    // The top of the plate, lighter: the earth just under the grass.
    context.save();
    platePath(context, layout, 1);
    context.clip();
    context.beginPath();
    context.ellipse(plate.x, plate.y - plate.height * 0.55, plate.width * 1.1, plate.height * 0.6, 0, 0, 2 * Math.PI);
    context.fillStyle = EARTH_TOP;
    context.fill();
    context.restore();
    context.beginPath();
    context.ellipse(plate.x, plate.y, plate.width * 0.95, plate.height * 0.95, 0, Math.PI * 1.15, Math.PI * 1.85);
    context.lineWidth = 2;
    context.strokeStyle = GRASS;
    context.stroke();
}

/** The shadow right under the tree lying: under its trunk and its crown. */
function drawContactShadow(context: CanvasRenderingContext2D, layout: LyingLayout, bare: boolean): void {
    context.save();
    context.filter = "blur(2px)";
    context.fillStyle = CONTACT_SHADOW;
    context.strokeStyle = CONTACT_SHADOW;
    context.lineCap = "round";
    context.lineWidth = layout.trunkWidth + 2;
    context.beginPath();
    context.moveTo(0, 2);
    context.lineTo(layout.trunkEnd.x, layout.trunkEnd.y + 2);
    context.stroke();
    if (bare) {
        for (const frond of layout.fronds) {
            context.lineWidth = 4;
            context.beginPath();
            frond.forEach((point, index) =>
                index === 0 ? context.moveTo(point.x, point.y + 3) : context.lineTo(point.x, point.y + 3),
            );
            context.stroke();
        }
        for (const branch of layout.branches) {
            context.lineWidth = branch.width + 1;
            context.beginPath();
            context.moveTo(branch.from.x, branch.from.y + 2);
            context.lineTo(branch.to.x, branch.to.y + 2);
            context.stroke();
        }
    } else if (layout.outline.length >= 3) {
        context.translate(1, 3);
        outlinePath(context, layout.outline, 0);
        context.fill();
    }
    context.restore();
}

/** The size of the texture of a tree lying (square, its foot at the middle). */
function lyingSize(tree: ReadTree): number {
    return 2 * Math.ceil(tree.body.footY + tree.width) + 8;
}

/**
 * A tree lying on the ground the way `toward` (rounded to one of LYING_WAYS): the plate of roots it tore up standing
 * at its foot over the hole it left, its trunk along the ground, its crown pressed flat and a little wider, their
 * shadow right under them; up or down the screen, foreshortened (lyingLayout). Its foot at the middle of the texture.
 */
export function lyingTreeTexture(scene: Phaser.Scene, sourceKey: string, toward: number): string | undefined {
    const tree = readTree(scene, sourceKey);
    if (!tree) return undefined;
    const way = lyingWay(toward);
    const size = lyingSize(tree);
    return madeTexture(scene, `tree-lying:${sourceKey}:${way}`, size, size, (context) => {
        const layout = lyingLayout(tree.body, way, tree.kind);
        context.translate(size / 2, size / 2);
        context.beginPath();
        context.ellipse(layout.pit.x, layout.pit.y, layout.pit.width, layout.pit.height, 0, 0, 2 * Math.PI);
        context.fillStyle = PIT;
        context.fill();
        drawContactShadow(context, layout, tree.kind !== "leafy");
        const parts = [
            () => drawPlate(context, layout),
            () => drawTrunk(context, tree, layout),
            () =>
                tree.kind === "bare"
                    ? drawBranches(context, tree, layout)
                    : tree.kind === "palm"
                      ? drawFronds(context, tree, layout)
                      : drawCrown(context, tree, layout),
        ];
        for (const draw of layout.crownFirst ? parts.reverse() : parts) draw();
    });
}

/**
 * What of a tree lying the way `toward` throws its shadow as lines, from its foot (screen pixels): for bare branches
 * or the fronds of a palm, the same lines as drawn (lyingTreeTexture), and its trunk; undefined for a crown of leaves.
 */
export function lyingLimbs(
    scene: Phaser.Scene,
    sourceKey: string,
    toward: number,
): { from: Point; to: Point; width: number }[] | undefined {
    const tree = readTree(scene, sourceKey);
    if (!tree || tree.kind === "leafy") return undefined;
    const layout = lyingLayout(tree.body, lyingWay(toward), tree.kind);
    const limbs = [{ from: { x: 0, y: 0 }, to: layout.trunkEnd, width: layout.trunkWidth }, ...layout.branches];
    for (const frond of layout.fronds) {
        for (let index = 1; index < frond.length; index++)
            limbs.push({ from: frond[index - 1], to: frond[index], width: 4 });
    }
    return limbs;
}
