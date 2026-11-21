import {
    cellOf,
    heightAt,
    snowCover,
    snowCoverOf,
    SOILS,
    soilAt,
    DEFAULT_POOL_STYLE,
    poolStyleAt,
    poolStyleOf,
    TERRAIN_CELL,
    TERRAIN_CHUNK,
    TILE_PX,
} from "@workadventure/map-editor";
import { Season } from "@workadventure/map-editor";
import type { PoolStyle, TerrainData } from "@workadventure/map-editor";
import type { OutdoorGrid } from "@wa/front/Phaser/Game/Outdoor/OutdoorGrid";
import { waterCycleNow } from "@wa/front/Phaser/Game/Weather/Frost";
import { followsServerGround } from "@wa/front/Phaser/Game/Weather/GroundSource";
import type { WaterCycle } from "@wa/front/Phaser/Game/Weather/Frost";
import type { WaterRing } from "@wa/front/Phaser/Game/Catastrophe/MeteorFall";
import type { GameScene } from "../GameScene";
import { createBlockSurface } from "../Weather/BlockSurface";
import type { BlockCanvasArea, BlockSnapshot, BlockSurface } from "../Weather/BlockSurface";
import { paddedView, wellInside } from "../Weather/WeatherFrame";
import type { WeatherView } from "../Weather/WeatherFrame";
import { isBasicActive } from "../../../Stores/BasicModeStore";
import {
    DEEP_WATER_COLOR,
    deepWaterAlpha,
    groundAlpha,
    raisedAlpha,
    SOIL_TINTS,
    SHALLOW_WATER,
    SHORE_PX,
    SHORE_WATER,
    slopeAlpha,
    slopeShade,
    SNOW_COLOR,
    snowAlpha,
} from "./TerrainShading";
import {
    ASH_COLOR,
    ashAlpha,
    FIRE_GLOW_COLOR,
    fireGlowAlpha,
    GRASS_COLOR,
    grassAlpha,
    mottledCover,
    STRAW_COLOR,
    strawAlpha,
    strawLevel,
} from "./MeadowState";
import type { MeadowState } from "./MeadowState";
import type { TerrainWater } from "./TerrainWater";
import { GROUND_TEXTURES, TexturedGround, WATER_FRAMES } from "./TexturedGround";
import type { GroundArea } from "./TexturedGround";
import { GroundSplat } from "./GroundSplat";
import { classicPoolsShown, imagePoolCells, imagePoolsOf, signatureOf } from "./ImagePools";
import { PoolLadders, topEdgesOf } from "./PoolLadders";
import type { ImagePool, PlacedPool } from "./ImagePools";

/** Over the grass of the seasons (0.6), under the puddles (0.7), the objects and the avatars. */
const TERRAIN_DEPTH = 0.65;
/** Relief drawn beyond each edge of the screen, in a share of its size: a scroll rarely asks for a new drawing. */
const DRAW_MARGIN = 0.25;
const NO_SHIFT = { columns: 0, rows: 0 };
/** The textured grounds, under the relief canvas (its slopes, straw, ashes and water are drawn over them). */
const SOIL_GROUND_DEPTH = TERRAIN_DEPTH - 0.04;
const GRASS_GROUND_DEPTH = TERRAIN_DEPTH - 0.03;
const SNOW_GROUND_DEPTH = TERRAIN_DEPTH - 0.02;
/** The water over the relief canvas (its slopes show under it), under the puddles (0.7). */
const WATER_DEPTH = TERRAIN_DEPTH + 0.01;
const DEEP_WATER_DEPTH = TERRAIN_DEPTH + 0.02;
/** Each image of the twinkling water lasts this long (ms): the scene is drawn again for the next one. */
const RIPPLE_MS = 170;
/** The surface of the water drawn by its shader moves smoothly: the scene is drawn again this often for it. */
const WATER_FRAME_MS = 50;

/** The grounds of the relief drawn with their texture: each soil, the grass (green or autumn) and the snow. */
interface Grounds {
    soils: TexturedGround[];
    grass: TexturedGround;
    autumnGrass: TexturedGround;
    snow: TexturedGround;
    water: TexturedGround;
    deepWater: TexturedGround;
}

/** While the relief is edited, the water is drawn this much fainter, so the bottom shows through. */
const SEE_THROUGH = 0.45;

/** The relief under a canvas, as layers to paint: kept from one drawing to the next. */
interface ReliefLayers extends BlockCanvasArea {
    terrain: TerrainData | undefined;
    ground: Uint8Array;
    /** The height of the cells raised over the ground. */
    raised: Uint8Array;
    /** The snow of the heights over the canvas (0 to 255), and the season it was read for. */
    snow: Uint8Array | undefined;
    season: Season | undefined;
    /** For each soil painted on the canvas (by its number in the map): 1 on its cells. */
    soils: Map<number, Uint8Array>;
    shaded: Uint8Array;
    lit: Uint8Array;
    /** Whether any cell of the canvas is dug or sloped: nothing to paint otherwise. */
    dug: boolean;
    /** The outdoors these layers were read for, and 1 on each outdoor cell (shaders only): indoors nothing freezes. */
    outdoorGrid: OutdoorGrid | undefined;
    outdoor: Uint8Array | undefined;
    /** The styles of the pools these layers were read with: a pool drawn again when its colours change. */
    poolStyles: readonly PoolStyle[] | undefined;
    /** The ladders put by hand on the pools (cells "x,y"), as the map keeps them. */
    poolLadders: readonly string[] | undefined;
}

