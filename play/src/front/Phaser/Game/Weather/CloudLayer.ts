import * as Phaser from "phaser";
import { billowDrift, NOISE_GLSL, shaderSeconds } from "../ShaderNoise";
import type { FogPatch, WeatherView } from "./WeatherFrame";

/**
 * The sky of the weather drawn by the graphics card at every drawing of the weather: the clouds (of a clear sky, or of
 * the rain and the storm), their shadows and the grey veils of a covered sky. The clouds glide by fractions of a pixel
 * instead of jumping by whole blocks a few times a second (the block canvas, BlockSurface), and every edge is smooth,
 * the walls included. The fog stays in the block canvas.
 *
 * Two passes. The puffs of the clouds (cloudPatches) are added into a small texture of thickness, a few map pixels a
 * texel: each puff is a soft disc whose value falls as (1 - d²/r²)², as fieldLevels counts them. A shader then reads
 * that texture, smoothed between its texels, breaks it into billows and lights them, and draws the clouds over their
 * shadows and the veils, outdoors only (the outdoor rectangles of the map, drawn into a mask).
 */

export interface CloudSky {
    /** The puffs of the clouds over the view and CLOUD_LAYER_MARGIN around it. */
    patches: readonly FogPatch[];
    /** The three tones of the clouds and the opacity of their body, night included (cloudTint). */
    tones: { lit: number; mid: number; shade: number };
    body: number;
    /** Where the shadows fall from the clouds (map pixels) and their opacity; undefined: none. */
    shadow: { x: number; y: number; alpha: number } | undefined;
}

export interface CloudFrame {
    /** The area of the map to draw over (the padded view). */
    view: WeatherView;
    /** How far the sky has drifted (SkyDrift), map pixels: the billows of the clouds go with them. */
    sky: { x: number; y: number };
    /** The clouds; undefined: only the veils. */
    clouds: CloudSky | undefined;
    /** The veils over the outdoors, one over the other: a colour and an opacity each. */
    veils: readonly { color: number; alpha: number }[];
    /** The outdoors of the map (rectangles, map pixels); undefined: everything is outdoors. */
    outdoors: readonly WeatherView[] | undefined;
    /** How much of a cloud passes over what is not outdoors (cloudsOverRoofs). */
    overRoofs: number;
    /** A rainbow (Rainbow.ts): its centre and radius (map pixels), the way it bows (a unit vector), its strength. */
    rainbow:
        | {
              x: number;
              y: number;
              radius: number;
              direction: { x: number; y: number };
              /** The cosine of the half opening of the arc around `direction`. */
              span: number;
              strength: number;
          }
        | undefined;
    /** Nothing moves (reduced motion): the billows of the clouds stay as they are. */
    still: boolean;
}

/** How far a cloud looks towards the light (north-west) to tell its far side, in map pixels: as cloudTones. */
const SHADE_REACH = 48;
/** Thickness kept beyond the view: the longest shadow (6 tiles) and the look towards the light. */
export const CLOUD_LAYER_MARGIN = 6 * 32 + SHADE_REACH;
/**
 * Map pixels a texel of the thickness, at any zoom: a texel that followed the zoom changed the shape of the clouds at
 * each step of it (smoothed over 8 px or over 64 px, the billows do not cut the same outline).
 */
const CELL = 8;
/** The thickness texture grows by this many texels a side, so that a zoom does not make it again at every step. */
const TEXEL_STEP = 64;
/** Map pixels a texel of the outdoor mask, and how far it reaches beyond the view (redrawn when the view leaves it). */
const MASK_TEXEL = 4;
const MASK_MARGIN = 512;
const PUFF_TEXTURE = "weather-cloud-puff";
const PUFF_SIZE = 64;

const CLOUD_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 outTexCoord;

