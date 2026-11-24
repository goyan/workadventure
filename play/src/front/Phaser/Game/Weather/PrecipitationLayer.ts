import * as Phaser from "phaser";
import type { WeatherView } from "./WeatherFrame";
import { FALL_HASH_WRAP } from "./FallHash";
import { rainLayer } from "./Rain";
import type { RainPlane, RainWind } from "./Rain";
import { FLAKE_KINDS, FLAKE_SHAPES, PX_PER_METRE, snowPlaneAlpha, snowSalt } from "./Snowfall";
import type { SnowPlaneCells } from "./Snowfall";
import type { AirPlane, PerspectiveCamera } from "./PerspectiveFall";
import { TOP_SHARE } from "./PerspectiveFall";
import {
    FLAKE_ATLAS_CELL,
    FLAKE_FRAG,
    RAIN_PERSPECTIVE_VERT,
    RAIN_VERT,
    SNOW_PERSPECTIVE_VERT,
    SNOW_VERT,
    STREAK_FRAG,
} from "./PrecipitationShaders";

/**
 * The rain and the snow drawn by the graphics card: one drawing for the drops, one for the flakes, whatever their
 * number. The processor only says which cells of the sky the view reads (rainPlanes, snowPlanes,
 * perspectiveDropPlanes, perspectiveFlakePlanes) and the graphics card works out, for each copy of each cell, what
 * Rain, Snowfall and PerspectiveFall work out on the processor (rainDropAt...): the same hash, the same falls, the same
 * wind and the same camera (PrecipitationShaders). Each drop is an instance of a quad, a streak, and each flake the
 * square of its pixel-art shape; those that do not show, are out of the view or fall over a roof go out of the clip
 * space in the vertex shader. Outdoors only (the outdoor rectangles of the weather, a texture) and thicker under the
 * clouds (their levels, a texture).
 *
 * Drawn with WebGL itself, between two drawings of Phaser (an Extern, which hands the context over and takes it back):
 * the programs, buffers and textures here are its own.
 */

/**
 * Where the outdoors are, read for an area of the map again only when what they are read from changes (the outdoor
 * grid, the raised cover). Undefined: everything is outdoors.
 */
export interface OutdoorSource {
    /** What the outdoors are read from: the same objects, the same outdoors. */
    owners: readonly unknown[];
    /** The outdoor rectangles over an area, map pixels, what is off the map included (outdoors, as isOutdoorCell). */
    rectsIn(area: WeatherView): readonly WeatherView[];
}

/** The parts of an area off a map of this size (map pixels): outdoors, as OutdoorGrid.isOutdoorCell says. */
export function offMapRects(area: WeatherView, mapWidth: number, mapHeight: number): WeatherView[] {
    const right = area.x + area.width;
    const bottom = area.y + area.height;
    const top = Math.max(area.y, 0);
    const low = Math.min(bottom, mapHeight);
    const rects: WeatherView[] = [];
    if (area.y < 0) rects.push({ x: area.x, y: area.y, width: area.width, height: Math.min(bottom, 0) - area.y });
    if (bottom > mapHeight) {
        const from = Math.max(area.y, mapHeight);
        rects.push({ x: area.x, y: from, width: area.width, height: bottom - from });
    }
    if (low > top && area.x < 0)
        rects.push({ x: area.x, y: top, width: Math.min(right, 0) - area.x, height: low - top });
    if (low > top && right > mapWidth) {
        const from = Math.max(area.x, mapWidth);
        rects.push({ x: from, y: top, width: right - from, height: low - top });
    }
    return rects.filter((rect) => rect.width > 0 && rect.height > 0);
}

/**
 * The outdoor mask of an area: one texel every `texel` map pixels, 255 where its centre is in one of the rectangles
 * (they lie on whole cells of the map, 8 px or more), 0 elsewhere.
 */
export function outdoorTexels(
    area: WeatherView,
    rects: readonly WeatherView[],
    texel: number,
): { width: number; height: number; texels: Uint8Array } {
    const width = Math.ceil(area.width / texel);
    const height = Math.ceil(area.height / texel);
    const texels = new Uint8Array(width * height);
    for (const rect of rects) {
        const left = Math.max(0, Math.round((rect.x - area.x) / texel));
        const right = Math.min(width, Math.round((rect.x + rect.width - area.x) / texel));
        const top = Math.max(0, Math.round((rect.y - area.y) / texel));
        const bottom = Math.min(height, Math.round((rect.y + rect.height - area.y) / texel));
        if (right <= left) continue;
        for (let row = top; row < bottom; row++) texels.fill(255, row * width + left, row * width + right);
    }
    return { width, height, texels };
}