/**
 * The meadow over a canvas, as layers to paint. Kept apart from the relief: the server tells the meadow again every
 * few seconds, and the relief, long to read on a wide view, must not be read again for it.
 */
interface MeadowLayers extends BlockCanvasArea {
    /** The state of the meadow these layers were read from. */
    version: number;
    /** The grass of the meadow over the canvas; undefined where none grows. */
    grass: Uint8Array | undefined;
    /** The straw of the grass gone dry over the canvas (see strawLevel); undefined on a green meadow. */
    straw: Uint8Array | undefined;
    /** The ash and the fire of the meadow over the canvas; undefined where nothing burnt nor burns. */
    ash: Uint8Array | undefined;
    fire: Uint8Array | undefined;
    /** The snow that fell, as it whitens the ground over the canvas (0 to 255); undefined where none lies. */
    snow: Uint8Array | undefined;
    /** The ice the server keeps over the water (iceByte); undefined where none is frozen. */
    ice: Uint8Array | undefined;
    /** Whether these layers show the snow of the server (GroundSource): read again when the player changes of weather. */
    server: boolean;
}

/**
 * Draws the relief of the ground and the water of its hollows: one small image, a pixel for each cell of the relief,
 * painted again only when the relief, the water or the part of the map on the screen changed. A map without relief
 * is not looked at.
 */
export class TerrainView {
    private readonly surface: BlockSurface;
    private drawn: WeatherView | undefined;
    private lastKey: string | undefined;
    private visible = false;
    private seeThrough = false;
    private relief: ReliefLayers | undefined;
    private meadowLayers: MeadowLayers | undefined;
    /** The ground once painted on the canvas (relief and meadow), kept while the water alone moves. */
    private painted:
        | { relief: ReliefLayers; meadow: MeadowLayers | undefined; snapshot: BlockSnapshot; imagePools: string }
        | undefined;
    /** The pools placed as images, drawn by the shaders in their place (ImagePools.ts), and the ones hidden for it. */
    private imagePools: { pools: ImagePool[]; signature: string } = { pools: [], signature: "" };
    private poolSettingsSeen: { pools: unknown; ladders: unknown; version: number } = {
        pools: undefined,
        ladders: undefined,
        version: 0,
    };
    private readonly hiddenPools = new Map<string, PlacedPool>();
    /** The ladders of the pools drawn by the shaders. */
    private readonly ladders: PoolLadders | undefined;
    private everywhere = new Uint8Array(0);
    /** The textured grounds; none with a surface of its own (tests): the soils are then flat tints. */
    private readonly grounds: Grounds | undefined;
    /** The grounds and the water drawn by shaders, where the graphics card runs them (the masked grounds otherwise). */
    private readonly splat: GroundSplat | undefined;
    /** The state of the ground its masks were worked out for: they are kept while it does not change. */
    private groundStamp = 0;
    private groundState: { terrain: TerrainData | undefined; meadow: number; season: Season | undefined } | undefined;
    private lastRipple = 0;
    private cycle: WaterCycle | undefined;
    /** The snow of the map, laid on the ice too (in fiftieths: the scene is drawn again only when it shows). */
    private snowOnIce = 0;
    /** Whether the ice shown is the one the server keeps (GroundSource): the water shader is told when it changes. */
    private serverIce = false;
    private poolsOf: { terrain: TerrainData | undefined; any: boolean } | undefined;
    private wet = new Uint8Array(0);
    private shore = new Uint8Array(0);

    constructor(
        private readonly scene: GameScene,
        private readonly water: TerrainWater,
        surface?: BlockSurface,
        /** The meadow of the map: its grass is drawn on the ground, under the water. */
        private readonly meadow?: MeadowState,
        /** The season of the map: the snow holds on its heights, lower in winter. None: no snow is drawn. */
        private readonly season?: () => Season | undefined,
    ) {
        // The shaders draw the soils and the grass: the canvas keeps only the shades of the relief, smooth. Without
        // them the mottled grass and the soils are on the canvas: sharp cells, each keeps its own shade.
        this.splat = surface ? undefined : GroundSplat.create(scene, SOIL_GROUND_DEPTH, WATER_DEPTH);
        this.ladders = this.splat ? new PoolLadders(scene) : undefined;
        this.surface = surface ?? createBlockSurface(scene, TERRAIN_DEPTH, this.splat !== undefined);
        this.grounds = surface || this.splat ? undefined : createGrounds(scene);
    }

