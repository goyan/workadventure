import { TERRAIN_CELL, TERRAIN_CHUNK, TILE_PX } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import type * as Phaser from "phaser";
import { ContourCache } from "./TerrainContours";
import type { ContourSegment } from "./TerrainContours";

/** A contour line every quarter of a tile of depth, a stronger one every tile. */
const CONTOUR_STEP_PX = 8;
const CONTOUR_MAJOR_PX = TILE_PX;
/** Beyond this many pieces of lines in view, only the stronger ones are drawn. */
const MAX_CONTOUR_SEGMENTS = 30000;
/**
 * The contour lines are drawn by regions of this many chunks of the relief a side (1024 px): Phaser draws a graphics
 * again whole at each frame, so only the regions in view are shown, and a stroke draws again only the regions it
 * changed.
 */
const CONTOUR_REGION_CHUNKS = 4;
export const CONTOUR_REGION_PX = CONTOUR_REGION_CHUNKS * TERRAIN_CHUNK * TERRAIN_CELL;
/** A region this close to the view is shown too: the view of the camera is read one frame late. */
const CONTOUR_VIEW_MARGIN_PX = TERRAIN_CHUNK * TERRAIN_CELL;
/** Under this zoom the lines of a region are shown as a picture of them, painted once (contourPictureScale). */
export const CONTOUR_PICTURE_BELOW_ZOOM = 0.5;
/** The largest scale of a picture: a region is then 256 px a side, a quarter of a megabyte. */
const LARGEST_PICTURE_SCALE = 0.25;
const MINOR_ALPHA = 0.3;
const MAJOR_ALPHA = 0.75;
const LINE_COLOR = 0xffffff;

/**
 * The scale the lines of a region are painted at, in a picture, for this zoom of the camera: undefined from
 * CONTOUR_PICTURE_BELOW_ZOOM on (the lines are drawn as such, a few regions are in view). Zoomed out, all the regions
 * of a map are in view, and drawing their lines again at each frame cost more than all the rest of the editor: a
 * picture costs one image a region. A power of two, at least the zoom (a line stays one pixel of the screen wide), at
 * most LARGEST_PICTURE_SCALE: so the pictures are painted again only when the zoom crosses a power of two.
 */
export function contourPictureScale(zoom: number): number | undefined {
    if (!(zoom > 0) || zoom >= CONTOUR_PICTURE_BELOW_ZOOM) return undefined;
    return Math.min(LARGEST_PICTURE_SCALE, 2 ** Math.ceil(Math.log2(zoom)));
}

/** The pictures of the lines of a region at a scale: the fine ones (painted only when shown) and the stronger ones. */
interface ContourPictures {
    scale: number;
    /** The version of the lines of the region each picture shows; -1: not painted. */
    minor: Phaser.GameObjects.RenderTexture | undefined;
    minorVersion: number;
    major: Phaser.GameObjects.RenderTexture | undefined;
    majorVersion: number;
}

/** The contour lines of a region of the map: the fine ones and the stronger ones, apart. */
interface ContourRegion {
    left: number;
    top: number;
    segments: ContourSegment[];
    /** Counted up each time the lines of the region change. */
    version: number;
    minor: Phaser.GameObjects.Graphics;
    major: Phaser.GameObjects.Graphics;
    minorCount: number;
    majorCount: number;
    pictures: ContourPictures | undefined;
}

/**
 * The contour lines of the relief, shown by the relief tool of the editor: thin ones every quarter of a tile of depth,
 * stronger ones every tile (TerrainContours.ts). Kept region by region: a stroke draws again only the regions it
 * changed, only the regions in view are shown, as lines when the camera is close and as pictures of them painted once
 * when it is zoomed out.
 */