/** The clouds the rain falls from (fieldLevels of the cloud patches) and how much they thicken it (rainUnderCloud). */
export interface CloudLevels {
    x: number;
    y: number;
    columns: number;
    rows: number;
    /** Map pixels a cell. */
    size: number;
    levels: ArrayLike<number>;
    /** The level of the thickest cloud (FOG_LEVELS). */
    most: number;
    effect: number;
}

/** A group of cells of the sky, read by one instance each and per copy: a plane of drops, a kind of flakes... */
export interface InstanceGroup {
    firstColumn: number;
    firstRow: number;
    columns: number;
    rows: number;
    copies: number;
}

/** Where each group starts among the instances (a large number for the slots left), and how many there are. */
export function instanceStarts(groups: readonly InstanceGroup[], slots: number): { starts: number[]; count: number } {
    const starts: number[] = [];
    let count = 0;
    for (const group of groups.slice(0, slots)) {
        starts.push(count);
        count += group.columns * group.rows * group.copies;
    }
    while (starts.length < slots) starts.push(UNUSED_START);
    return { starts, count };
}

/** The first column and row of a group as the hash reads them: brought under FALL_HASH_WRAP, exact in 32 bits. */
export function hashedCell(value: number): number {
    const wrapped = value % FALL_HASH_WRAP;
    return wrapped < 0 ? wrapped + FALL_HASH_WRAP : wrapped;
}

const UNUSED_START = 1e9;
/**
 * Map pixels a texel of the outdoor mask at the finest (coarser when its area would need too large a texture), and how
 * far it reaches beyond the view and where the drops land (read again when they leave it).
 */
const MASK_TEXEL = 4;
const MASK_MARGIN = 512;
const MASK_MOST_TEXELS = 2048;
/**
 * The farthest a drop or a flake in perspective lands from where it is seen (the wind over its fall, map pixels): the
 * mask reaches that far, and counts what lies beyond as outdoors.
 */
const MOST_REACH = 4096;
const FLAKE_ATLAS_WIDTH = 32;
const FLAKE_ATLAS_HEIGHT = 8;

type Uniforms = Record<string, number | readonly number[]>;
type ProgramName = "rain" | "rainPerspective" | "snow" | "snowPerspective";

interface Draw {
    program: ProgramName;
    count: number;
    uniforms: Uniforms;
}

const SOURCES: Record<ProgramName, { vertex: string; fragment: string }> = {
    rain: { vertex: RAIN_VERT, fragment: STREAK_FRAG },
    rainPerspective: { vertex: RAIN_PERSPECTIVE_VERT, fragment: STREAK_FRAG },
    snow: { vertex: SNOW_VERT, fragment: FLAKE_FRAG },
    snowPerspective: { vertex: SNOW_PERSPECTIVE_VERT, fragment: FLAKE_FRAG },
};

/** The colours of the flakes (snowTones). */
export interface FlakeTones {
    light: number;
    shade: number;
    alpha: number;
}

/** A program and where its uniforms and attributes are, read once. */
interface LinkedProgram {
    program: WebGLProgram;
    uniforms: { name: string; location: WebGLUniformLocation | null; type: number }[];
    projection: WebGLUniformLocation | null;
    view: WebGLUniformLocation | null;
    corner: number;
    index: number;
}

interface GlResources {
    gl: WebGLRenderingContext;
    instancing: ANGLE_instanced_arrays;
    /** null: it does not compile here, not tried again. */
    programs: Partial<Record<ProgramName, LinkedProgram | null>>;
    corners: WebGLBuffer;
    indices: WebGLBuffer;
    indexCapacity: number;
    mask: WebGLTexture;
    maskVersion: number;
    clouds: WebGLTexture;
    cloudsVersion: number;
    shapes: WebGLTexture;
}