    /** While the relief is edited: the water fainter, so what is dug under it can be seen. */
    public setSeeThrough(seeThrough: boolean): void {
        this.seeThrough = seeThrough;
    }

    public update(now: number): void {
        // Basique shows the ground of the map as it is: no water, relief, soils nor grass drawn over it.
        if (isBasicActive() || (!this.water.hasAnything() && !this.meadowShows() && !this.hasPools())) {
            if (this.visible) {
                this.surface.hide();
                this.hideGrounds();
                this.visible = false;
                this.lastKey = undefined;
                this.drawn = undefined;
                this.scene.markDirty();
            }
            return;
        }
        this.ripple(now);
        this.flowCycle();
        const camera = this.scene.cameras.main.worldView;
        const screen = { x: camera.x, y: camera.y, width: camera.width, height: camera.height };
        this.readImagePools();
        const key = `${this.water.drawKey(now)}:${this.seeThrough}:${this.meadow?.version() ?? 0}:${this.season?.() ?? ""}:${this.imagePools.signature}:${this.poolSettingsVersion()}:${followsServerGround()}`;
        const inside = this.drawn !== undefined && wellInside(this.drawn, screen, DRAW_MARGIN / 5);
        if (key === this.lastKey && inside) return;
        this.lastKey = key;
        // What was drawn reaches beyond the screen: while a scroll stays inside it, the same part of the map is
        // drawn again (the water alone changed), so the relief read for it is kept. Reading the relief again at
        // every drawing made the game stutter whenever the avatar walked.
        if (!inside || !this.drawn) this.drawn = paddedView(screen, DRAW_MARGIN);
        this.draw(this.drawn, now);
        this.visible = true;
        this.scene.markDirty();
    }

    /** A number that changes whenever the styles or the hand ladders of the pools of the map change: drawn again then. */
    private poolSettingsVersion(): number {
        const settings = this.scene.getGameMap?.()?.getWamFile()?.getWam().settings;
        const seen = this.poolSettingsSeen;
        if (seen.pools !== settings?.pools || seen.ladders !== settings?.poolLadders) {
            this.poolSettingsSeen = {
                pools: settings?.pools,
                ladders: settings?.poolLadders,
                version: seen.version + 1,
            };
        }
        return this.poolSettingsSeen.version;
    }