uniform sampler2D uThickness;
uniform sampler2D uMask;
uniform vec4 uArea;          // the area drawn, map pixels: x, y, width, height
uniform vec4 uThicknessArea; // the area of the thickness texture
uniform vec4 uMaskArea;      // the area of the outdoor mask
uniform float uAllOutdoor;   // 1: no mask, everything is outdoors
uniform float uClouds;       // 1 when there are clouds to draw
uniform vec3 uLit;
uniform vec3 uMid;
uniform vec3 uShade;
uniform float uBody;
uniform float uOverRoofs;
uniform vec3 uShadow;        // x, y offset of the shadows (map pixels), their opacity
uniform vec4 uVeil;          // the veils over the outdoors, premultiplied
uniform vec2 uSky;           // how far the sky has drifted (map pixels): the billows go with their cloud
uniform float uTime;         // seconds: the billows change slowly
uniform vec4 uBillowA;      // how far the billows have drifted, octave by octave (ShaderNoise.billowDrift)
uniform vec2 uBillowB;
uniform vec4 uRainbow;       // centre x, y and radius of the rainbow (map pixels), its strength (0: none)
uniform vec2 uRainbowDir;    // the way the rainbow bows, away from the sun
uniform float uRainbowSpan;  // the cosine of the half opening of its arc

${NOISE_GLSL}