/** A game object that hands its drawing over to the layer (Phaser calls it in the order of the display list). */
class PrecipitationExtern extends Phaser.GameObjects.Extern {
    constructor(
        scene: Phaser.Scene,
        private readonly draw: (
            drawingContext: Phaser.Renderer.WebGL.DrawingContext,
            matrix: Phaser.GameObjects.Components.TransformMatrix,
        ) => void,
    ) {
        super(scene);
    }

    public override render(
        _renderer: Phaser.Renderer.WebGL.WebGLRenderer,
        drawingContext: Phaser.Renderer.WebGL.DrawingContext,
        calcMatrix: Phaser.GameObjects.Components.TransformMatrix,
    ): void {
        this.draw(drawingContext, calcMatrix);
    }
}

export class PrecipitationLayer {
    private readonly object: PrecipitationExtern;
    private draws: Draw[] = [];
    private resources: GlResources | undefined;
    /** The outdoor mask on the processor: one byte a texel over its area, 255 outdoors. */
    private mask: { area: WeatherView; width: number; height: number; texels: Uint8Array } | undefined;
    private maskOwners: readonly unknown[] | undefined;
    private maskVersion = 0;
    private view: WeatherView | undefined;
    private outdoors: OutdoorSource | undefined;
    /** How far from where they are seen the drops of this drawing may land (perspective), map pixels. */
    private reach = 0;
    private clouds: CloudLevels | undefined;
    private cloudsOf: ArrayLike<number> | undefined;
    private cloudsVersion = 0;
    private cloudTexels: { width: number; height: number; texels: Uint8Array } | undefined;
    private broken = false;
    private readonly onRestore = (): void => {
        // The context was lost, and every program, buffer and texture of the layer with it.
        this.resources = undefined;
    };