    private draw(view: WeatherView, now: number): void {
        const canvas = this.surface.begin(view, TERRAIN_CELL);
        const size = canvas.columns * canvas.rows;
        const relief = this.reliefOver(canvas);
        const meadow = this.meadowOver(canvas);
        if (this.everywhere.length !== size) {
            this.everywhere = new Uint8Array(size).fill(1);
            this.wet = new Uint8Array(size);
            this.shore = new Uint8Array(size);
        }
        const { everywhere, wet, shore } = this;
        // The ground changes seldom, the water five times a second while it moves: the ground is painted once for a
        // relief, a meadow and a canvas, then laid back under the water.
        const kept = this.painted;
        if (
            !kept ||
            kept.relief !== relief ||
            kept.meadow !== meadow ||
            kept.imagePools !== this.imagePools.signature ||
            !this.surface.restore?.(kept.snapshot)
        ) {
            // The soils first: the shades of the relief and the water are drawn over them.
            if (this.splat) {
                const imageCells = imagePoolCells(this.imagePools.pools, areaOf(canvas));
                this.splat.setGround(areaOf(canvas), {
                    soils: relief.soils,
                    grass: meadow?.grass,
                    snow: thickestSnow(relief.dug ? snowOf(relief.snow) : undefined, snowOf(meadow?.snow)),
                    ice: meadow?.ice,
                    autumn: this.season?.() === Season.Autumn ? 1 : 0,
                    dug: relief.ground,
                    raised: relief.raised,
                    straw: meadow?.straw,
                    ash: meadow?.ash,
                    fire: meadow?.fire,
                    outdoor: relief.outdoor,
                    poolStyles: relief.poolStyles,
                    imagePools: imageCells,
                });
                this.ladders?.draw(
                    areaOf(canvas),
                    topEdgesOf(
                        poolMaskOf(relief.soils, imageCells, relief.poolStyles, size),
                        canvas.columns,
                        canvas.rows,
                    ),
                    new Set(relief.poolLadders),
                );
            } else if (this.grounds) {
                this.layGrounds(this.grounds, canvas, relief, meadow);
            } else {
                for (const [code, cells] of relief.soils) {
                    const tint = SOIL_TINTS[SOILS[code - 1]];
                    if (tint) {
                        this.surface.paintField(canvas, cells, everywhere, NO_SHIFT, tint.color, () => tint.alpha);
                    }
                }
                if (meadow?.grass) {
                    this.surface.paintField(canvas, meadow.grass, everywhere, NO_SHIFT, GRASS_COLOR, grassAlpha);
                }
            }
            // With the shaders, the straw, the ash and the fire are drawn by the ground shader, in clear patches.
            if (meadow?.straw && !this.splat) {
                // The grass gone dry under the heat and the wind: straw over the green.
                this.surface.paintField(canvas, meadow.straw, everywhere, NO_SHIFT, STRAW_COLOR, strawAlpha);
            }
            if (meadow?.ash && !this.splat) {
                // What a fire left: the ground blackened, until the grass grows back.
                this.surface.paintField(canvas, meadow.ash, everywhere, NO_SHIFT, ASH_COLOR, ashAlpha);
            }
            if (meadow?.fire && !this.splat) {
                // The tiles on fire glow on the ground, under their flames.
                this.surface.paintField(canvas, meadow.fire, everywhere, NO_SHIFT, FIRE_GLOW_COLOR, fireGlowAlpha);
            }
            const fallen = meadow?.snow;
            if (fallen && !relief.dug && !this.splat && !this.grounds) {
                // The snow that fell on a map without relief, when neither shaders nor textures draw the ground.
                this.surface.paintField(canvas, fallen, everywhere, NO_SHIFT, SNOW_COLOR, (level) =>
                    snowAlpha(level / 255),
                );
            }
            // With the shaders, the relief is shaded by the ground shader itself, in clear steps.
            if (relief.dug && !this.splat) {
                // Under textured grounds and water the depth and the slopes already show: the dark of the hollow and
                // the shades of the slopes, made for bare ground, are halved, so that they do not spread a muddy blur.
                const hollow = this.grounds ? 0.5 : 1;
                this.surface.paintField(
                    canvas,
                    relief.ground,
                    everywhere,
                    NO_SHIFT,
                    0x000000,
                    (level) => groundAlpha(-level) * hollow,
                );
                this.surface.paintField(
                    canvas,
                    relief.raised,
                    everywhere,
                    NO_SHIFT,
                    0xffffff,
                    (level) => raisedAlpha(level) * hollow,
                );
                const snow = thickestSnow(relief.snow, meadow?.snow);
                if (snow && !this.grounds) {
                    this.surface.paintField(canvas, snow, everywhere, NO_SHIFT, SNOW_COLOR, (level) =>
                        snowAlpha(level / 255),
                    );
                }
                this.surface.paintField(
                    canvas,
                    relief.shaded,
                    everywhere,
                    NO_SHIFT,
                    0x000000,
                    (level) => slopeAlpha(level / 255) * hollow,
                );
                this.surface.paintField(
                    canvas,
                    relief.lit,
                    everywhere,
                    NO_SHIFT,
                    0xffffff,
                    (level) => slopeAlpha(level / 255) * hollow,
                );
            }
            const snapshot = this.surface.snapshot?.();
            this.painted = snapshot ? { relief, meadow, snapshot, imagePools: this.imagePools.signature } : undefined;
        }
        // Water lies in the hollows, and on flat ground where they overflow or where a source pours.
        const anyWater = this.water.levelsOver(
            canvas.x / TERRAIN_CELL,
            canvas.y / TERRAIN_CELL,
            canvas.columns,
            canvas.rows,
            now,
            wet,
        );
        if (this.splat) {
            this.splat.setWater(anyWater ? wet : undefined, this.seeThrough ? SEE_THROUGH : 1);
        } else if (this.grounds) {
            this.layWater(this.grounds, canvas, anyWater ? wet : undefined);
        } else if (anyWater) {
            for (let index = 0; index < size; index++) shore[index] = wet[index] > 0 && wet[index] < SHORE_PX ? 1 : 0;
            const strength = this.seeThrough ? SEE_THROUGH : 1;
            this.surface.paintField(
                canvas,
                wet,
                everywhere,
                NO_SHIFT,
                SHALLOW_WATER.color,
                () => SHALLOW_WATER.alpha * strength,
            );
            this.surface.paintField(
                canvas,
                wet,
                everywhere,
                NO_SHIFT,
                DEEP_WATER_COLOR,
                (level) => deepWaterAlpha(level) * strength,
            );
            this.surface.paintField(canvas, shore, everywhere, NO_SHIFT, SHORE_WATER.color, () => SHORE_WATER.alpha);
        }
        this.surface.end();
    }