export class ContourView {
    private readonly regions = new Map<string, ContourRegion>();
    private cache: ContourCache | undefined;
    private wanted = false;
    /** The relief the lines were last drawn from (null: none yet): drawn again when the map holds another one. */
    private drawnOf: TerrainData | null | undefined = null;

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly depth: number,
    ) {}

    /** Whether the panel asks for the lines. */
    public setWanted(wanted: boolean, terrain: TerrainData | undefined): void {
        this.wanted = wanted;
        this.draw(terrain);
    }

    /** At each frame: the lines of the relief of the map now, in view. */
    public update(terrain: TerrainData | undefined): void {
        // The relief of the map is another object each time it is edited, here or by someone else.
        if (terrain !== this.drawnOf) this.draw(terrain);
        else this.show(false);
    }

    public destroy(): void {
        for (const region of this.regions.values()) this.destroyRegion(region);
        this.regions.clear();
        this.cache = undefined;
        this.drawnOf = null;
    }

    /** Only the regions whose relief changed since they were last drawn are drawn again. */
    private draw(terrain: TerrainData | undefined): void {
        this.drawnOf = terrain;
        if (this.wanted) {
            this.cache ??= new ContourCache(CONTOUR_STEP_PX, CONTOUR_MAJOR_PX);
            const drawn = new Set<string>();
            for (const chunk of this.cache.update(terrain)) {
                const [chunkX, chunkY] = chunk.split(",").map(Number);
                drawn.add(
                    `${Math.floor(chunkX / CONTOUR_REGION_CHUNKS)},${Math.floor(chunkY / CONTOUR_REGION_CHUNKS)}`,
                );
            }
            for (const region of drawn) this.drawRegion(region);
        }
        this.show(true);
    }

    /** Draws the lines of a region again, from the lines of its chunks; a region without any is let go. */
    private drawRegion(key: string): void {
        const cache = this.cache;
        if (!cache) return;
        const [regionX, regionY] = key.split(",").map(Number);
        const segments: ContourSegment[] = [];
        for (let chunkY = regionY * CONTOUR_REGION_CHUNKS; chunkY < (regionY + 1) * CONTOUR_REGION_CHUNKS; chunkY++) {
            for (
                let chunkX = regionX * CONTOUR_REGION_CHUNKS;
                chunkX < (regionX + 1) * CONTOUR_REGION_CHUNKS;
                chunkX++
            ) {
                segments.push(...cache.segmentsOf(`${chunkX},${chunkY}`));
            }
        }
        let region = this.regions.get(key);
        if (segments.length === 0) {
            if (region) this.destroyRegion(region);
            this.regions.delete(key);
            return;
        }
        if (!region) {
            region = {
                left: regionX * CONTOUR_REGION_PX,
                top: regionY * CONTOUR_REGION_PX,
                segments,
                version: 0,
                minor: this.scene.add.graphics().setDepth(this.depth).setVisible(false),
                major: this.scene.add.graphics().setDepth(this.depth).setVisible(false),
                minorCount: 0,
                majorCount: 0,
                pictures: undefined,
            };
            this.regions.set(key, region);
        }
        region.segments = segments;
        region.version++;
        region.minorCount = 0;
        region.majorCount = 0;
        for (const major of [false, true]) {
            const graphics = major ? region.major : region.minor;
            graphics.clear();
            graphics.lineStyle(1, LINE_COLOR, major ? MAJOR_ALPHA : MINOR_ALPHA);
            graphics.beginPath();
            for (const segment of segments) {
                if (segment.major !== major) continue;
                graphics.moveTo(segment.x1, segment.y1);
                graphics.lineTo(segment.x2, segment.y2);
                if (major) region.majorCount++;
                else region.minorCount++;
            }
            graphics.strokePath();
        }
    }

    /**
     * Shows the lines of the regions in view only, and only the stronger ones when there are too many lines in view (a
     * map full of lakes seen whole); as pictures when zoomed out.
     */
    private show(changed: boolean): void {
        const camera = this.scene.cameras.main;
        const view = camera.worldView;
        const inView = (region: ContourRegion): boolean =>
            this.wanted &&
            region.left < view.right + CONTOUR_VIEW_MARGIN_PX &&
            region.left + CONTOUR_REGION_PX > view.x - CONTOUR_VIEW_MARGIN_PX &&
            region.top < view.bottom + CONTOUR_VIEW_MARGIN_PX &&
            region.top + CONTOUR_REGION_PX > view.y - CONTOUR_VIEW_MARGIN_PX;
        let lines = 0;
        for (const region of this.regions.values()) if (inView(region)) lines += region.minorCount + region.majorCount;
        const crowded = lines > MAX_CONTOUR_SEGMENTS;
        const scale = contourPictureScale(camera.zoom);
        for (const region of this.regions.values()) {
            const shown = inView(region);
            const minor = shown && !crowded;
            // Pictures of another scale, or none needed: let go.
            if (region.pictures && region.pictures.scale !== scale) {
                destroyPictures(region.pictures);
                region.pictures = undefined;
                changed = true;
            }
            if (scale !== undefined && shown) {
                const pictures = (region.pictures ??= {
                    scale,
                    minor: undefined,
                    minorVersion: -1,
                    major: undefined,
                    majorVersion: -1,
                });
                if (pictures.majorVersion !== region.version) {
                    pictures.major = this.paint(pictures.major, region, scale, true);
                    pictures.majorVersion = region.version;
                    changed = true;
                }
                if (minor && pictures.minorVersion !== region.version) {
                    pictures.minor = this.paint(pictures.minor, region, scale, false);
                    pictures.minorVersion = region.version;
                    changed = true;
                }
            }
            const pictured = scale !== undefined;
            changed = setVisible(region.major, shown && !pictured) || changed;
            changed = setVisible(region.minor, minor && !pictured) || changed;
            if (region.pictures?.major) changed = setVisible(region.pictures.major, shown) || changed;
            if (region.pictures?.minor) changed = setVisible(region.pictures.minor, minor) || changed;
        }
        if (changed) this.scene.markDirty();
    }

    /**
     * Paints the lines of a region (the fine ones or the stronger ones) in a picture at this scale: a line of a texel,
     * shown a pixel of the screen wide at that zoom, in its colour and its transparency.
     */
    private paint(
        picture: Phaser.GameObjects.RenderTexture | undefined,
        region: ContourRegion,
        scale: number,
        major: boolean,
    ): Phaser.GameObjects.RenderTexture {
        const size = Math.ceil(CONTOUR_REGION_PX * scale);
        const target =
            picture ??
            this.scene.add
                .renderTexture(region.left, region.top, size, size)
                .setOrigin(0, 0)
                .setScale(1 / scale)
                .setDepth(this.depth)
                .setVisible(false);
        const lines = this.scene.make.graphics({}, false);
        lines.lineStyle(1, LINE_COLOR, major ? MAJOR_ALPHA : MINOR_ALPHA);
        lines.beginPath();
        // Through the middle of the texels: the lines lie on the edges of the cells, whole texels from a quarter on.
        const at = (value: number, origin: number): number => Math.floor((value - origin) * scale) + 0.5;
        for (const segment of region.segments) {
            if (segment.major !== major) continue;
            lines.moveTo(at(segment.x1, region.left), at(segment.y1, region.top));
            lines.lineTo(at(segment.x2, region.left), at(segment.y2, region.top));
        }
        lines.strokePath();
        target.clear();
        target.draw(lines);
        target.render();
        lines.destroy();
        return target;
    }

    private destroyRegion(region: ContourRegion): void {
        region.minor.destroy();
        region.major.destroy();
        if (region.pictures) destroyPictures(region.pictures);
        region.pictures = undefined;
    }
}

function destroyPictures(pictures: ContourPictures): void {
    pictures.minor?.destroy();
    pictures.major?.destroy();
}

/** Shows or hides; whether that changed anything. */
function setVisible(object: { visible: boolean; setVisible(visible: boolean): unknown }, visible: boolean): boolean {
    if (object.visible === visible) return false;
    object.setVisible(visible);
    return true;
}