    private constructor(
        scene: Phaser.Scene,
        private readonly renderer: Phaser.Renderer.WebGL.WebGLRenderer,
        depth: number,
        /** The largest side of the outdoor mask, texels. */
        private readonly largestMask: number,
    ) {
        this.object = new PrecipitationExtern(scene, (context, matrix) => this.render(context, matrix));
        this.object.setDepth(depth).setVisible(false);
        scene.add.existing(this.object);
        renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, this.onRestore);
    }

    /**
     * Undefined without WebGL, without instanced drawing or where a vertex shader cannot read a texture: the processor
     * draws the rain then, thinner (MAX_DRAWN_COPIES).
     */
    public static create(scene: Phaser.Scene, depth: number): PrecipitationLayer | undefined {
        const renderer = scene.game.renderer;
        if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return undefined;
        const gl = renderer.gl;
        if (!gl.getExtension("ANGLE_instanced_arrays")) return undefined;
        if (Number(gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS)) < 2) return undefined;
        const largest = Math.min(MASK_MOST_TEXELS, Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0);
        return new PrecipitationLayer(scene, renderer, depth, largest);
    }

    /**
     * Starts a drawing of the weather over the view: what falls is added after it (rain...), and shown by end().
     * `outdoors` and `clouds` are read again only when they change (the weather keeps the same levels while they do
     * not).
     */
    public begin(view: WeatherView, outdoors: OutdoorSource | undefined, clouds: CloudLevels | undefined): void {
        this.draws = [];
        this.view = view;
        this.outdoors = outdoors;
        this.reach = 0;
        this.updateClouds(clouds);
    }

    /**
     * The drops of the flat rain (rainPlanes over the view on a grid `fine` times finer, rainFineness): `copies` the
     * most a cell holds (cellCopies), `seconds` the clock of the fall (fallSeconds).
     */
    public rain(
        planes: readonly RainPlane[],
        options: { seconds: number; copies: number; intensity: number; fine: number; color: number },
    ): void {
        const { starts, count } = instanceStarts(planes, 3);
        if (count === 0) return;
        this.draws.push({
            program: "rain",
            count,
            uniforms: {
                uStarts: starts,
                uGrids: padded(planes.flatMap(grid), 4, 3),
                uOrigins: padded(
                    planes.flatMap((plane) => [plane.firstColumn * plane.cell, plane.firstRow * plane.cell]),
                    2,
                    3,
                ),
                uPlaneA: padded(
                    planes.flatMap((plane) => {
                        const layer = rainLayer(plane.layer);
                        return [plane.cell, layer.speed, layer.fall, layer.length];
                    }),
                    4,
                    3,
                ),
                uPlaneB: padded(
                    planes.flatMap((plane) => {
                        const layer = rainLayer(plane.layer);
                        // The near drops are thicker: they read as closer.
                        return [layer.alpha, layer.from, layer.full, plane.layer === 2 ? 1.5 : 1];
                    }),
                    4,
                    3,
                ),
                uPlaneC: padded(
                    planes.flatMap((plane) => [plane.across, plane.down, plane.layer]),
                    3,
                    3,
                ),
                uRain: [options.intensity, options.fine],
                uSeconds: options.seconds,
                uCopies: options.copies,
                uColor: rgb(options.color),
            },
        });
    }

    /**
     * The drops of the rain in perspective (perspectiveDropPlanes, the air moved by `shift`), each size of drop
     * `widths` screen pixels wide on the ground and `alphas` opaque, at most `widest` wide; `pixel` map pixels a
     * screen pixel.
     */
    public rainInPerspective(
        planes: readonly AirPlane[],
        options: {
            seconds: number;
            copies: number;
            view: WeatherView;
            camera: PerspectiveCamera;
            air: { shift: RainWind; wind: RainWind };
            speeds: readonly number[];
            widths: readonly number[];
            alphas: readonly number[];
            widest: number;
            pixel: number;
            color: number;
        },
    ): void {
        const { starts, count } = instanceStarts(planes, 3);
        if (count === 0) return;
        const { camera, air, view } = options;
        const slowest = Math.min(...planes.map((plane) => options.speeds[plane.kind])) * 0.9;
        this.reachFor(air.wind, TOP_SHARE * camera.height, slowest);
        this.draws.push({
            program: "rainPerspective",
            count,
            uniforms: {
                uStarts: starts,
                uGrids: padded(planes.flatMap(grid), 4, 3),
                uOrigins: padded(
                    planes.flatMap((plane) => airOrigin(plane, air.shift)),
                    2,
                    3,
                ),
                uSizeA: padded(
                    planes.flatMap((plane) => [plane.cell, plane.shown, options.speeds[plane.kind], plane.kind]),
                    4,
                    3,
                ),
                uSizeB: padded(
                    planes.flatMap((plane) => [options.widths[plane.kind], options.alphas[plane.kind]]),
                    2,
                    3,
                ),
                uCamera: [camera.x, camera.y, camera.height, TOP_SHARE * camera.height],
                uWind: [air.wind.x, air.wind.y],
                uCull: [view.x, view.y, view.width, view.height],
                uLook: [options.pixel, options.widest],
                uSeconds: options.seconds,
                uCopies: options.copies,
                uColor: rgb(options.color),
            },
        });
    }

    /** The flakes of the flat snow (snowPlanes over the view on a grid `fine` times finer, rainFineness). */
    public snow(
        planes: readonly SnowPlaneCells[],
        options: {
            seconds: number;
            copies: number;
            view: WeatherView;
            fine: number;
            still: boolean;
            tones: FlakeTones;
        },
    ): void {
        const { starts, count } = instanceStarts(planes, 6);
        if (count === 0) return;
        const { view } = options;
        this.draws.push({
            program: "snow",
            count,
            uniforms: {
                uStarts: starts,
                uGrids: padded(planes.flatMap(grid), 4, 6),
                uOrigins: padded(
                    planes.flatMap((plane) => [
                        plane.firstColumn * plane.cell + plane.shiftX,
                        plane.firstRow * plane.cell + plane.shiftY,
                    ]),
                    2,
                    6,
                ),
                uSnowA: padded(
                    planes.flatMap((plane) => [plane.cell, plane.amount, plane.speedX, plane.speedY]),
                    4,
                    6,
                ),
                uSnowB: padded(
                    planes.flatMap((plane) => [
                        snowSalt(plane.kind, plane.plane, 0),
                        FLAKE_KINDS[plane.kind].sizes[plane.plane],
                        snowPlaneAlpha(plane.plane),
                        FLAKE_KINDS[plane.kind].flutterPx,
                    ]),
                    4,
                    6,
                ),
                uCull: [view.x, view.y, view.width, view.height],
                uSnow: [options.fine, options.still ? 1 : 0],
                uSeconds: options.seconds,
                uCopies: options.copies,
                ...this.toneUniforms(options.tones),
            },
        });
    }

    /** The flakes of the snow in perspective (perspectiveFlakePlanes, the air moved by `air.shift`). */
    public snowInPerspective(
        planes: readonly AirPlane[],
        options: {
            seconds: number;
            copies: number;
            view: WeatherView;
            camera: PerspectiveCamera;
            air: { shift: RainWind; velocity: RainWind };
            /** Map pixels a pixel of a flake on the ground, and the most a flake grows near the camera. */
            pixel: number;
            biggest: number;
            still: boolean;
            tones: FlakeTones;
        },
    ): void {
        const { starts, count } = instanceStarts(planes, 3);
        if (count === 0) return;
        const { camera, air, view } = options;
        const slowest = Math.min(...planes.map((plane) => FLAKE_KINDS[plane.kind].fallSpeed)) * PX_PER_METRE * 0.85;
        this.reachFor(air.velocity, TOP_SHARE * camera.height, slowest);
        this.draws.push({
            program: "snowPerspective",
            count,
            uniforms: {
                uStarts: starts,
                uGrids: padded(planes.flatMap(grid), 4, 3),
                uOrigins: padded(
                    planes.flatMap((plane) => airOrigin(plane, air.shift)),
                    2,
                    3,
                ),
                uKindA: padded(
                    planes.flatMap((plane) => {
                        const kind = FLAKE_KINDS[plane.kind];
                        return [plane.cell, plane.shown, kind.fallSpeed * PX_PER_METRE, kind.flutterPx];
                    }),
                    4,
                    3,
                ),
                uKindB: padded(
                    planes.flatMap((plane) => [plane.kind, FLAKE_KINDS[plane.kind].sizes[0]]),
                    2,
                    3,
                ),
                uCamera: [camera.x, camera.y, camera.height, TOP_SHARE * camera.height],
                uWind: [air.velocity.x, air.velocity.y],
                uCull: [view.x, view.y, view.width, view.height],
                uLook: [options.pixel, options.biggest, options.still ? 1 : 0],
                uSeconds: options.seconds,
                uCopies: options.copies,
                ...this.toneUniforms(options.tones),
            },
        });
    }

    /** Shows what was added since begin(); nothing to draw hides the layer (no cost at all). */
    public end(): void {
        const view = this.view;
        if (view && this.draws.length > 0) this.updateMask(view, this.outdoors, this.reach);
        this.object.setVisible(this.draws.length > 0);
    }

    public hide(): void {
        this.draws = [];
        this.object.setVisible(false);
    }

    /** False once a shader of the layer failed to compile here: the processor draws the rain then. */
    public usable(): boolean {
        return !this.broken;
    }

    /** The instances of the last drawing, for the tests and the measures. */
    public instanceCount(): number {
        return this.draws.reduce((sum, draw) => sum + draw.count, 0);
    }

    public destroy(): void {
        this.renderer.off(Phaser.Renderer.Events.RESTORE_WEBGL, this.onRestore);
        this.object.destroy();
        const resources = this.resources;
        this.resources = undefined;
        if (!resources || resources.gl.isContextLost()) return;
        const { gl } = resources;
        for (const linked of Object.values(resources.programs)) if (linked) gl.deleteProgram(linked.program);
        gl.deleteBuffer(resources.corners);
        gl.deleteBuffer(resources.indices);
        gl.deleteTexture(resources.mask);
        gl.deleteTexture(resources.clouds);
        gl.deleteTexture(resources.shapes);
    }

    private toneUniforms(tones: FlakeTones): Uniforms {
        return {
            uLight: rgb(tones.light),
            uShade: rgb(tones.shade),
            uFlakeAlpha: tones.alpha,
            uShapesSize: [FLAKE_ATLAS_WIDTH, FLAKE_ATLAS_HEIGHT],
        };
    }

    /** The farthest a drop falling from `top` at `slowest` (map px a second) or faster lands in this wind. */
    private reachFor(wind: RainWind, top: number, slowest: number): void {
        const reach = slowest > 0 ? (Math.hypot(wind.x, wind.y) * top) / slowest : MOST_REACH;
        this.reach = Math.max(this.reach, Math.min(MOST_REACH, Number.isFinite(reach) ? reach : MOST_REACH));
    }

    /**
     * The outdoor mask over the view and where its drops land, MASK_MARGIN around: read again when its owners change
     * or the view leaves it (outdoorTexels). Beyond it the shaders count everything as outdoors.
     */
    private updateMask(view: WeatherView, outdoors: OutdoorSource | undefined, reach: number): void {
        if (!outdoors) {
            if (this.mask) this.maskVersion++;
            this.mask = undefined;
            this.maskOwners = undefined;
            return;
        }
        const current = this.mask;
        const needed = MASK_MARGIN / 2 + reach;
        const inside =
            current !== undefined &&
            view.x - needed >= current.area.x &&
            view.y - needed >= current.area.y &&
            view.x + view.width + needed <= current.area.x + current.area.width &&
            view.y + view.height + needed <= current.area.y + current.area.height;
        const owners = this.maskOwners;
        const same =
            owners !== undefined &&
            owners.length === outdoors.owners.length &&
            owners.every((owner, index) => owner === outdoors.owners[index]);
        if (inside && same) return;
        // A quarter of the reach more: a scroll in a strong wind does not read the outdoors again every few steps.
        const margin = MASK_MARGIN + reach * 1.25;
        const x = Math.floor((view.x - margin) / MASK_MARGIN) * MASK_MARGIN;
        const y = Math.floor((view.y - margin) / MASK_MARGIN) * MASK_MARGIN;
        const width = Math.ceil((view.x + view.width + margin) / MASK_MARGIN) * MASK_MARGIN - x;
        const height = Math.ceil((view.y + view.height + margin) / MASK_MARGIN) * MASK_MARGIN - y;
        // Coarser texels where a large area would need a texture larger than the graphics card takes.
        let texel = MASK_TEXEL;
        while (Math.max(width, height) / texel > this.largestMask) texel *= 2;
        const area = { x, y, width, height };
        const mask = outdoorTexels(area, outdoors.rectsIn(area), texel);
        this.mask = { area: { x, y, width: mask.width * texel, height: mask.height * texel }, ...mask };
        this.maskOwners = [...outdoors.owners];
        this.maskVersion++;
    }

    private updateClouds(clouds: CloudLevels | undefined): void {
        this.clouds = clouds;
        if (!clouds || clouds.levels === this.cloudsOf) return;
        this.cloudsOf = clouds.levels;
        this.cloudsVersion++;
        const width = clouds.columns;
        const height = clouds.rows;
        const current = this.cloudTexels;
        const texels =
            current && current.width === width && current.height === height
                ? current.texels
                : new Uint8Array(width * height);
        for (let index = 0; index < width * height; index++) {
            texels[index] = Math.max(0, Math.min(255, Math.round(clouds.levels[index] ?? 0)));
        }
        this.cloudTexels = { width, height, texels };
    }

    private render(
        drawingContext: Phaser.Renderer.WebGL.DrawingContext,
        matrix: Phaser.GameObjects.Components.TransformMatrix,
    ): void {
        if (this.draws.length === 0) return;
        const resources = this.ensureResources();
        if (!resources) return;
        const { gl, instancing } = resources;
        // The target, the viewport and the blending of Phaser (premultiplied alpha); Phaser binds its own again after.
        drawingContext.beginDraw();
        this.renderer.setProjectionMatrixFromDrawingContext(drawingContext);
        const projection = this.renderer.projectionMatrix.val;
        const view = new Float32Array([matrix.a, matrix.b, 0, matrix.c, matrix.d, 0, matrix.tx, matrix.ty, 1]);
        this.uploadTextures(resources);
        const mask = this.mask;
        const clouds = this.clouds;
        const shared: Uniforms = {
            uMask: 0,
            uClouds: 1,
            uShapes: 2,
            uMaskArea: mask ? [mask.area.x, mask.area.y, mask.area.width, mask.area.height] : [0, 0, 0, 0],
            uCloudArea: clouds
                ? [clouds.x, clouds.y, clouds.columns * clouds.size, clouds.rows * clouds.size]
                : [0, 0, 0, 0],
            uCloudLevel: clouds ? [Math.max(1, clouds.most), clouds.effect] : [1, 0],
        };
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, resources.mask);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, resources.clouds);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, resources.shapes);
        for (const draw of this.draws) {
            const linked = this.program(resources, draw.program);
            if (!linked) continue;
            this.ensureIndices(resources, draw.count);
            gl.useProgram(linked.program);
            setUniforms(gl, linked, { ...shared, ...draw.uniforms });
            gl.uniformMatrix4fv(linked.projection, false, projection);
            gl.uniformMatrix3fv(linked.view, false, view);
            const { corner, index } = linked;
            gl.bindBuffer(gl.ARRAY_BUFFER, resources.corners);
            gl.enableVertexAttribArray(corner);
            gl.vertexAttribPointer(corner, 1, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, resources.indices);
            gl.enableVertexAttribArray(index);
            gl.vertexAttribPointer(index, 1, gl.FLOAT, false, 0, 0);
            instancing.vertexAttribDivisorANGLE(index, 1);
            instancing.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, 4, draw.count);
            // The attributes as Phaser left them: it draws through its own vertex arrays.
            instancing.vertexAttribDivisorANGLE(index, 0);
            gl.disableVertexAttribArray(index);
            gl.disableVertexAttribArray(corner);
        }
        gl.activeTexture(gl.TEXTURE0);
    }

    private ensureResources(): GlResources | undefined {
        const gl = this.renderer.gl;
        if (this.resources?.gl === gl) return this.resources;
        const instancing = gl.getExtension("ANGLE_instanced_arrays");
        const corners = gl.createBuffer();
        const indices = gl.createBuffer();
        const mask = gl.createTexture();
        const clouds = gl.createTexture();
        const shapes = gl.createTexture();
        if (!instancing || !corners || !indices || !mask || !clouds || !shapes) return undefined;
        gl.bindBuffer(gl.ARRAY_BUFFER, corners);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 2, 3]), gl.STATIC_DRAW);
        for (const texture of [mask, clouds, shapes]) {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            upload(gl, texture, 1, 1, new Uint8Array(4));
        }
        upload(gl, shapes, FLAKE_ATLAS_WIDTH, FLAKE_ATLAS_HEIGHT, flakeAtlas());
        // The context may have been made again: everything is sent again.
        this.maskVersion++;
        this.cloudsVersion++;
        this.resources = {
            gl,
            instancing,
            programs: {},
            corners,
            indices,
            indexCapacity: 0,
            mask,
            maskVersion: -1,
            clouds,
            cloudsVersion: -1,
            shapes,
        };
        return this.resources;
    }

    /** The index of each instance, 0 to the count: grown by powers of two, kept. */
    private ensureIndices(resources: GlResources, count: number): void {
        if (count <= resources.indexCapacity) return;
        const capacity = 2 ** Math.ceil(Math.log2(Math.max(65_536, count)));
        const values = new Float32Array(capacity);
        for (let index = 0; index < capacity; index++) values[index] = index;
        const { gl } = resources;
        gl.bindBuffer(gl.ARRAY_BUFFER, resources.indices);
        gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
        resources.indexCapacity = capacity;
    }

    private uploadTextures(resources: GlResources): void {
        const { gl } = resources;
        const mask = this.mask;
        if (resources.maskVersion !== this.maskVersion) {
            resources.maskVersion = this.maskVersion;
            if (mask) upload(gl, resources.mask, mask.width, mask.height, mask.texels, true);
        }
        const clouds = this.cloudTexels;
        if (resources.cloudsVersion !== this.cloudsVersion) {
            resources.cloudsVersion = this.cloudsVersion;
            if (clouds) upload(gl, resources.clouds, clouds.width, clouds.height, clouds.texels, true);
        }
    }

    private program(resources: GlResources, name: ProgramName): LinkedProgram | undefined {
        const kept = resources.programs[name];
        if (kept !== undefined) return kept ?? undefined;
        // A lost context compiles nothing: tried again once it is back (onRestore).
        if (resources.gl.isContextLost()) return undefined;
        resources.programs[name] = null;
        const { gl } = resources;
        const source = SOURCES[name];
        const program = gl.createProgram();
        const vertex = compile(gl, gl.VERTEX_SHADER, source.vertex);
        const fragment = compile(gl, gl.FRAGMENT_SHADER, source.fragment);
        if (!program || !vertex || !fragment) {
            this.broken = true;
            return undefined;
        }
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        // The corner of the quad on the first attribute: some drivers want an array, read for each vertex, there.
        gl.bindAttribLocation(program, 0, "inVertex");
        gl.linkProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.warn(
                "PrecipitationLayer: the program of the",
                name,
                "does not link",
                gl.getProgramInfoLog(program),
            );
            gl.deleteProgram(program);
            this.broken = true;
            return undefined;
        }
        const uniforms: LinkedProgram["uniforms"] = [];
        const count = Number(gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS));
        for (let index = 0; index < count; index++) {
            const info = gl.getActiveUniform(program, index);
            if (!info) continue;
            uniforms.push({
                name: info.name.replace(/\[0\]$/, ""),
                location: gl.getUniformLocation(program, info.name),
                type: info.type,
            });
        }
        const linked: LinkedProgram = {
            program,
            uniforms,
            projection: gl.getUniformLocation(program, "uProjection"),
            view: gl.getUniformLocation(program, "uView"),
            corner: gl.getAttribLocation(program, "inVertex"),
            index: gl.getAttribLocation(program, "inIndex"),
        };
        resources.programs[name] = linked;
        return linked;
    }
}