    /**
     * The relief under a canvas: how deep each cell is dug and how its slope takes the light. Read from the map once
     * for a relief and a canvas (the costly part of a drawing), then kept while the water alone moves; only the
     * chunks of the relief that hold something are looked at.
     */
    private reliefOver(canvas: BlockCanvasArea): ReliefLayers {
        const terrain: TerrainData | undefined = this.water.relief();
        const kept = this.relief;
        if (
            kept &&
            kept.terrain === terrain &&
            kept.season === this.season?.() &&
            kept.x === canvas.x &&
            kept.y === canvas.y &&
            kept.columns === canvas.columns &&
            kept.rows === canvas.rows &&
            kept.outdoorGrid === this.scene.getOutdoorGrid?.() &&
            kept.poolStyles === this.scene.getGameMap?.()?.getWamFile()?.getWam().settings?.pools &&
            kept.poolLadders === this.scene.getGameMap?.()?.getWamFile()?.getWam().settings?.poolLadders
        ) {
            return kept;
        }
        const size = canvas.columns * canvas.rows;
        const season = this.season?.();
        const outdoors = this.scene.getOutdoorGrid?.();
        const layers: ReliefLayers = {
            terrain,
            x: canvas.x,
            y: canvas.y,
            columns: canvas.columns,
            rows: canvas.rows,
            ground: new Uint8Array(size),
            raised: new Uint8Array(size),
            snow: undefined,
            season,
            soils: new Map(),
            shaded: new Uint8Array(size),
            lit: new Uint8Array(size),
            dug: false,
            outdoorGrid: outdoors,
            outdoor: undefined,
            poolStyles: this.scene.getGameMap?.()?.getWamFile()?.getWam().settings?.pools,
            poolLadders: this.scene.getGameMap?.()?.getWamFile()?.getWam().settings?.poolLadders,
        };
        const left = canvas.x / TERRAIN_CELL;
        const top = canvas.y / TERRAIN_CELL;
        if (this.splat && outdoors) {
            const outdoor = new Uint8Array(size);
            for (let row = 0; row < canvas.rows; row++) {
                for (let column = 0; column < canvas.columns; column++) {
                    const x = (left + column + 0.5) * TERRAIN_CELL;
                    const y = (top + row + 0.5) * TERRAIN_CELL;
                    outdoor[row * canvas.columns + column] = outdoors.isOutdoorAt(x, y) ? 1 : 0;
                }
            }
            layers.outdoor = outdoor;
        }
        for (const key of Object.keys(terrain?.soil ?? {})) {
            const chunk = cellOf(key);
            const firstColumn = Math.max(0, chunk.x * TERRAIN_CHUNK - left);
            const lastColumn = Math.min(canvas.columns, (chunk.x + 1) * TERRAIN_CHUNK - left);
            const firstRow = Math.max(0, chunk.y * TERRAIN_CHUNK - top);
            const lastRow = Math.min(canvas.rows, (chunk.y + 1) * TERRAIN_CHUNK - top);
            for (let row = firstRow; row < lastRow; row++) {
                for (let column = firstColumn; column < lastColumn; column++) {
                    const code = soilAt(terrain, left + column, top + row);
                    if (code === 0) continue;
                    let cells = layers.soils.get(code);
                    if (!cells) {
                        cells = new Uint8Array(size);
                        layers.soils.set(code, cells);
                    }
                    cells[row * canvas.columns + column] = 1;
                }
            }
        }
        for (const key of Object.keys(terrain?.chunks ?? {})) {
            const chunk = cellOf(key);
            // The cells of the chunk and one more around: a slope shows on the rim of a hollow too.
            const firstColumn = Math.max(0, chunk.x * TERRAIN_CHUNK - 1 - left);
            const lastColumn = Math.min(canvas.columns, (chunk.x + 1) * TERRAIN_CHUNK + 1 - left);
            const firstRow = Math.max(0, chunk.y * TERRAIN_CHUNK - 1 - top);
            const lastRow = Math.min(canvas.rows, (chunk.y + 1) * TERRAIN_CHUNK + 1 - top);
            for (let row = firstRow; row < lastRow; row++) {
                for (let column = firstColumn; column < lastColumn; column++) {
                    const index = row * canvas.columns + column;
                    const height = heightAt(terrain, left + column, top + row);
                    if (height < 0) {
                        layers.ground[index] = Math.min(255, -height);
                        layers.dug = true;
                    } else if (height > 0) {
                        layers.raised[index] = Math.min(255, height);
                        layers.dug = true;
                        // The snow of the heights, outdoors only (a roof drawn in the map keeps it off).
                        const cover = season ? snowCover(height, season) : 0;
                        const cellX = left + column;
                        const cellY = top + row;
                        if (
                            cover > 0 &&
                            (!outdoors ||
                                outdoors.isOutdoorAt((cellX + 0.5) * TERRAIN_CELL, (cellY + 0.5) * TERRAIN_CELL))
                        ) {
                            layers.snow ??= new Uint8Array(size);
                            layers.snow[index] = Math.round(cover * 255);
                        }
                    }
                    const shade = slopeShade(terrain, left + column, top + row);
                    layers.shaded[index] = shade < 0 ? Math.round(-shade * 255) : 0;
                    layers.lit[index] = shade > 0 ? Math.round(shade * 255) : 0;
                    if (shade !== 0) layers.dug = true;
                }
            }
        }
        this.relief = layers;
        return layers;
    }

