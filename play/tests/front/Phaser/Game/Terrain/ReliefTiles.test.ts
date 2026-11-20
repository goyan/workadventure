import { describe, expect, it, vi } from "vitest";
import { cellKey, Season, withHeights, withSoils } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { ReliefTiles } from "../../../../../src/front/Phaser/Game/Terrain/ReliefTiles";
import type { GroundLayout } from "../../../../../src/front/Phaser/Game/Terrain/ReliefTiles";
import { TerrainWater } from "../../../../../src/front/Phaser/Game/Terrain/TerrainWater";
import type { WaterState } from "../../../../../src/front/Phaser/Game/Terrain/TerrainWater";
import { MeadowState } from "../../../../../src/front/Phaser/Game/Terrain/MeadowState";
import { RAMPS, rampsFor } from "../../../../../src/front/Phaser/Game/Terrain/Pixel/PixelPalette";
import type { Rgb } from "../../../../../src/front/Phaser/Game/Terrain/Pixel/PixelPalette";

/** Hollows dug all over a large part of the map: every block of 256 px holds some. */
function dugEverywhere(): TerrainData {
    const changes = new Map<string, number>();
    for (let x = 0; x < 160; x += 4) for (let y = 0; y < 160; y += 4) changes.set(cellKey(x, y), -64);
    return withHeights(undefined, changes);
}

function fixture(
    terrain: TerrainData | undefined = dugEverywhere(),
    meadow?: MeadowState,
    options: { layout?: GroundLayout; season?: () => Season | undefined; snowLineSeason?: Season } = {},
) {
    const worldView = { x: 300, y: 300, width: 600, height: 400 };
    const images: { visible: boolean }[] = [];
    /** The last pixels put in each block, by texture key. */
    const painted = new Map<string, Uint8ClampedArray>();
    const image = () => {
        const object = {
            visible: true,
            setOrigin: () => object,
            setDisplaySize: () => object,
            setDepth: () => object,
            setVisible: (visible: boolean) => {
                object.visible = visible;
                return object;
            },
            destroy: vi.fn(),
        };
        images.push(object);
        return object;
    };
    const texture = (key: string) => ({
        key,
        source: [{ scaleMode: 0 }],
        setFilter: vi.fn(),
        refresh: vi.fn(),
        destroy: vi.fn(),
        getContext: () => ({
            createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
            putImageData: (pixels: { data: Uint8ClampedArray }) => painted.set(key, pixels.data),
        }),
    });
    const scene = {
        cameras: { main: { worldView } },
        textures: { createCanvas: vi.fn((key: string) => texture(key)) },
        add: { image: vi.fn(() => image()) },
        markDirty: vi.fn(),
    };
    const water = new TerrainWater();
    water.setTerrain(terrain);
    let current: TerrainData | undefined = terrain;
    const setTerrain = (next: TerrainData | undefined) => {
        current = next;
        water.setTerrain(next);
    };
    const tiles = new ReliefTiles(scene as never, {
        relief: () => current,
        meadow,
        layout: options.layout,
        water,
        season: options.season ?? (() => undefined),
        snowShown: () => 0,
        snowLineSeason: () => options.snowLineSeason,
    });
    // Updates until every block around the view is drawn: a block is drawn over several images, as many as the machine
    // needs (more under the load of the whole suite).
    let clock = 0;
    const settle = () => {
        let quiet = 0;
        for (let frame = 0; frame < 5000 && quiet < 3; frame++) {
            const before = tiles.redraws();
            tiles.update(clock++);
            quiet = tiles.isDrawing() || tiles.redraws() !== before ? 0 : quiet + 1;
        }
    };
    /** Jumps the time of the game: the water has glided to its last state. */
    const skip = (ms: number) => {
        clock += ms;
    };
    return { tiles, worldView, images, settle, painted, setTerrain, scene, water, clock: () => clock, skip };
}

const near = (value: number, expected: number) => expect(Math.abs(value - expected)).toBeLessThanOrEqual(2);