function grid(group: InstanceGroup): number[] {
    return [hashedCell(group.firstColumn), hashedCell(group.firstRow), group.columns, group.rows];
}

/** The first cell of a plane of the air moved by `shift`, map pixels: worked out in 64 bits, near the view. */
function airOrigin(plane: AirPlane, shift: RainWind): number[] {
    return [plane.firstColumn * plane.cell + shift.x, plane.firstRow * plane.cell + shift.y];
}

/** `values` of `size` numbers each, completed with zeros to `slots` of them. */
function padded(values: number[], size: number, slots: number): number[] {
    const result = values.slice(0, size * slots);
    while (result.length < size * slots) result.push(0);
    return result;
}

/** The shapes of the flakes (FLAKE_SHAPES, 1 to 5 pixels) side by side: red where lit, green where shaded. */
function flakeAtlas(): Uint8Array {
    const texels = new Uint8Array(FLAKE_ATLAS_WIDTH * FLAKE_ATLAS_HEIGHT * 4);
    FLAKE_SHAPES.forEach((shape, size) => {
        if (size === 0) return;
        for (const [dx, dy, width, height, tone] of shape) {
            for (let y = dy; y < dy + height; y++) {
                for (let x = dx; x < dx + width; x++) {
                    const index = (y * FLAKE_ATLAS_WIDTH + (size - 1) * FLAKE_ATLAS_CELL + x) * 4;
                    texels[index + (tone === 0 ? 0 : 1)] = 255;
                    texels[index + 3] = 255;
                }
            }
        }
    });
    return texels;
}