// The colours of a rainbow across its band: 0 violet (inside) to 1 red (outside).
vec3 spectrum(float t) {
    float hue = (1.0 - clamp(t, 0.0, 1.0)) * 0.75;
    return clamp(abs(mod(hue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

// A rainbow over the outdoors: the bow, red outside, and a fainter second bow beyond it, its colours reversed; the
// sky a little brighter inside the bow, as it is. Only its arc bowed away from the sun, fading at both ends.
vec4 rainbow(vec2 world, float out_) {
    vec2 rel = world - uRainbow.xy;
    float r = length(rel);
    float along = dot(rel / max(r, 1.0), uRainbowDir);
    float arc = smoothstep(uRainbowSpan - 0.08, uRainbowSpan + 0.2, along);
    float width = uRainbow.z * 0.1;
    float band = (r - uRainbow.z) / width;
    float primary = smoothstep(0.0, 0.2, band) * (1.0 - smoothstep(0.8, 1.0, band));
    float band2 = (r - uRainbow.z * 1.22) / (width * 1.4);
    float secondary = smoothstep(0.0, 0.2, band2) * (1.0 - smoothstep(0.8, 1.0, band2));
    float inside = (1.0 - smoothstep(0.85, 1.0, r / uRainbow.z)) * 0.06;
    vec3 colour = spectrum(band) * primary * 0.42 + spectrum(1.0 - band2) * secondary * 0.16 + vec3(inside);
    float alpha = max(max(primary * 0.42, secondary * 0.16), inside) * arc * uRainbow.w * mix(0.5, 1.0, out_);
    return vec4(colour * arc * uRainbow.w * mix(0.5, 1.0, out_), alpha);
}

float thickness(vec2 world) {
    vec2 uv = (world - uThicknessArea.xy) / uThicknessArea.zw;
    // Stored bottom up, as the canvas textures.
    return texture2D(uThickness, vec2(uv.x, 1.0 - uv.y)).r;
}

float outdoor(vec2 world) {
    if (uAllOutdoor > 0.5) return 1.0;
    vec2 uv = (world - uMaskArea.xy) / uMaskArea.zw;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
    return texture2D(uMask, vec2(uv.x, 1.0 - uv.y)).r;
}

// The thickness of the puffs broken into billows: a cumulus is a heap of round swellings, not a smooth blob. The
// billows are fixed to the cloud (moved with the sky), and its thin edge is eaten the most.
float density(vec2 world) {
    float t = thickness(world);
    if (t <= 0.002) return 0.0;
    vec2 p = world - uSky;
    float billows = fbmDrift(p / 30.0, uBillowA, uBillowB);
    return t * (0.45 + 1.1 * billows);
}

// The outline of a cloud: a soft edge a few map pixels wide.
float cover(float d) {
    return smoothstep(0.1, 0.22, d);
}

void main() {
    vec2 world = uArea.xy + vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uArea.zw;
    float out_ = outdoor(world);
    // The veils of a covered sky, outdoors only.
    vec4 color = uVeil * out_;
    if (uRainbow.w > 0.0) {
        vec4 bow = rainbow(world, out_);
        color = bow + color * (1.0 - bow.a);
    }

    if (uClouds > 0.5) {
        // The shadows on the ground, outdoors only: the same clouds moved away from the sun.
        if (uShadow.z > 0.0) {
            float shade = cover(density(world - uShadow.xy)) * uShadow.z * out_;
            color = vec4(0.0, 0.0, 0.0, shade) + color * (1.0 - shade);
        }
        float d = density(world);
        float body = cover(d);
        if (body > 0.0) {
            // Lit from the north-west, as the map: a swelling is bright where the density rises away from the light,
            // dark where it falls away from it; and a whole cloud is darker on its far side (its own thickness).
            vec2 probe = vec2(5.0, 0.0);
            vec2 slope = vec2(density(world + probe.xy) - d, density(world + probe.yx) - d) / 5.0;
            float facing = dot(slope, vec2(0.7071)) * 40.0;
            vec2 reach = vec2(${(SHADE_REACH * Math.SQRT1_2).toFixed(2)});
            float far = thickness(world) - thickness(world - reach);
            float light = clamp(0.55 + facing - far * 1.2 + (d - 0.3) * 0.2, 0.0, 1.0);
            vec3 tone = light < 0.5 ? mix(uShade, uMid, light * 2.0) : mix(uMid, uLit, light * 2.0 - 1.0);
            // A rim lighter than the body, as the sun shines through the edge of a cumulus.
            float rim = 1.0 - smoothstep(0.22, 0.32, d);
            tone = mix(tone, uLit, rim * 0.4);
            float alpha = body * uBody * mix(uOverRoofs, 1.0, out_);
            color = vec4(tone * alpha, alpha) + color * (1.0 - alpha);
        }
    }

    if (color.a <= 0.002) discard;
    gl_FragColor = color;
}
`;

let layerCount = 0;

export class CloudLayer {
    private readonly shader: Phaser.GameObjects.Shader;
    private readonly id = ++layerCount;
    private thickness: Phaser.GameObjects.RenderTexture | undefined;
    private thicknessArea = { x: 0, y: 0, width: 1, height: 1 };
    private maskTexture: Phaser.Textures.CanvasTexture | undefined;
    private maskOf: readonly WeatherView[] | undefined;
    private maskCount = 0;
    private maskArea = { x: 0, y: 0, width: 1, height: 1 };
    private puffs: readonly Phaser.GameObjects.Image[] = [];
    private frame: CloudFrame | undefined;

    private constructor(
        private readonly scene: Phaser.Scene,
        depth: number,
    ) {
        ensurePuffTexture(scene);
        this.shader = scene.add
            .shader(
                {
                    name: "Clouds",
                    fragmentSource: CLOUD_FRAG,
                    setupUniforms: (setUniform: (name: string, value: unknown) => void) => this.setUniforms(setUniform),
                },
                0,
                0,
                1,
                1,
                ["__DEFAULT", "__DEFAULT"],
            )
            .setOrigin(0)
            .setDepth(depth)
            .setVisible(false);
    }

    /** Undefined without WebGL: the sky is painted in the block canvas then. */
    public static create(scene: Phaser.Scene, depth: number): CloudLayer | undefined {
        return scene.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer
            ? new CloudLayer(scene, depth)
            : undefined;
    }

    public draw(frame: CloudFrame): void {
        this.frame = frame;
        if (frame.clouds) this.drawThickness(frame, frame.clouds);
        else this.thickness?.clear().fill(0x000000, 1).render();
        if (frame.outdoors) this.updateMask(frame.view, frame.outdoors);
        this.shader
            .setPosition(frame.view.x, frame.view.y)
            .setSize(frame.view.width, frame.view.height)
            .setVisible(true);
    }

    public hide(): void {
        this.shader.setVisible(false);
        this.frame = undefined;
    }

    /** The thickness of the clouds drawn last, for the water that reflects them; undefined without clouds. */
    public reflected(): { key: string; area: { x: number; y: number; width: number; height: number } } | undefined {
        return this.frame?.clouds && this.thickness
            ? { key: this.thickness.texture.key, area: this.thicknessArea }
            : undefined;
    }

    public destroy(): void {
        this.shader.destroy();
        this.thickness?.destroy();
        this.maskTexture?.destroy();
        for (const puff of this.puffs) puff.destroy();
    }

    private drawThickness(frame: CloudFrame, clouds: CloudSky): void {
        const { view } = frame;
        const cell = CELL;
        // Fixed to the map by whole texels: the puffs move inside it, the texture never slides under them.
        const x = Math.floor((view.x - CLOUD_LAYER_MARGIN) / cell) * cell;
        const y = Math.floor((view.y - CLOUD_LAYER_MARGIN) / cell) * cell;
        const columns = Math.ceil((view.x + view.width + CLOUD_LAYER_MARGIN - x) / cell);
        const rows = Math.ceil((view.y + view.height + CLOUD_LAYER_MARGIN - y) / cell);
        const thickness = this.thicknessTexture(columns, rows);
        this.thicknessArea = { x, y, width: thickness.width * cell, height: thickness.height * cell };
        // Opaque black: the ADD blend of Phaser (src + dst × dst alpha) then adds the puffs exactly.
        thickness.clear().fill(0x000000, 1);
        clouds.patches.forEach((patch, index) => {
            const weight = patch.weight ?? 1;
            if (weight <= 0) return;
            const diameter = (2 * patch.radius) / cell;
            const puff = this.puff(index)
                .setPosition((patch.x - x) / cell, (patch.y - y) / cell)
                .setDisplaySize(diameter, diameter)
                .setAlpha(weight);
            thickness.draw(puff);
        });
        thickness.render();
    }

    /** One image a puff drawn this time: the drawing commands of a texture run at render(), an image cannot be reused. */
    private puff(index: number): Phaser.GameObjects.Image {
        const existing = this.puffs.at(index);
        if (existing) return existing;
        const puff = new Phaser.GameObjects.Image(this.scene, 0, 0, PUFF_TEXTURE)
            .setOrigin(0.5)
            .setBlendMode(Phaser.BlendModes.ADD);
        this.puffs = [...this.puffs, puff];
        return puff;
    }

    private thicknessTexture(columns: number, rows: number): Phaser.GameObjects.RenderTexture {
        const current = this.thickness;
        if (current && current.width >= columns && current.height >= rows) return current;
        const width = Math.ceil(Math.max(columns, current?.width ?? 0) / TEXEL_STEP) * TEXEL_STEP;
        const height = Math.ceil(Math.max(rows, current?.height ?? 0) / TEXEL_STEP) * TEXEL_STEP;
        current?.destroy();
        const thickness = this.scene.make.renderTexture({ x: 0, y: 0, width, height }, false).setOrigin(0, 0);
        thickness.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
        this.thickness = thickness;
        this.bindTextures();
        return thickness;
    }

    /**
     * The outdoor rectangles drawn into the mask, a texel every MASK_TEXEL map pixels: again only when they change
     * (the weather keeps the same list while the walls and the view do not change) or the view leaves the mask.
     */
    private updateMask(view: WeatherView, outdoors: readonly WeatherView[]): void {
        const area = this.maskArea;
        const inside =
            view.x >= area.x &&
            view.y >= area.y &&
            view.x + view.width <= area.x + area.width &&
            view.y + view.height <= area.y + area.height;
        if (this.maskOf === outdoors && inside) return;
        this.maskOf = outdoors;
        const x = Math.floor((view.x - MASK_MARGIN) / MASK_MARGIN) * MASK_MARGIN;
        const y = Math.floor((view.y - MASK_MARGIN) / MASK_MARGIN) * MASK_MARGIN;
        const columns = Math.ceil((view.x + view.width + MASK_MARGIN - x) / MASK_TEXEL);
        const rows = Math.ceil((view.y + view.height + MASK_MARGIN - y) / MASK_TEXEL);
        // Kept while it is large enough, grown by steps: a canvas and a texture made again at each image of a zoom
        // filled the memory of the graphics card.
        let texture = this.maskTexture;
        if (!texture || texture.width < columns || texture.height < rows) {
            const width = Math.ceil(Math.max(columns, texture?.width ?? 0) / TEXEL_STEP) * TEXEL_STEP;
            const height = Math.ceil(Math.max(rows, texture?.height ?? 0) / TEXEL_STEP) * TEXEL_STEP;
            texture?.destroy();
            texture =
                this.scene.textures.createCanvas(`weather-sky-mask:${this.id}:${++this.maskCount}`, width, height) ??
                undefined;
            texture?.setFilter(Phaser.Textures.FilterMode.NEAREST);
            this.maskTexture = texture;
            this.bindTextures();
        }
        if (!texture) return;
        this.maskArea = { x, y, width: texture.width * MASK_TEXEL, height: texture.height * MASK_TEXEL };
        const context = texture.getContext();
        context.fillStyle = "#000";
        context.fillRect(0, 0, texture.width, texture.height);
        context.fillStyle = "#f00";
        for (const rect of outdoors) {
            context.fillRect(
                (rect.x - x) / MASK_TEXEL,
                (rect.y - y) / MASK_TEXEL,
                rect.width / MASK_TEXEL,
                rect.height / MASK_TEXEL,
            );
        }
        texture.refresh();
    }

    private bindTextures(): void {
        this.shader.setTextures([this.thickness?.texture.key ?? "__DEFAULT", this.maskTexture?.key ?? "__DEFAULT"]);
    }

    private setUniforms(setUniform: (name: string, value: unknown) => void): void {
        const frame = this.frame;
        const clouds = frame?.clouds;
        const area = (rect: { x: number; y: number; width: number; height: number }): number[] => [
            rect.x,
            rect.y,
            rect.width,
            rect.height,
        ];
        setUniform("uThickness", 0);
        setUniform("uMask", 1);
        setUniform("uArea", frame ? area(frame.view) : [0, 0, 1, 1]);
        setUniform("uThicknessArea", area(this.thicknessArea));
        setUniform("uMaskArea", area(this.maskArea));
        setUniform("uAllOutdoor", frame?.outdoors ? 0 : 1);
        setUniform("uClouds", clouds ? 1 : 0);
        setUniform("uLit", rgb(clouds?.tones.lit ?? 0xffffff));
        setUniform("uMid", rgb(clouds?.tones.mid ?? 0xffffff));
        setUniform("uShade", rgb(clouds?.tones.shade ?? 0xffffff));
        setUniform("uBody", clouds?.body ?? 0);
        setUniform("uOverRoofs", frame?.overRoofs ?? 0);
        const shadow = clouds?.shadow;
        setUniform("uShadow", shadow ? [shadow.x, shadow.y, shadow.alpha] : [0, 0, 0]);
        setUniform("uVeil", premultipliedVeil(frame?.veils ?? []));
        setUniform("uSky", frame ? [frame.sky.x, frame.sky.y] : [0, 0]);
        setUniform("uTime", frame?.still ? 0 : shaderSeconds(this.scene.time.now));
        const billows = frame?.still ? { first: [0, 0, 0, 0], third: [0, 0] } : billowDrift(this.scene.time.now);
        setUniform("uBillowA", billows.first);
        setUniform("uBillowB", billows.third);
        const bow = frame?.rainbow;
        setUniform("uRainbow", bow ? [bow.x, bow.y, bow.radius, bow.strength] : [0, 0, 1, 0]);
        setUniform("uRainbowDir", bow ? [bow.direction.x, bow.direction.y] : [0, -1]);
        setUniform("uRainbowSpan", bow?.span ?? 1);
    }
}

/** The veils one over the other, as one premultiplied colour. */
function premultipliedVeil(veils: readonly { color: number; alpha: number }[]): number[] {
    return veils.reduce(
        ([red, green, blue, alpha], veil) => {
            const [r, g, b] = rgb(veil.color);
            const keep = 1 - veil.alpha;
            return [
                r * veil.alpha + red * keep,
                g * veil.alpha + green * keep,
                b * veil.alpha + blue * keep,
                veil.alpha + alpha * keep,
            ];
        },
        [0, 0, 0, 0],
    );
}

function rgb(color: number): number[] {
    return [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255];
}

/** A white disc whose opacity falls as (1 - d²/r²)², d the distance to its centre and r its radius. */
function ensurePuffTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(PUFF_TEXTURE)) return;
    const texture = scene.textures.createCanvas(PUFF_TEXTURE, PUFF_SIZE, PUFF_SIZE);
    if (!texture) return;
    const context = texture.getContext();
    const pixels = context.createImageData(PUFF_SIZE, PUFF_SIZE);
    const half = PUFF_SIZE / 2;
    for (let y = 0; y < PUFF_SIZE; y++) {
        for (let x = 0; x < PUFF_SIZE; x++) {
            const share = Math.max(0, 1 - ((x + 0.5 - half) ** 2 + (y + 0.5 - half) ** 2) / half ** 2);
            const index = (y * PUFF_SIZE + x) * 4;
            pixels.data[index] = 255;
            pixels.data[index + 1] = 255;
            pixels.data[index + 2] = 255;
            pixels.data[index + 3] = Math.round(share * share * 255);
        }
    }
    context.putImageData(pixels, 0, 0);
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    texture.refresh();
}