describe("the blocks of the relief seen in 3/4", () => {
    it("draws no block again while the view scrolls or zooms over drawn blocks", () => {
        const { tiles, worldView, settle } = fixture();
        settle();
        const drawn = tiles.redraws();
        worldView.x += 40;
        worldView.y -= 30;
        tiles.update(200);
        worldView.width = 560;
        tiles.update(201);
        expect(tiles.redraws()).toBe(drawn);
    });

    it("draws at most one block an image when many come into view at once", () => {
        const { tiles, worldView, settle } = fixture();
        settle();
        // Zoomed far out: many blocks come into view.
        Object.assign(worldView, { x: 0, y: 0, width: 2400, height: 2400 });
        for (let frame = 0; frame < 5; frame++) {
            const before = tiles.redraws();
            tiles.update(300 + frame);
            expect(tiles.redraws() - before).toBeLessThanOrEqual(1);
        }
    });

    it("hides its blocks while the editor is open, and draws them again once it is closed", () => {
        const { tiles, images, settle } = fixture();
        settle();
        tiles.setHidden(true);
        expect(images.every((image) => !image.visible)).toBe(true);
        expect(tiles.isActive()).toBe(false);
        const drawn = tiles.redraws();
        tiles.update(400);
        expect(tiles.redraws()).toBe(drawn);
        tiles.setHidden(false);
        expect(tiles.isActive()).toBe(true);
        tiles.update(401);
        // Nothing kept from before the editor: what was edited in it is drawn again.
        expect(tiles.redraws()).toBeGreaterThan(drawn);
        expect(images.filter((image) => image.visible).length).toBeGreaterThan(0);
    });

    it("finds the ground drawn under a point while it is drawn in 3/4, and the point itself in the editor", () => {
        // Dug 64 px deep from the cell 0 on: drawn 32 px lower.
        const deep = withHeights(
            undefined,
            new Map(
                Array.from({ length: 64 * 64 }, (_, index): [string, number] => [
                    cellKey(index % 64, Math.floor(index / 64)),
                    -64,
                ]),
            ),
        );
        const { tiles } = fixture(deep);
        expect(tiles.groundPointAt({ x: 300, y: 300 + 32 }).y).toBeCloseTo(300, 0);
        tiles.setHidden(true);
        expect(tiles.groundPointAt({ x: 300, y: 332 })).toEqual({ x: 300, y: 332 });
    });

    it("leaves no seam between two blocks dug as deep as a map allows", () => {
        // Dug 256 px deep (8 tiles) all over: drawn 128 px lower, every texel of a block is the floor.
        const deepest = withHeights(
            undefined,
            new Map(
                Array.from({ length: 96 * 96 }, (_, index): [string, number] => [
                    cellKey(index % 96, Math.floor(index / 96)),
                    -256,
                ]),
            ),
        );
        const { settle, painted } = fixture(deepest);
        settle();
        const block = painted.get("relief-block:2,2");
        expect(block).toBeDefined();
        const firstRow = Array.from({ length: 128 }, (_, column) => block?.[column * 4 + 3]);
        expect(firstRow.every((alpha) => alpha === 255)).toBe(true);
    });

    it("draws in a block the top of a mount that rises from the block south of it, without a seam", () => {
        // A mount 128 px high on the cells 20 to 27 across, 32 to 35 down (x 320 to 447, y 512 to 575): the first rows of
        // the block 1,2, drawn 64 px higher, in the last rows of the block 1,1.
        const changes = new Map<string, number>();
        for (let x = 20; x <= 27; x++) for (let y = 32; y <= 35; y++) changes.set(cellKey(x, y), 128);
        const { settle, painted } = fixture(withHeights(undefined, changes));
        settle();
        const north = painted.get("relief-block:1,1");
        const south = painted.get("relief-block:1,2");
        if (!north || !south) throw new Error("no block");
        const alpha = (block: Uint8ClampedArray, column: number, row: number) => block[(row * 256 + column) * 4 + 3];
        // The top of the mount (x 356, y 520 to 560) is drawn 64 px higher: y 456 to 496, the rows 200 to 240 of 1,1.
        for (let row = 200; row <= 240; row++) expect(alpha(north, 100, row)).toBe(255);
        // Nothing above the mount.
        expect(alpha(north, 100, 150)).toBe(0);
        // No seam: drawn on both sides of the edge of the blocks.
        for (let column = 80; column < 180; column++) {
            expect(alpha(north, column, 255)).toBe(255);
            expect(alpha(south, column, 0)).toBe(255);
        }
    });

    /**
     * Sand on the cells 10 to 40, dug 8 px (drawn: without the layout of the map, flat ground is left to its tiles), a
     * mount `height` px high on the cells 20 to 27 (x and y 320 to 447).
     */
    function mountOnSand(height: number): TerrainData {
        const sand = new Map<string, number>();
        const changes = new Map<string, number>();
        for (let x = 10; x <= 40; x++)
            for (let y = 10; y <= 40; y++) {
                sand.set(cellKey(x, y), 4);
                changes.set(cellKey(x, y), -8);
            }
        for (let x = 20; x <= 27; x++) for (let y = 20; y <= 27; y++) changes.set(cellKey(x, y), height);
        return withHeights(withSoils(undefined, sand), changes);
    }
    const lightness = (block: Uint8ClampedArray, left: number, top: number): number => {
        let total = 0;
        for (let row = top; row < top + 8; row++)
            for (let column = left; column < left + 8; column++) {
                const at = (row * 256 + column) * 4;
                total += block[at] + block[at + 1] + block[at + 2];
            }
        return total / 64;
    };

    it("casts the shadow of a mount on the ground south-east of it", () => {
        const { settle, painted } = fixture(mountOnSand(128));
        settle();
        const block = painted.get("relief-block:1,1");
        if (!block) throw new Error("no block");
        // South-east of the mount (x and y 460 to 467) against north-west of it (300 to 307), both flat sand, drawn
        // 4 px lower.
        expect(lightness(block, 204, 208)).toBeLessThan(lightness(block, 44, 48) * 0.9);
    });

    it("draws a block with a mount, its shadow and a lake at its foot about as fast as a block dug as deep", () => {
        const timeOf = (terrain: TerrainData): number => {
            const { tiles, water } = fixture(terrain);
            // 20 px of water on the cells x 16 to 31, y 28 to 31: at the foot of the mount (or the hollow).
            const bytes = new Uint8Array(64 * 64 * 2);
            for (let y = 28; y < 32; y++) for (let x = 16; x < 32; x++) bytes[(y * 64 + x) * 2] = 160;
            water.receive({ x: 0, y: 0, width: 64, height: 64, seq: 1, full: true, depths: bytes }, 0);
            let total = 0;
            for (let frame = 0; frame < 400; frame++) {
                const start = performance.now();
                tiles.update(frame);
                total += performance.now() - start;
                if (frame > 3 && !tiles.isDrawing()) break;
            }
            return total;
        };
        const dug = timeOf(mountOnSand(-128));
        const raised = timeOf(mountOnSand(128));
        expect(raised).toBeLessThan(dug * 1.5 + 10);
    });

    describe("a mount from end to end", () => {
        /** mountOnSand, the mount in rock: told apart from the sand around it. */
        const rockMount = (): TerrainData => {
            const rock = new Map<string, number>();
            for (let x = 20; x <= 27; x++) for (let y = 20; y <= 27; y++) rock.set(cellKey(x, y), 5);
            return withSoils(mountOnSand(128), rock);
        };
        const isOf = (ramp: readonly (readonly number[])[], block: Uint8ClampedArray, column: number, row: number) => {
            const at = (row * 256 + column) * 4;
            return ramp.some(
                (shade) => shade[0] === block[at] && shade[1] === block[at + 1] && shade[2] === block[at + 2],
            );
        };
        const RIM: Rgb = [0x2a, 0x24, 0x20];

        it("draws its top higher by half its height, over the ground behind it, cerned at its foot", () => {
            const { settle, painted } = fixture(rockMount());
            settle();
            const block = painted.get("relief-block:1,1");
            if (!block) throw new Error("no block");
            // The column x 356. The top of the mount at y 340 is drawn at 276 (row 20), in rock.
            expect(isOf(RAMPS.rock, block, 100, 20)).toBe(true);
            // The sand at y 300, north of the mount, is drawn at 304 (row 48) beside it; there the mount hides it.
            expect(isOf(RAMPS.sand, block, 40, 48)).toBe(true);
            expect(isOf(RAMPS.sand, block, 100, 48)).toBe(false);
            // Nothing drawn above the top of the mount but the sand of the ground there.
            expect(isOf(RAMPS.rock, block, 100, 2)).toBe(false);
            // The foot of its south flank, cerned (drawn from 376 down to 460, the rows 120 to 204).
            let rims = 0;
            for (let row = 190; row <= 210; row++) {
                const at = (row * 256 + 100) * 4;
                if (block[at] === RIM[0] && block[at + 1] === RIM[1] && block[at + 2] === RIM[2]) rims++;
            }
            expect(rims).toBe(1);
        });

        it("wears snow on its top over the snow line of the season", () => {
            const { settle, painted } = fixture(mountOnSand(128), undefined, {
                season: () => Season.Winter,
                snowLineSeason: Season.Winter,
            });
            settle();
            const block = painted.get("relief-block:1,1");
            if (!block) throw new Error("no block");
            const winter = rampsFor(Season.Winter);
            expect(isOf(winter.snow, block, 100, 40)).toBe(true);
            // The sand south of it, below the snow line: no snow.
            expect(isOf(winter.snow, block, 100, 240)).toBe(false);
        });

        it("is drawn flat while the map is edited, and found where it is drawn in 3/4", () => {
            const { settle, painted, tiles } = fixture(rockMount());
            settle();
            near(tiles.groundPointAt({ x: 356, y: 340 - 64 }).y, 340);
            tiles.setProjected(false);
            settle();
            const block = painted.get("relief-block:1,1");
            if (!block) throw new Error("no block");
            // Flat: the sand at y 276 at its place (row 20), the mount at its place only (row 84).
            expect(isOf(RAMPS.sand, block, 100, 20)).toBe(true);
            expect(isOf(RAMPS.rock, block, 100, 84)).toBe(true);
            expect(tiles.groundPointAt({ x: 356, y: 276 }).y).toBe(276);
        });
    });

    /** A flat floor dug 64 px deep over 64 × 64 cells, sand from the cell `sandFrom` on (x = 16 × sandFrom). */
    function floorWithSand(sandFrom: number): TerrainData {
        const cells = Array.from({ length: 64 * 64 }, (_, index): [string, number] => [
            cellKey(index % 64, Math.floor(index / 64)),
            -64,
        ]);
        const sand = cells
            .filter(([key]) => Number(key.split(",")[0]) >= sandFrom)
            .map(([key]): [string, number] => [key, 4]);
        return withSoils(withHeights(undefined, new Map(cells)), new Map(sand));
    }
    const GRASS_LINE: Rgb = [0x22, 0x36, 0x1c];
    const same = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    const pixelOf = (block: Uint8ClampedArray, column: number, row: number): Rgb => {
        const at = (row * 256 + column) * 4;
        return [block[at], block[at + 1], block[at + 2]];
    };
    const kindOf = (color: Rgb): "grass" | "sand" | "line" | "other" =>
        RAMPS.grass.some((shade) => same(shade, color))
            ? "grass"
            : RAMPS.sand.some((shade) => same(shade, color))
              ? "sand"
              : same(GRASS_LINE, color)
                ? "line"
                : "other";

    it("draws the floor in pixel art: shades of its materials, an irregular border, a dark line on the grass side", () => {
        const { settle, painted } = fixture(floorWithSand(24));
        settle();
        const block = painted.get("relief-block:1,1");
        expect(block).toBeDefined();
        if (!block) return;
        const switches = new Set<number>();
        let lined = 0;
        // Rows 64 to 95 show the floor (drawn 32 px lower); the border is near x 384, the column 128 of the block.
        for (let row = 64; row < 96; row++) {
            let first: number | undefined;
            for (let column = 100; column < 160; column++) {
                const kind = kindOf(pixelOf(block, column, row));
                expect(kind, `column ${column} row ${row}`).not.toBe("other");
                if (first === undefined && kind === "sand") first = column;
            }
            expect(first).toBeDefined();
            switches.add(first ?? 0);
            if (kindOf(pixelOf(block, (first ?? 1) - 1, row)) === "line") lined++;
        }
        expect(switches.size).toBeGreaterThanOrEqual(3);
        expect(lined).toBeGreaterThan(16);
    });

    it("draws the line of a border that falls on the edge of a block on both blocks alike", () => {
        // Sand from x 512 on: the border runs along the edge between the blocks 1,1 and 2,1.
        const { settle, painted } = fixture(floorWithSand(32));
        settle();
        const west = painted.get("relief-block:1,1");
        const east = painted.get("relief-block:2,1");
        expect(west && east).toBeTruthy();
        if (!west || !east) return;
        let crossings = 0;
        for (let row = 40; row < 256; row++) {
            const last = kindOf(pixelOf(west, 255, row));
            const first = kindOf(pixelOf(east, 0, row));
            // Grass right before the edge and sand right after it: the grass pixel carries the line.
            if (first === "sand" && last !== "sand") {
                crossings++;
                expect(last, `row ${row}`).toBe("line");
            }
        }
        expect(crossings).toBeGreaterThan(0);
    });

    it("draws a block again when the soil painted in it changes", () => {
        const { tiles, settle, setTerrain } = fixture(floorWithSand(24));
        settle();
        const drawn = tiles.redraws();
        setTerrain(withSoils(floorWithSand(24), new Map([[cellKey(18, 18), 5]])));
        settle();
        expect(tiles.redraws()).toBeGreaterThan(drawn);
    });

    it("draws its first block without freezing: the textures are worked out as they are used", async () => {
        // A fresh copy of the modules: no texture worked out yet.
        vi.resetModules();
        const fresh = await import("../../../../../src/front/Phaser/Game/Terrain/ReliefTiles");
        const { scene, setTerrain } = fixture(floorWithSand(24));
        const terrain = floorWithSand(24);
        setTerrain(terrain);
        const water = new TerrainWater();
        water.setTerrain(terrain);
        const tiles = new fresh.ReliefTiles(scene as never, {
            relief: () => terrain,
            water,
            season: () => undefined,
            snowShown: () => 0,
        });
        const start = performance.now();
        tiles.update(0);
        expect(tiles.redraws()).toBe(1);
        expect(performance.now() - start).toBeLessThan(80);
    });

    it("draws no block again when the meadow is told again without changing what covers the ground", () => {
        const meadow = new MeadowState();
        const told = (grass: number, dryness = 0) => {
            const tiles = 64 * 64;
            meadow.receive({
                width: 64,
                height: 64,
                grass: new Uint8Array(tiles).fill(grass),
                moisture: new Uint8Array(tiles),
                dryness: new Uint8Array(tiles).fill(dryness),
            });
        };
        told(200);
        const { tiles, settle } = fixture(dugEverywhere(), meadow);
        settle();
        const drawn = tiles.redraws();
        // Told again every 10 s: the grass grew a little, still grass. What covers the cells is read again over
        // several images (8 blocks an image at most), not all of it in the image that follows the message.
        told(210);
        const read = tiles.coverReads();
        tiles.update(99_999);
        expect(tiles.coverReads() - read).toBeLessThanOrEqual(8);
        settle();
        expect(tiles.redraws()).toBe(drawn);
        // The grass dried out to straw: the blocks are drawn again.
        told(210, 255);
        settle();
        expect(tiles.redraws()).toBeGreaterThan(drawn);
    });

    it("spreads the drawing of a block over several images: an image spends a few ms on it, not a whole block", () => {
        const deepest = withHeights(
            undefined,
            new Map(
                Array.from({ length: 96 * 96 }, (_, index): [string, number] => [
                    cellKey(index % 96, Math.floor(index / 96)),
                    -256,
                ]),
            ),
        );
        const { tiles, painted } = fixture(deepest);
        const times: number[] = [];
        let lastFinished = 0;
        for (let frame = 0; frame < 120; frame++) {
            const before = painted.size;
            const start = performance.now();
            tiles.update(frame);
            times.push(performance.now() - start);
            if (painted.size > before) lastFinished = frame;
        }
        // Blocks were drawn, whole; only the images that worked on them are looked at.
        expect(painted.size).toBeGreaterThanOrEqual(4);
        const sorted = times.slice(1, lastFinished + 1).sort((a, b) => a - b);
        expect(sorted[Math.floor(sorted.length / 2)]).toBeLessThan(10);
    });

    describe("the flat ground, with the layout of the map", () => {
        // Indoors from x 512 on (cell 32), a floor of the Carte tool on the cell 20,20, grass tiles of the map below
        // y 448 (cell 28).
        let layoutVersion = 1;
        let indoorsFrom = 32;
        const layout: GroundLayout = {
            outdoor: (cellX) => cellX < indoorsFrom,
            paved: (cellX, cellY) => cellX === 20 && cellY === 20,
            mapGrass: (_cellX, cellY) => cellY >= 28,
            version: () => layoutVersion,
        };
        const sandAt = (cells: [number, number][]) =>
            withSoils(undefined, new Map(cells.map(([x, y]): [string, number] => [cellKey(x, y), 4])));
        const sandBlock = (): TerrainData =>
            sandAt(
                Array.from({ length: 16 * 16 }, (_, index): [number, number] => [
                    16 + (index % 16),
                    16 + Math.floor(index / 16),
                ]),
            );

        it("draws the soil painted on flat ground, on a map without relief, opaque", () => {
            const { settle, painted, tiles } = fixture(sandBlock(), undefined, { layout });
            settle();
            const block = painted.get("relief-block:1,1");
            expect(block).toBeDefined();
            if (!block) return;
            // The cell 18,18: pixel (32 + 8, 32 + 8) of the block.
            expect(kindOf(pixelOf(block, 40, 40))).toBe("sand");
            expect(block[(40 * 256 + 40) * 4 + 3]).toBe(255);
            expect(tiles.isActive()).toBe(true);
            expect(tiles.groundPointAt({ x: 300, y: 300 })).toEqual({ x: 300, y: 300 });
        });

        it("leaves the rooms and the floors of the Carte tool to the map: transparent", () => {
            const { settle, painted } = fixture(sandBlock(), undefined, { layout });
            settle();
            const block = painted.get("relief-block:1,1");
            if (!block) throw new Error("no block");
            // The cell 20,20 (floor of the Carte tool): pixel (64 + 8, 64 + 8).
            expect(block[(72 * 256 + 72) * 4 + 3]).toBe(0);
            const indoors = sandAt(Array.from({ length: 16 }, (_, index): [number, number] => [33 + index, 18]));
            const inside = fixture(indoors, undefined, { layout });
            inside.settle();
            const room = inside.painted.get("relief-block:2,1");
            if (room) expect(room[(40 * 256 + 40) * 4 + 3]).toBe(0);
        });

        it("draws the grass tiles of the map in the grass of the season, again when the season changes", () => {
            let season: Season | undefined = Season.Spring;
            const { settle, painted, tiles } = fixture(undefined, undefined, { layout, season: () => season });
            settle();
            const block = painted.get("relief-block:1,1");
            if (!block) throw new Error("no block");
            // Row 230 of the block 1,1 is y 486: a grass tile of the map.
            const color = pixelOf(block, 100, 230);
            expect([...rampsFor(Season.Spring).grass, GRASS_LINE].some((shade) => same(shade, color))).toBe(true);
            const drawn = tiles.redraws();
            season = Season.Autumn;
            settle();
            expect(tiles.redraws()).toBeGreaterThan(drawn);
        });

        it("draws a block of flat ground again when a soil is painted on it or a mount is raised", () => {
            const { settle, tiles, setTerrain } = fixture(sandBlock(), undefined, { layout });
            settle();
            const drawn = tiles.redraws();
            // Gravel painted on the flat cell 20,17 (nothing dug in the block).
            setTerrain(withSoils(sandBlock(), new Map([[cellKey(20, 17), 6]])));
            settle();
            expect(tiles.redraws()).toBeGreaterThan(drawn);
            const painted = tiles.redraws();
            // A mount raised on the cell 22,22.
            setTerrain(
                withHeights(withSoils(sandBlock(), new Map([[cellKey(20, 17), 6]])), new Map([[cellKey(22, 22), 64]])),
            );
            settle();
            expect(tiles.redraws()).toBeGreaterThan(painted);
        });

        it("hides the blocks drawn in 3/4 as soon as the editor opens, until they are drawn flat", () => {
            const { settle, tiles, images } = fixture(sandBlock(), undefined, { layout });
            settle();
            expect(images.some((image) => image.visible)).toBe(true);
            tiles.setProjected(false);
            tiles.update(10_000);
            // Not one block left in the old way: they would not match the clicks nor the avatars.
            expect(images.filter((image) => image.visible).length).toBeLessThanOrEqual(1);
            settle();
            expect(images.some((image) => image.visible)).toBe(true);
        });

        it("draws a block again when a room is built over it", () => {
            const { settle, tiles } = fixture(sandBlock(), undefined, { layout });
            settle();
            const drawn = tiles.redraws();
            // Walls built: the room now starts at x 256, over the block 1,1.
            indoorsFrom = 16;
            layoutVersion++;
            settle();
            expect(tiles.redraws()).toBeGreaterThan(drawn);
            indoorsFrom = 32;
            layoutVersion++;
        });

        it("draws a hollow at its place while the map is edited, and in 3/4 again once it is closed", () => {
            const deep = withHeights(
                undefined,
                new Map(
                    Array.from({ length: 64 * 64 }, (_, index): [string, number] => [
                        cellKey(index % 64, Math.floor(index / 64)),
                        -64,
                    ]),
                ),
            );
            const { settle, painted, tiles } = fixture(deep, undefined, { layout });
            tiles.setProjected(false);
            settle();
            expect(tiles.isActive()).toBe(false);
            const flat = painted.get("relief-block:1,1");
            if (!flat) throw new Error("no block");
            // Flat: the first row of the block is the ground at its place, opaque (in 3/4 it would be the floor of a
            // ground 32 px north, the same; the drop shows on the faces only).
            const drawn = tiles.redraws();
            tiles.setProjected(true);
            settle();
            expect(tiles.redraws()).toBeGreaterThan(drawn);
            expect(tiles.isActive()).toBe(true);
        });
    });

    describe("the water in pixel art", () => {
        /** A state of the water: `depth` px over the cells x 16 to 31, y 16 to 31 (the block 1,1), dry elsewhere. */
        const lake = (seq: number, depth: number): WaterState => {
            const bytes = new Uint8Array(64 * 64 * 2);
            for (let y = 16; y < 32; y++) {
                for (let x = 16; x < 32; x++) {
                    const eighths = Math.round(depth * 8);
                    bytes[(y * 64 + x) * 2] = eighths & 255;
                    bytes[(y * 64 + x) * 2 + 1] = eighths >> 8;
                }
            }
            return { x: 0, y: 0, width: 64, height: 64, seq, full: true, depths: bytes };
        };
        const hollow = () =>
            withHeights(
                undefined,
                new Map(
                    Array.from({ length: 64 * 64 }, (_, index): [string, number] => [
                        cellKey(index % 64, Math.floor(index / 64)),
                        -64,
                    ]),
                ),
            );
        const count = (block: Uint8ClampedArray, colors: readonly (readonly number[])[]) => {
            let found = 0;
            for (let index = 0; index < 256 * 256; index++) {
                const color = [block[index * 4], block[index * 4 + 1], block[index * 4 + 2]];
                if (colors.some((shade) => same(shade, color))) found++;
            }
            return found;
        };

        it("paints a lake with the shades of the water", () => {
            const { settle, painted, water, skip } = fixture(hollow());
            water.receive(lake(1, 20), 0);
            skip(10_000);
            settle();
            const block = painted.get("relief-block:1,1");
            if (!block) throw new Error("no block");
            expect(count(block, RAMPS.water)).toBeGreaterThan(20_000);
        });

        it("draws a lake 15.7 px deep as water one wades in (clear), as the walk sees it, not rounded up to 16", () => {
            const { settle, painted, water, skip } = fixture(hollow());
            water.receive(lake(1, 15.7), 0);
            skip(10_000);
            settle();
            const block = painted.get("relief-block:1,1");
            if (!block) throw new Error("no block");
            expect(count(block, [RAMPS.water[3]])).toBeGreaterThan(20_000);
            expect(count(block, RAMPS.water.slice(0, 3))).toBe(0);
        });

        it("draws a block again only when its water changes in a way that shows", () => {
            const { settle, tiles, water, clock, skip } = fixture(hollow());
            water.receive(lake(1, 20), 0);
            skip(10_000);
            settle();
            const drawn = tiles.redraws();
            water.receive(lake(2, 21), clock());
            skip(10_000);
            settle();
            expect(tiles.redraws()).toBe(drawn);
            water.receive(lake(3, 33), clock());
            skip(10_000);
            settle();
            expect(tiles.redraws()).toBeGreaterThan(drawn);
        });

        it("draws a thin flood on flat ground as clear water edged with foam, not as deep water", () => {
            const flat = withSoils(
                undefined,
                new Map(
                    Array.from({ length: 64 * 64 }, (_, index): [string, number] => [
                        cellKey(index % 64, Math.floor(index / 64)),
                        4,
                    ]),
                ),
            );
            const layout: GroundLayout = {
                outdoor: () => true,
                paved: () => false,
                mapGrass: () => false,
                version: () => 1,
            };
            const { settle, painted, water, skip } = fixture(flat, undefined, { layout });
            water.receive(lake(1, 1), 0);
            skip(10_000);
            settle();
            const block = painted.get("relief-block:1,1");
            if (!block) throw new Error("no block");
            // Clear water, with a line of foam 1 px wide where it ends (the edges of the block here).
            expect(count(block, [RAMPS.water[3]])).toBeGreaterThan(20_000);
            expect(count(block, [[0xd6, 0xec, 0xf6]])).toBeLessThan(2_000);
        });

        it("lets the bottom show through the water while the relief is edited", () => {
            const { settle, painted, water, tiles, skip } = fixture(hollow());
            water.receive(lake(1, 20), 0);
            skip(10_000);
            settle();
            const before = painted.get("relief-block:1,1");
            if (!before) throw new Error("no block");
            const plain = count(before, RAMPS.grass);
            tiles.setSeeThrough(true);
            settle();
            const through = painted.get("relief-block:1,1");
            if (!through) throw new Error("no block");
            // One pixel of the lake in two shows the grass of its bottom.
            expect(count(through, RAMPS.grass)).toBeGreaterThan(plain + 10_000);
        });
    });
});