/** Sends texels to a texture: four bytes each, or one (`luminance`: the outdoor mask, the levels of the clouds). */
function upload(
    gl: WebGLRenderingContext,
    texture: WebGLTexture,
    width: number,
    height: number,
    texels: Uint8Array,
    luminance = false,
): void {
    const format = luminance ? gl.LUMINANCE : gl.RGBA;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    // Rows of one byte a texel are not aligned on four: read as they are, then the alignment Phaser does not track
    // put back.
    if (luminance) gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, format, gl.UNSIGNED_BYTE, texels);
    if (luminance) gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | undefined {
    const shader = gl.createShader(type);
    if (!shader) return undefined;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn("PrecipitationLayer: a shader does not compile", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return undefined;
    }
    return shader;
}

/** Sets the uniforms of a program by name: a number, or the values of a vector or an array (its type says which). */
function setUniforms(gl: WebGLRenderingContext, linked: LinkedProgram, uniforms: Uniforms): void {
    for (const { name, location, type } of linked.uniforms) {
        const value = uniforms[name];
        if (value === undefined) continue;
        const values = Float32Array.from(typeof value === "number" ? [value] : value);
        switch (type) {
            case gl.SAMPLER_2D:
            case gl.INT:
                gl.uniform1i(location, values[0]);
                break;
            case gl.FLOAT:
                gl.uniform1fv(location, values);
                break;
            case gl.FLOAT_VEC2:
                gl.uniform2fv(location, values);
                break;
            case gl.FLOAT_VEC3:
                gl.uniform3fv(location, values);
                break;
            case gl.FLOAT_VEC4:
                gl.uniform4fv(location, values);
                break;
            default:
                break;
        }
    }
}

function rgb(color: number): number[] {
    return [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255];
}