    /**
     * The meadow under a canvas: read again for each state the server tells, tile by tile (a tile with nothing on it,
     * most of a map, costs one look), on the cells of the tile that are outdoors for this browser (a roof drawn in
     * the map keeps the grass off).
     */
    /** Whether the meadow has anything to draw for this player: grass, a dry ground, or the snow of the server. */
    private meadowShows(): boolean {
        const meadow = this.meadow;
        return (
            meadow !== undefined &&
            (meadow.hasGrass() || (followsServerGround() && (meadow.hasSnow() || meadow.hasIce())))
        );
    }

    private meadowOver(canvas: BlockCanvasArea): MeadowLayers | undefined {
        const meadow = this.meadow;
        if (!meadow || !this.meadowShows()) {
            this.meadowLayers = undefined;
            return undefined;
        }
        // The snow of the server is for those who follow its weather (GroundSource).
        const server = followsServerGround();
        const kept = this.meadowLayers;
        if (
            kept &&
            kept.version === meadow.version() &&
            kept.server === server &&
            kept.x === canvas.x &&
            kept.y === canvas.y &&
            kept.columns === canvas.columns &&
            kept.rows === canvas.rows
        ) {
            return kept;
        }
        const size = canvas.columns * canvas.rows;
        const layers: MeadowLayers = {
            x: canvas.x,
            y: canvas.y,
            columns: canvas.columns,
            rows: canvas.rows,
            version: meadow.version(),
            grass: undefined,
            straw: undefined,
            ash: undefined,
            fire: undefined,
            snow: undefined,
            ice: undefined,
            server,
        };
        const outdoor = this.scene.getOutdoorGrid?.();
        const cellsATile = TILE_PX / TERRAIN_CELL;
        const left = canvas.x / TERRAIN_CELL;
        const top = canvas.y / TERRAIN_CELL;
        const lastTileX = Math.floor((left + canvas.columns - 1) / cellsATile);
        const lastTileY = Math.floor((top + canvas.rows - 1) / cellsATile);
        for (let tileY = Math.floor(top / cellsATile); tileY <= lastTileY; tileY++) {
            for (let tileX = Math.floor(left / cellsATile); tileX <= lastTileX; tileX++) {
                const cover = meadow.grassAt(tileX, tileY);
                const dryness = meadow.drynessAt(tileX, tileY);
                const ashes = meadow.ashAt(tileX, tileY);
                const flames = meadow.fireAt(tileX, tileY);
                const white = server ? Math.round(snowCoverOf(meadow.snowAt(tileX, tileY)) * 255) : 0;
                const frozen = server ? meadow.iceByteAt(tileX, tileY) : 0;
                if (cover === 0 && dryness === 0 && ashes === 0 && flames === 0 && white === 0 && frozen === 0) {
                    continue;
                }
                const firstRow = Math.max(0, tileY * cellsATile - top);
                const lastRow = Math.min(canvas.rows, (tileY + 1) * cellsATile - top);
                const firstColumn = Math.max(0, tileX * cellsATile - left);
                const lastColumn = Math.min(canvas.columns, (tileX + 1) * cellsATile - left);
                for (let row = firstRow; row < lastRow; row++) {
                    for (let column = firstColumn; column < lastColumn; column++) {
                        const cellX = left + column;
                        const cellY = top + row;
                        if (
                            outdoor &&
                            !outdoor.isOutdoorAt((cellX + 0.5) * TERRAIN_CELL, (cellY + 0.5) * TERRAIN_CELL)
                        ) {
                            continue;
                        }
                        const index = row * canvas.columns + column;
                        const drawn = cover === 0 ? 0 : mottledCover(cover, cellX, cellY);
                        if (drawn > 0) (layers.grass ??= new Uint8Array(size))[index] = drawn;
                        if (ashes > 0) (layers.ash ??= new Uint8Array(size))[index] = ashes;
                        if (flames > 0) (layers.fire ??= new Uint8Array(size))[index] = flames;
                        if (white > 0) (layers.snow ??= new Uint8Array(size))[index] = white;
                        if (frozen > 0) (layers.ice ??= new Uint8Array(size))[index] = frozen;
                        // A dry ground yellows with or without grass on it.
                        if (dryness > 0) (layers.straw ??= new Uint8Array(size))[index] = strawLevel(drawn, dryness);
                    }
                }
            }
        }
        this.meadowLayers = layers;
        return layers;
    }

    /**
     * Lays the textured grounds over the canvas: each soil where it is painted, the grass as thick as it grows (autumn
     * grass in autumn), the snow of the heights as it holds.
     */
    private layGrounds(
        grounds: Grounds,
        canvas: BlockCanvasArea,
        relief: ReliefLayers,
        meadow: MeadowLayers | undefined,
    ): void {
        const stamp = this.stampOfGround(relief.terrain, meadow);
        const area: GroundArea = {
            x: canvas.x,
            y: canvas.y,
            columns: canvas.columns,
            rows: canvas.rows,
            cell: TERRAIN_CELL,
        };
        grounds.soils.forEach((ground, index) => {
            const cells = relief.soils.get(index + 1);
            if (cells) ground.show(area, (cell) => cells[cell] ?? 0, stamp);
            else ground.hide();
        });
        const autumn = this.season?.() === Season.Autumn;
        const grass = meadow?.grass;
        (autumn ? grounds.grass : grounds.autumnGrass).hide();
        if (grass) (autumn ? grounds.autumnGrass : grounds.grass).show(area, (cell) => (grass[cell] ?? 0) / 255, stamp);
        else (autumn ? grounds.autumnGrass : grounds.grass).hide();
        const snow = thickestSnow(relief.dug ? relief.snow : undefined, meadow?.snow);
        if (snow) grounds.snow.show(area, (cell) => snowAlpha((snow[cell] ?? 0) / 255), stamp);
        else grounds.snow.hide();
    }

