import * as Phaser from "phaser";
import { TILE_PX } from "@workadventure/map-editor";
import { DEPTH_LAMP_LIGHT_INDEX, DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import { placeAtDepth } from "../DepthSort";
import type { MeadowState } from "../Terrain/MeadowState";
import { screenScale } from "../Weather/ScreenScale";
import { isEffectShown } from "../../../Stores/EffectsStore";
import { refreshCanvasTexture } from "../CanvasTextureRefresh";
import {
    drawnEmbers,
    drawnFlame,
    FLAME_FRAME_HEIGHT_PX,
    FLAME_FRAME_WIDTH_PX,
    FLAME_FRAMES,
    FLAME_MAX_HEIGHT_PX,
    flameMass,
    flameOutline,
    flamePose,
    GLOW_NEIGHBOUR_REACH,
    glowShare,
    smokeFarScale,
    smokeOf,
    smokeShare,
    spreadTiles,
    tileSeed,
} from "./FlameShape";
import { FLAMES_TEXTURE, flameStyle } from "./FlameStyle";
import { SmoulderingGround, smoulderPoints } from "./Smoulder";

/** Flames are drawn on about this many tiles at most: beyond, on a share of them all over the view, bigger. */
const MAX_FLAMES = 600;
/** Tiles around the view whose flames are drawn too: a flame leans and rises over its neighbours. */
// (5 tiles: a flame on a relief seen in 3/4 is drawn up to 128 px from its tile.)
const VIEW_MARGIN_TILES = 5;
/** Where the foot of a flame stands in its tile, from its top: towards its bottom, as what stands on the ground. */
const FOOT_IN_TILE = 0.8;
/** The tongues of a flame, from its red mantle to its white heart: their size, colour and opacity. */
const TONGUES: readonly { scale: number; color: string; alpha: number }[] = [
    { scale: 1, color: "#d9381e", alpha: 0.8 },
    { scale: 0.76, color: "#ff7a1a", alpha: 0.9 },
    { scale: 0.52, color: "#ffc23d", alpha: 0.95 },
    { scale: 0.28, color: "#fff2c2", alpha: 1 },
];
const EMBER_COLOR = "#ffb347";
const GLOW_RADIUS_PX = 72;
const GLOW_ALPHA = 0.16;
/**
 * A soft disc for the glow of the flames, another for the smoke of the grass (a pale grey) and one for the smoke of
 * the trees (black): drawn once for the game, with the frames of the quick flames.
 */
export const GLOW_TEXTURE = "fire-glow";
export const SMOKE_TEXTURE = "fire-smoke";
export const TREE_SMOKE_TEXTURE = "fire-smoke-tree";
export const STEAM_TEXTURE = "fire-steam";
/** The ground a fire left smokes and glows on this many tiles of the view at most. */
const MAX_SMOULDERING = 240;
/** A soil this wet (0 to 1) put the fire out: steam. */
const STEAM_MOISTURE = 0.6;
/** An ember on the ground: this wide (map pixels). */
const GROUND_EMBER_PX = 8;
const SOFT_DISC_PX = 64;

/**
 * The flames of the tiles on fire, as the server tells them: on each tile a flame in several tongues, as tall as its
 * fire is strong, laid by the wind, breathing in its own time; embers and smoke over it; a glow that shows through
 * the night. The flames are a loop of frames drawn once, laid on each tile as an image at the depth of its foot: an
 * avatar in front of a flame hides it, and one behind is hidden by it. They move a few times a second, and the
 * scene is drawn again only then. The server alone decides what burns.
 */
export class FireView {
    private readonly flames: Phaser.GameObjects.Image[] = [];
    private readonly glows: Phaser.GameObjects.Image[] = [];
    private readonly puffs: Phaser.GameObjects.Image[] = [];
    private lastStep = -1;
    private drawn = false;
    /** The ground the fire has just left, as this browser saw it. */
    private readonly smouldering = new SmoulderingGround();

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly meadow: Pick<MeadowState, "fireAt" | "isBurning"> & Partial<Pick<MeadowState, "moistureAt">>,
        private readonly wind: () => { windFrom?: number; windSpeed?: number } | undefined,
        private readonly reducedMotion: () => boolean,
        /** How much lower the ground at a point is drawn, the relief seen in 3/4 (GameScene.groundDropAt). */
        private readonly dropAt: (x: number, y: number) => number = () => 0,
    ) {
        this.drawTextures();
    }

    public update(now: number): void {
        if (!isEffectShown("fire")) {
            this.smouldering.clear();
            if (this.drawn) this.clear();
            return;
        }
        if (!this.meadow.isBurning() && !this.smouldering.watching()) {
            if (this.drawn) this.clear();
            return;
        }
        // The flames move with their frames: between two of them nothing changes, and nothing is drawn again.
        const style = flameStyle(this.scene);
        const step = Math.floor((now / 1000) * style.loop.framesPerSecond);
        if (step === this.lastStep) return;
        this.lastStep = step;
        const view = this.scene.cameras.main.worldView;
        const fromX = Math.floor(view.x / TILE_PX) - VIEW_MARGIN_TILES;
        const toX = Math.ceil(view.right / TILE_PX) + VIEW_MARGIN_TILES;
        const fromY = Math.floor(view.y / TILE_PX) - VIEW_MARGIN_TILES;
        const toY = Math.ceil(view.bottom / TILE_PX) + VIEW_MARGIN_TILES;
        const burning: { x: number; y: number; fire: number }[] = [];
        for (let y = fromY; y <= toY; y++) {
            for (let x = fromX; x <= toX; x++) {
                const fire = this.meadow.fireAt(x, y);
                if (fire > 0) burning.push({ x, y, fire });
            }
        }
        // A tile whose fire went out since the last look smokes and glows a while, or steams if water put it out.
        const moistureAt = this.meadow.moistureAt?.bind(this.meadow);
        this.smouldering.see(burning, { fromX, toX, fromY, toY }, now, (x, y) =>
            moistureAt ? moistureAt((x + 0.5) * TILE_PX, (y + 0.5) * TILE_PX) >= STEAM_MOISTURE : false,
        );
        const left = this.smouldering.tiles(now).slice(0, MAX_SMOULDERING);
        if (burning.length === 0 && left.length === 0) {
            if (this.drawn) this.clear();
            return;
        }
        const { tiles: shown, scale } = spreadTiles(burning, MAX_FLAMES);
        const wind = this.wind();
        const reducedMotion = this.reducedMotion();
        const seconds = now / 1000;
        // Seen from high the smoke is drawn bigger: it is what shows where it burns.
        const smokeScale = scale * smokeFarScale(screenScale(this.scene));
        let puffs = 0;
        shown.forEach((tile, index) => {
            const input = {
                intensity: tile.fire / 255,
                windFrom: wind?.windFrom,
                windSpeed: wind?.windSpeed,
                seconds,
                seed: tileSeed(tile.x, tile.y),
                reducedMotion,
            };
            const footX = (tile.x + 0.5) * TILE_PX;
            const footY = (tile.y + FOOT_IN_TILE) * TILE_PX;
            // Drawn where its ground is (lower in a hollow, higher on a mount); sorted by its place, as an avatar.
            const drawnY = footY + this.dropAt(footX, footY);
            const pose = flamePose(input, style.loop);
            const around = this.burningAround(tile.x, tile.y);
            // The flames of neighbouring tiles join into one fire: big in its heart, lower on its edges.
            const size = scale * flameMass(around);
            // At the depth of its foot: what stands lower on the map is drawn over it.
            const flame = this.flameAt(index)
                .setTexture(style.texture, style.frameOf(pose.frame, input.seed))
                .setPosition(footX, drawnY)
                .setScale(pose.scaleX * size, pose.scaleY * size)
                .setRotation(pose.rotation)
                .setVisible(true);
            placeAtDepth(flame, footY);
            const glow = GLOW_RADIUS_PX * (0.5 + 0.5 * input.intensity) * scale;
            this.glowAt(index)
                .setPosition(footX, drawnY - FLAME_MAX_HEIGHT_PX * pose.scaleY * size * 0.4)
                .setDisplaySize(glow * 2, glow * 2)
                .setAlpha(input.intensity * glowShare(around))
                .setVisible(true);
            const share = smokeShare(around);
            for (const puff of smokeOf(input)) {
                this.puffAt(puffs++)
                    .setTexture(SMOKE_TEXTURE)
                    .setPosition(footX + puff.x * smokeScale, drawnY + puff.y * smokeScale)
                    .setDisplaySize(puff.radius * 2 * smokeScale, puff.radius * 2 * smokeScale)
                    .setAlpha(puff.alpha * share)
                    .setVisible(true);
            }
        });
        let glows = shown.length;
        const farScale = smokeFarScale(screenScale(this.scene));
        for (const tile of left) {
            const footX = (tile.x + 0.5) * TILE_PX;
            const footY = (tile.y + FOOT_IN_TILE) * TILE_PX;
            const drop = this.dropAt(footX, footY);
            const input = {
                // It thins out as the ground cools.
                intensity: 0.3 + 0.5 * tile.left,
                windFrom: wind?.windFrom,
                windSpeed: wind?.windSpeed,
                seconds,
                seed: tileSeed(tile.x, tile.y),
                reducedMotion,
            };
            const share = smokeShare(this.smoulderingAround(left, tile)) * tile.left;
            for (const puff of smokeOf(input, tile.steam ? "steam" : "grass")) {
                // From the ground itself: there is no flame to keep clear any more.
                this.puffAt(puffs++)
                    .setTexture(tile.steam ? STEAM_TEXTURE : SMOKE_TEXTURE)
                    .setPosition(footX + puff.x * farScale, footY + drop + (puff.y + 40) * farScale)
                    .setDisplaySize(puff.radius * 2 * farScale, puff.radius * 2 * farScale)
                    .setAlpha(Math.min(1, puff.alpha * share * (tile.steam ? 1.1 : 1.5)))
                    .setVisible(true);
            }
            if (tile.steam) continue;
            for (const ember of smoulderPoints(tile.x, tile.y, tile.left)) {
                const pulse = reducedMotion ? 0.8 : 0.65 + 0.35 * Math.sin(seconds * 2.4 + ember.x * 0.37);
                this.glowAt(glows++)
                    .setPosition(ember.x, ember.y + drop)
                    .setDisplaySize(GROUND_EMBER_PX, GROUND_EMBER_PX)
                    .setAlpha(ember.alpha * pulse)
                    .setVisible(true);
            }
        }
        for (let index = shown.length; index < this.flames.length; index++) this.flames[index].setVisible(false);
        for (let index = glows; index < this.glows.length; index++) this.glows[index].setVisible(false);
        for (let index = puffs; index < this.puffs.length; index++) this.puffs[index].setVisible(false);
        this.drawn = true;
        this.scene.markDirty();
    }

    public destroy(): void {
        for (const image of [...this.flames, ...this.glows, ...this.puffs]) image.destroy();
        this.flames.length = 0;
        this.glows.length = 0;
        this.puffs.length = 0;
    }

    /** The tiles on fire around a tile, itself counted. */
    private burningAround(tileX: number, tileY: number): number {
        let burning = 0;
        for (let y = tileY - GLOW_NEIGHBOUR_REACH; y <= tileY + GLOW_NEIGHBOUR_REACH; y++) {
            for (let x = tileX - GLOW_NEIGHBOUR_REACH; x <= tileX + GLOW_NEIGHBOUR_REACH; x++) {
                if (this.meadow.fireAt(x, y) > 0) burning++;
            }
        }
        return burning;
    }

    /** The tiles that smoulder around one of them (two tiles each way), itself counted: they share their smoke. */
    private smoulderingAround(tiles: readonly { x: number; y: number }[], tile: { x: number; y: number }): number {
        let around = 0;
        for (const other of tiles) {
            if (
                Math.abs(other.x - tile.x) <= GLOW_NEIGHBOUR_REACH &&
                Math.abs(other.y - tile.y) <= GLOW_NEIGHBOUR_REACH
            ) {
                around++;
            }
        }
        return around;
    }

    private flameAt(index: number): Phaser.GameObjects.Image {
        // Held by the middle of its foot: it grows and turns from there.
        this.flames[index] ??= this.scene.add.image(0, 0, FLAMES_TEXTURE, 0).setOrigin(0.5, 1);
        return this.flames[index];
    }

    private glowAt(index: number): Phaser.GameObjects.Image {
        // Through the veil of the night, added to what it lights.
        this.glows[index] ??= this.scene.add
            .image(0, 0, GLOW_TEXTURE)
            .setDepth(DEPTH_LAMP_LIGHT_INDEX + 1)
            .setBlendMode(Phaser.BlendModes.ADD);
        return this.glows[index];
    }

    private puffAt(index: number): Phaser.GameObjects.Image {
        // Over everything that stands on the map, under the veil of the night.
        this.puffs[index] ??= this.scene.add.image(0, 0, SMOKE_TEXTURE).setDepth(DEPTH_NIGHT_INDEX - 1);
        return this.puffs[index];
    }

    private clear(): void {
        for (const image of this.flames) image.setVisible(false);
        for (const image of this.glows) image.setVisible(false);
        for (const image of this.puffs) image.setVisible(false);
        this.drawn = false;
        this.lastStep = -1;
        this.scene.markDirty();
    }

    /** Draws the frames of the loop, one more that stands still without embers, and the two soft discs. */
    private drawTextures(): void {
        const textures = this.scene.textures;
        if (!textures.exists(FLAMES_TEXTURE)) {
            const frames = FLAME_FRAMES + 1;
            const sheet = textures.createCanvas(FLAMES_TEXTURE, FLAME_FRAME_WIDTH_PX * frames, FLAME_FRAME_HEIGHT_PX);
            if (sheet) {
                const context = sheet.getContext();
                for (let frame = 0; frame < frames; frame++) {
                    const still = frame === FLAME_FRAMES;
                    const flame = still ? { ...drawnFlame(0), tip: { x: 0, y: 0 } } : drawnFlame(frame);
                    const footX = frame * FLAME_FRAME_WIDTH_PX + FLAME_FRAME_WIDTH_PX / 2;
                    const footY = FLAME_FRAME_HEIGHT_PX;
                    for (const tongue of TONGUES) {
                        const outline = flameOutline(flame, tongue.scale);
                        context.globalAlpha = tongue.alpha;
                        context.fillStyle = tongue.color;
                        context.beginPath();
                        context.moveTo(footX + outline[0].x, footY + outline[0].y);
                        for (const point of outline.slice(1)) context.lineTo(footX + point.x, footY + point.y);
                        context.closePath();
                        context.fill();
                    }
                    if (!still) {
                        context.fillStyle = EMBER_COLOR;
                        for (const ember of drawnEmbers(frame)) {
                            context.globalAlpha = ember.alpha;
                            context.fillRect(Math.round(footX + ember.x) - 1, Math.round(footY + ember.y) - 1, 2, 2);
                        }
                    }
                    sheet.add(frame, 0, frame * FLAME_FRAME_WIDTH_PX, 0, FLAME_FRAME_WIDTH_PX, FLAME_FRAME_HEIGHT_PX);
                }
                context.globalAlpha = 1;
                refreshCanvasTexture(sheet);
            }
        }
        this.drawSoftDisc(GLOW_TEXTURE, `rgba(255, 122, 26, ${GLOW_ALPHA * 2})`, "rgba(255, 122, 26, 0)");
        this.drawSoftDisc(SMOKE_TEXTURE, "rgba(168, 166, 162, 1)", "rgba(168, 166, 162, 0)");
        this.drawSoftDisc(TREE_SMOKE_TEXTURE, "rgba(22, 20, 19, 1)", "rgba(22, 20, 19, 0)");
        this.drawSoftDisc(STEAM_TEXTURE, "rgba(246, 248, 250, 1)", "rgba(246, 248, 250, 0)");
    }

    private drawSoftDisc(key: string, middle: string, edge: string): void {
        if (this.scene.textures.exists(key)) return;
        const disc = this.scene.textures.createCanvas(key, SOFT_DISC_PX, SOFT_DISC_PX);
        if (!disc) return;
        // The game runs without antialiasing (nearest filtering): a glow must be smoothed all the same.
        disc.setFilter(Phaser.Textures.FilterMode.LINEAR);
        const context = disc.getContext();
        const half = SOFT_DISC_PX / 2;
        const gradient = context.createRadialGradient(half, half, 0, half, half, half);
        gradient.addColorStop(0, middle);
        gradient.addColorStop(0.5, middle);
        gradient.addColorStop(1, edge);
        context.fillStyle = gradient;
        context.fillRect(0, 0, SOFT_DISC_PX, SOFT_DISC_PX);
        refreshCanvasTexture(disc);
    }
}