    /**
     * The state of the ground, as a number that changes with it (the relief, the meadow, the season): the masks of the
     * grounds are worked out once for each, then kept while the view moves.
     */
    private stampOfGround(terrain: TerrainData | undefined, meadow: MeadowLayers | undefined): number {
        const state = { terrain, meadow: meadow ? (this.meadow?.version() ?? 0) : -1, season: this.season?.() };
        const last = this.groundState;
        if (!last || last.terrain !== state.terrain || last.meadow !== state.meadow || last.season !== state.season) {
            this.groundState = state;
            this.groundStamp++;
        }
        return this.groundStamp;
    }

    /**
     * The water, textured: its shore bends as the edges of the grounds do, and the deep water darkens as deep as it
     * is. It moves with the water: its mask is worked out at each drawing of the water.
     */
    private layWater(grounds: Grounds, canvas: BlockCanvasArea, wet: Uint8Array | undefined): void {
        if (!wet) {
            grounds.water.hide();
            grounds.deepWater.hide();
            return;
        }
        const area: GroundArea = {
            x: canvas.x,
            y: canvas.y,
            columns: canvas.columns,
            rows: canvas.rows,
            cell: TERRAIN_CELL,
        };
        const strength = this.seeThrough ? SEE_THROUGH : 1;
        grounds.water.show(area, (cell) => ((wet[cell] ?? 0) > 0 ? 1 : 0), undefined, 0.9 * strength);
        // The dark of deep water stays inside the water: on a cell of the shore (a neighbour dry), the shallow water
        // alone draws the edge, sharp and uneven like the other grounds.
        const columns = canvas.columns;
        const inside = (cell: number): boolean =>
            (wet[cell] ?? 0) > 0 &&
            (wet[cell - 1] ?? 0) > 0 &&
            (wet[cell + 1] ?? 0) > 0 &&
            (wet[cell - columns] ?? 0) > 0 &&
            (wet[cell + columns] ?? 0) > 0;
        grounds.deepWater.show(
            area,
            (cell) => (inside(cell) ? deepWaterAlpha(wet[cell] ?? 0) : 0),
            undefined,
            strength,
        );
    }

    /**
     * The pools placed as images, drawn by the shaders in their place: their images hidden while they are, shown again
     * to compare (classicPoolsShown) or without the shaders.
     */
    private readImagePools(): void {
        const replace = this.splat !== undefined && !classicPoolsShown();
        const entities = replace
            ? (this.scene.getGameMapFrontWrapper?.()?.getEntitiesManager?.()?.getEntities().values() ?? [])
            : [];
        const placed = [...entities].filter((entity) => (entity.getPrefab().water?.length ?? 0) > 0);
        const pools = imagePoolsOf(placed);
        const signature = signatureOf(pools);
        const kept = new Set(pools.map((pool) => pool.entityId));
        for (const [id, entity] of this.hiddenPools) {
            if (kept.has(id)) continue;
            entity.setVisible(true);
            this.hiddenPools.delete(id);
        }
        for (const entity of placed) {
            if (!kept.has(entity.entityId)) continue;
            // Hidden again when its image showed up: an object is shown once its image is loaded, after this.
            if (entity.visible) {
                entity.setVisible(false);
                this.scene.markDirty();
            }
            this.hiddenPools.set(entity.entityId, entity);
        }
        if (signature !== this.imagePools.signature) this.imagePools = { pools, signature };
    }

    /** Whether the map has pools painted (cells kept as soils of a pool style): drawn even with no water nor grass. */
    private hasPools(): boolean {
        if (!this.splat) return false;
        if (this.imagePools.pools.length > 0) return true;
        const terrain = this.water.relief();
        if (this.poolsOf && this.poolsOf.terrain === terrain) return this.poolsOf.any;
        const any = Object.values(terrain?.soil ?? {}).some((codes) =>
            codes.some((code) => poolStyleOf(code) !== undefined),
        );
        this.poolsOf = { terrain, any };
        return any;
    }

    /** The frost, the ice and the wet ground of now, for the shaders: the scene is drawn again when they move. */
    private flowCycle(): void {
        if (!this.splat) return;
        const snow = Math.round((this.scene.getMapSnowCoverage?.() ?? 0) * 50) / 50;
        if (snow !== this.snowOnIce) {
            this.snowOnIce = snow;
            this.splat.setSnow(snow);
            this.scene.markDirty();
        }
        const server = followsServerGround();
        if (server !== this.serverIce) {
            this.serverIce = server;
            this.splat.setServerIce(server);
            this.scene.markDirty();
        }
        const cycle = waterCycleNow(this.scene.getGameMap().getWamFile()?.getWam().settings);
        if (cycle === this.cycle) return;
        this.cycle = cycle;
        this.splat.setCycle(cycle);
        this.scene.markDirty();
    }

    /** The ripples of the water twinkle in place: the next image of the water, a few times a second. */
    /**
     * The fronts of the waves of the comets fallen into the water, drawn by the water shader. False without it: the
     * meteors draw their circles then.
     */
    /** Whether the water shader draws the waves of the comets. */
    public drawsWaterRings(): boolean {
        return this.splat !== undefined;
    }

    public setWaterRings(rings: readonly WaterRing[]): boolean {
        if (!this.splat) return false;
        if (rings.length > 0 || this.splat.hasRings()) this.scene.markDirty();
        this.splat.setRings(rings);
        return true;
    }

    private ripple(now: number): void {
        if (this.splat) {
            if (this.splat.hasWater() && now - this.lastRipple >= WATER_FRAME_MS) {
                this.lastRipple = now;
                this.scene.markDirty();
            }
            return;
        }
        const grounds = this.grounds;
        if (!grounds?.water.isVisible() || now - this.lastRipple < RIPPLE_MS) return;
        this.lastRipple = now;
        const frame = WATER_FRAMES[Math.floor(now / RIPPLE_MS) % WATER_FRAMES.length];
        if (frame) grounds.water.setImage(frame);
        this.scene.markDirty();
    }

    private hideGrounds(): void {
        this.splat?.hide();
        this.ladders?.hide();
        if (!this.grounds) return;
        for (const ground of allGrounds(this.grounds)) ground.hide();
    }

    public destroy(): void {
        this.surface.destroy();
        this.splat?.destroy();
        this.ladders?.destroy();
        if (this.grounds) for (const ground of allGrounds(this.grounds)) ground.destroy();
    }
}

function areaOf(canvas: BlockCanvasArea): GroundArea {
    return { x: canvas.x, y: canvas.y, columns: canvas.columns, rows: canvas.rows, cell: TERRAIN_CELL };
}

/** The snow of the heights as the shader reads it: how much of the ground it covers, 0 to 255. */
/** The snow of the heights and the snow that fell, cell by cell: the thicker of the two. */
function thickestSnow(heights: Uint8Array | undefined, fallen: Uint8Array | undefined): Uint8Array | undefined {
    if (!heights || !fallen) return heights ?? fallen;
    return heights.map((level, cell) => Math.max(level, fallen[cell] ?? 0));
}

function snowOf(snow: Uint8Array | undefined): Uint8Array | undefined {
    if (!snow) return undefined;
    return snow.map((level) => Math.round(snowAlpha(level / 255) * 255));
}

function createGrounds(scene: GameScene): Grounds {
    return {
        soils: SOILS.map((name) => new TexturedGround(scene, GROUND_TEXTURES[name], SOIL_GROUND_DEPTH)),
        grass: new TexturedGround(scene, GROUND_TEXTURES.grass, GRASS_GROUND_DEPTH, true),
        autumnGrass: new TexturedGround(scene, GROUND_TEXTURES.autumnGrass, GRASS_GROUND_DEPTH, true),
        snow: new TexturedGround(scene, GROUND_TEXTURES.snow, SNOW_GROUND_DEPTH),
        water: new TexturedGround(scene, GROUND_TEXTURES.water, WATER_DEPTH),
        deepWater: new TexturedGround(scene, GROUND_TEXTURES.deepWater, DEEP_WATER_DEPTH, true),
    };
}

function allGrounds(grounds: Grounds): TexturedGround[] {
    return [...grounds.soils, grounds.grass, grounds.autumnGrass, grounds.snow, grounds.water, grounds.deepWater];
}

/**
 * The pools of a canvas, cell by cell, for their ladders: the number of ladders their pool asks for plus one (0: no
 * pool). The pools painted (soils of a pool style) and the pools placed as images (the default style).
 */
function poolMaskOf(
    soils: ReadonlyMap<number, Uint8Array>,
    images: Uint8Array | undefined,
    styles: readonly PoolStyle[] | undefined,
    size: number,
): Uint8Array {
    const mask = new Uint8Array(size);
    for (const [code, cells] of soils) {
        const style = poolStyleOf(code);
        if (style === undefined) continue;
        const ladders = poolStyleAt(styles, style).ladders;
        for (let cell = 0; cell < size; cell++) if (cells[cell]) mask[cell] = ladders + 1;
    }
    if (images) for (let cell = 0; cell < size; cell++) if (images[cell]) mask[cell] = DEFAULT_POOL_STYLE.ladders + 1;
    return mask;
}
