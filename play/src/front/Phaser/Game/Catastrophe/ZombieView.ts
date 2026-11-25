import * as Phaser from "phaser";
import { ZOMBIE_WALKING, ZombieCrowd } from "@workadventure/map-editor";
import type { ZombieHorde } from "@workadventure/map-editor";
import { floorDepth } from "../MapEditor/MapLayer/FloorDepth";
import { SWIM_DEPTH_PX } from "../Terrain/Pixel/TerrainUnits";
import {
    ZOMBIE_DEAD,
    ZOMBIE_IDLE,
    ZOMBIE_SHEET_COLUMNS,
    ZOMBIE_SHEETS,
    ZOMBIE_WALK,
    zombieAtlasFrame,
    zombieAtlasLayout,
} from "./ZombieSheets";

const TEXTURE = "zombie-horde";
/**
 * The zombies are drawn by bands of the map this high (a tile), each band one batch of images at the depth of its
 * bottom: an avatar (drawn at the depth of its feet) is in front of the zombies of the bands above it, behind those
 * of its band and below. Within a band, the zombies are drawn from the top down.
 */
const BAND_PX = 32;
const SUB_BANDS = 4;
/** A zombie is drawn this far out of the view still: its image overhangs its feet. */
const VIEW_MARGIN_PX = 64;
/**
 * The sheets are laid in the atlas at these scales, smoothed: about as tall as an avatar (32 px), some a little
 * smaller. (A Blitter is not scaled when it is drawn: its images are.)
 */
const SCALES: readonly number[] = [0.44, 0.5];
/** The frames of the atlas at one scale; those of the next scale follow. */
const FRAMES_A_SCALE = ZOMBIE_SHEETS.length * 5 * ZOMBIE_SHEET_COLUMNS;
/**
 * In water one swims in (SWIM_DEPTH_PX), a zombie wades on, half under: the same images cut at this share of their
 * height (the frames after all the others), drawn this share of it lower. As an avatar swims (SwimEffect: 20 rows of
 * 32 above the water, sunk by 5).
 */
const WADING_FRAMES = SCALES.length * FRAMES_A_SCALE;
const WADING_SHOWN = 20 / 32;
const WADING_SINK = 5 / 32;
/** An image of the walk every this many pixels of the map walked: a stride of some 3 m runs over its 8 images. */
const STRIDE_PX = 10;
/** Under this speed (px/s) a zombie stands, and sways in its idle images, this many a second. */
const STANDING_PX_S = 9;
const IDLE_FPS = 7;
/** The tints of the horde: greys, sallow, greenish, a few of each. */
const TINTS: readonly number[] = [0xffffff, 0xe6e6e6, 0xd2d2d2, 0xe8f0d0, 0xd8e8c8, 0xf0e0c8, 0xc8d4c0, 0xdadada];
/** A browser catches up with the horde at most this long an image (ms): a horde joined late shows in a while. */
const CATCH_UP_MS = 8;
/** The horde shows once it is at most this many steps behind the time of the server. */
const SHOWN_BEHIND_STEPS = 3;
/** Stopped or over, the zombies left fall to dust over this long (ms). */
const DUST_MS = 1500;
/** The batches of a band are told apart by the altitude they are drawn at: this many bands an altitude, at most. */
const BANDS_AN_ALTITUDE = 65_536;

/** The images of one band of the map at one altitude, and how many it shows (`drawn`: at this image so far). */
interface ZombieBatch {
    blitter: Phaser.GameObjects.Blitter;
    bobs: Phaser.GameObjects.Bob[];
    shown: number;
    drawn: number;
}

/**
 * The horde of zombies of the room, drawn: its crowd (ZombieCrowd, the same as the server's and every other
 * browser's, from the horde the server tells) stepped to the time of the server, a little each image, and its zombies
 * drawn between their last two steps. Images of one sheet drawn once, batched by bands of the map (Phaser Blitter),
 * a pool of them kept: nothing is made or thrown away at each image. Nothing at all while no horde crosses the map.
 */
export class ZombieView {
    private crowd: ZombieCrowd | undefined;
    /** What is drawn of each zombie: where it faces, how far into its shamble, how dark. */
    private facing = new Uint8Array(0);
    private stride = new Float32Array(0);
    private tint = new Uint32Array(0);
    /** The batches of images, by band of the map and altitude (see batchOf), and how many each shows. */
    private readonly bands = new Map<number, ZombieBatch>();
    /** Whether the sheets are asked for, and laid in the atlas of the horde. */
    private requested = false;
    /** The zombies seen, sorted by band then by row, refilled at each image. */
    private order = new Int32Array(0);
    private bandOf = new Int32Array(0);
    private drawY = new Float32Array(0);
    private drawX = new Float32Array(0);
    /** How high over the ground each zombie seen is drawn (px): on the deck of a bridge, or up its ramp. */
    private liftOf = new Int16Array(0);
    /** Whether each zombie seen wades in water one swims in: drawn half under. */
    private wading = new Uint8Array(0);
    /** A horde stopped or over: its last zombies (those walking then), fading. */
    private dust: { until: number; walking: Uint8Array } | undefined;
    private walkingNow = 0;
    /** Whether the crowd was drawn at the last image (caught up). */
    private shown = false;
    /** What draw sorts with, kept from an image to the next. */
    private counts = new Int32Array(0);
    private next = new Int32Array(0);

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        /** How much lower a point of the ground is drawn (the relief in 3/4); none when absent. */
        private readonly groundDropAt: (x: number, y: number) => number = () => 0,
        /**
         * How high over the ground one walks above a point of the ground (map pixels): the bridges of the map
         * (GameScene.getBridgeElevationAt). None when absent.
         */
        private readonly liftAt: (x: number, y: number) => number = () => 0,
        /**
         * How deep the water of the relief is at a point of the ground now (px): the water as it is now, a flood or a
         * tsunami included, not the one the horde began on. None when absent.
         */
        private readonly waterAt: (x: number, y: number) => number = () => 0,
        /** Where each sheet is fetched from: the resources of the game by default. */
        private readonly urlOf: (sheet: (typeof ZOMBIE_SHEETS)[number]) => string = (sheet) => sheet.url,
    ) {}

    /** The horde of the room, as the server tells it: the same one keeps its crowd. Undefined: it falls to dust. */
    public setHorde(horde: ZombieHorde | undefined, now: number): void {
        const crowd = this.crowd;
        if (horde && crowd && crowd.horde.id === horde.id && crowd.horde.startedAt === horde.startedAt) {
            // The same horde told again: where the avatars stood since, its clock (the speed of the map).
            crowd.setLog(horde.avatars, horde.safeStep);
            crowd.setClock(horde);
            // Told again after a silence that let it fall to dust: it walks on, the same crowd.
            if (this.dust && !crowd.over()) this.dust = undefined;
            return;
        }
        if (!horde) {
            if (crowd && !this.dust) this.fallToDust(crowd, now);
            return;
        }
        this.makeTexture();
        const made = new ZombieCrowd(horde);
        this.crowd = made;
        this.dust = undefined;
        this.facing = new Uint8Array(made.count);
        this.stride = new Float32Array(made.count);
        this.tint = new Uint32Array(made.count);
        this.order = new Int32Array(made.count);
        this.bandOf = new Int32Array(made.count);
        this.drawX = new Float32Array(made.count);
        this.drawY = new Float32Array(made.count);
        this.liftOf = new Int16Array(made.count);
        this.wading = new Uint8Array(made.count);
        for (let zombie = 0; zombie < made.count; zombie++) {
            // Tinted, a crowd, not copies.
            this.tint[zombie] = TINTS[(Math.imul(zombie, 2654435761) >>> 0) % TINTS.length];
        }
    }

    /**
     * The zombies walking now fall to dust (the horde stopped, or over): drawn where they are, fading. None when the
     * crowd was not shown (still catching up): it would show where they were long ago.
     */
    private fallToDust(crowd: ZombieCrowd, now: number): void {
        const walking = new Uint8Array(crowd.count);
        if (this.shown) {
            for (let zombie = 0; zombie < crowd.count; zombie++) {
                walking[zombie] = crowd.state[zombie] === ZOMBIE_WALKING ? 1 : 0;
            }
        }
        this.dust = { until: now + DUST_MS, walking };
    }

    /** Whether a horde is drawn or falling to dust: what GameScene steps at each image. */
    public active(): boolean {
        return this.crowd !== undefined;
    }

    /** How many zombies walk on the map now; undefined while there is no horde. */
    public walking(): number | undefined {
        return this.crowd && !this.dust ? this.walkingNow : undefined;
    }

    /** How the horde shoves an avatar whose body is at (x, y), px/s: nothing while it is not drawn. */
    public shoveAt(x: number, y: number): { x: number; y: number } {
        const crowd = this.crowd;
        if (!crowd || this.dust || !this.shown) return { x: 0, y: 0 };
        return crowd.shoveAt(x, y);
    }

    /** Where the body of the horde is (the mean of those walking), map pixels; undefined while none walks. */
    public centre(): { x: number; y: number } | undefined {
        const crowd = this.crowd;
        if (!crowd || crowd.walking === 0) return undefined;
        let x = 0;
        let y = 0;
        for (let zombie = 0; zombie < crowd.count; zombie++) {
            if (crowd.state[zombie] !== ZOMBIE_WALKING) continue;
            x += crowd.x[zombie];
            y += crowd.y[zombie];
        }
        return { x: x / crowd.walking, y: y / crowd.walking };
    }

    /** The pace of the horde, m/s; undefined while there is none. */
    public pace(): number | undefined {
        return this.crowd?.paceMetres();
    }

    /** The sheets are fetched the first time a horde comes, then laid in one atlas: one texture for every batch. */
    private makeTexture(): void {
        if (this.requested || this.scene.textures.exists(TEXTURE)) return;
        this.requested = true;
        const missing = ZOMBIE_SHEETS.filter((sheet) => !this.scene.textures.exists(sheet.key));
        for (const sheet of missing) this.scene.load.image(sheet.key, this.urlOf(sheet));
        if (missing.length === 0) {
            this.layAtlas();
            return;
        }
        this.scene.load.once("complete", () => this.layAtlas());
        this.scene.load.start();
    }

    private frameWidthOf(sheet: (typeof ZOMBIE_SHEETS)[number], size: number): number {
        return Math.ceil(sheet.frameWidth * SCALES[size]);
    }

    private frameHeightOf(sheet: (typeof ZOMBIE_SHEETS)[number], size: number): number {
        return Math.ceil(sheet.frameHeight * SCALES[size]);
    }

    private layAtlas(): void {
        if (this.scene.textures.exists(TEXTURE)) return;
        if (!ZOMBIE_SHEETS.every((sheet) => this.scene.textures.exists(sheet.key))) return;
        const { width, height, tops } = zombieAtlasLayout();
        // The atlas at each scale, side by side.
        const lefts: number[] = [];
        let atlasWidth = 0;
        for (const scale of SCALES) {
            lefts.push(atlasWidth);
            atlasWidth += Math.ceil(width * scale) + 2;
        }
        const atlasHeight = Math.ceil(height * SCALES[SCALES.length - 1]) + 2;
        const canvas = this.scene.textures.createCanvas(TEXTURE, atlasWidth, atlasHeight);
        const context = canvas?.getContext();
        if (!canvas || !context) return;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        SCALES.forEach((scale, size) => {
            ZOMBIE_SHEETS.forEach((sheet, index) => {
                const image = this.scene.textures.get(sheet.key).getSourceImage();
                if (!(image instanceof HTMLImageElement || image instanceof HTMLCanvasElement)) {
                    console.warn("A sheet of the zombies could not be drawn into their atlas", sheet.key);
                    return;
                }
                const frameWidth = this.frameWidthOf(sheet, size);
                const frameHeight = this.frameHeightOf(sheet, size);
                sheet.counts.forEach((count, row) => {
                    for (let column = 0; column < count; column++) {
                        const x = lefts[size] + column * frameWidth;
                        const y = Math.round(tops[index] * scale) + row * frameHeight;
                        // Frame by frame: none bleeds into its neighbour.
                        context.drawImage(
                            image,
                            column * sheet.frameWidth,
                            row * sheet.frameHeight,
                            sheet.frameWidth,
                            sheet.frameHeight,
                            x,
                            y,
                            frameWidth,
                            frameHeight,
                        );
                        const frame = size * FRAMES_A_SCALE + zombieAtlasFrame(index, row, column);
                        canvas.add(frame, 0, x, y, frameWidth, frameHeight);
                        // Its top only, for a zombie wading.
                        canvas.add(WADING_FRAMES + frame, 0, x, y, frameWidth, Math.round(frameHeight * WADING_SHOWN));
                    }
                });
            });
        });
        canvas.refresh();
        // Halved, smoothly: their pixels are finer than those of the map.
        canvas.setFilter(Phaser.Textures.FilterMode.LINEAR);
        this.scene.markDirty();
    }

    /**
     * At each image: the crowd stepped towards the time of the server `epoch` (CATCH_UP_MS at most), then drawn
     * between its last two steps, over the view of the camera. Not `shown` (Basique), nothing is drawn nor stepped:
     * it catches up once shown again. `still` (reduced motion): the zombies glide, they do not shamble.
     */
    public update(epoch: number | undefined, now: number, shown: boolean, still: boolean): void {
        const crowd = this.crowd;
        if (!crowd) return;
        if (this.dust) {
            const left = (this.dust.until - now) / DUST_MS;
            if (left <= 0 || !shown) {
                this.forget();
                return;
            }
            if (this.scene.textures.exists(TEXTURE)) this.draw(crowd, 1, left, still);
            this.scene.markDirty();
            return;
        }
        if (!shown || epoch === undefined) {
            this.hideAll();
            return;
        }
        const target = crowd.stepFor(epoch);
        const started = performance.now();
        while (crowd.steps < target && performance.now() - started < CATCH_UP_MS) {
            // Its last step takes everyone off the map: those still on it fall to dust instead.
            if (crowd.steps + 1 >= crowd.lastStep) {
                this.fallToDust(crowd, now);
                return;
            }
            crowd.step();
            this.shamble(crowd);
        }
        this.walkingNow = crowd.walking;
        if (target - crowd.steps > SHOWN_BEHIND_STEPS || crowd.over()) {
            this.shown = false;
            this.hideAll();
            return;
        }
        this.shown = true;
        if (!this.scene.textures.exists(TEXTURE)) return;
        this.draw(crowd, crowd.between(epoch), 1, still);
        this.scene.markDirty();
    }

    /** After a step: each zombie that walked is that much further into its shamble, and faces where it goes. */
    private shamble(crowd: ZombieCrowd): void {
        const { x, y, lastX, lastY, state } = crowd;
        for (let zombie = 0; zombie < crowd.count; zombie++) {
            if (state[zombie] !== ZOMBIE_WALKING) continue;
            const dx = x[zombie] - lastX[zombie];
            const dy = y[zombie] - lastY[zombie];
            this.stride[zombie] += Math.sqrt(dx * dx + dy * dy) / STRIDE_PX;
            // Drawn from the side, facing right or left: it turns once it clearly goes the other way, and keeps its
            // side while it goes up or down the map.
            if (dx > 0.3) this.facing[zombie] = 0;
            else if (dx < -0.3) this.facing[zombie] = 1;
        }
    }

    private draw(crowd: ZombieCrowd, between: number, alpha: number, still: boolean): void {
        const view = this.scene.cameras.main.worldView;
        const left = view.x - VIEW_MARGIN_PX;
        const right = view.right + VIEW_MARGIN_PX;
        const top = view.y - VIEW_MARGIN_PX;
        const bottom = view.bottom + VIEW_MARGIN_PX + 2 * BAND_PX;
        const { x, y, lastX, lastY, state } = crowd;
        // The zombies seen, counted by sub-band, then laid in order.
        const firstBand = Math.max(0, Math.floor(top / BAND_PX));
        const lastBand = Math.max(firstBand, Math.floor(bottom / BAND_PX));
        const slots = (lastBand - firstBand + 1) * SUB_BANDS;
        if (this.counts.length < slots + 1) {
            this.counts = new Int32Array(slots + 1);
            this.next = new Int32Array(slots + 1);
        }
        const counts = this.counts;
        counts.fill(0, 0, slots + 1);
        const dust = this.dust?.walking;
        let seen = 0;
        for (let zombie = 0; zombie < crowd.count; zombie++) {
            this.bandOf[zombie] = -1;
            if (dust ? dust[zombie] === 0 : state[zombie] !== ZOMBIE_WALKING) continue;
            const px = lastX[zombie] + (x[zombie] - lastX[zombie]) * between;
            const py = lastY[zombie] + (y[zombie] - lastY[zombie]) * between;
            if (px < left || px > right || py < top || py > bottom) continue;
            // On a bridge (the crowd walks on the ground under its deck, dry there): drawn as high as the deck, over
            // its slabs, and sorted there by its place on the ground, as the animals are (LandLifeView). Elsewhere,
            // where the ground is drawn: lower in a hollow, higher on a mount.
            const lift = Math.round(this.liftAt(px, py));
            const dy = lift > 0 ? py : py + this.groundDropAt(px, py);
            const slot = Math.min(slots - 1, Math.max(0, Math.floor((dy / BAND_PX - firstBand) * SUB_BANDS)));
            this.drawX[zombie] = px;
            this.drawY[zombie] = dy - lift;
            this.liftOf[zombie] = lift;
            // Nothing drowns it (the crowd walks on its ground as it was when the horde began): in deep water it
            // wades on, half under, never hidden.
            this.wading[zombie] = lift === 0 && this.waterAt(px, py) >= SWIM_DEPTH_PX ? 1 : 0;
            this.bandOf[zombie] = slot;
            counts[slot + 1]++;
            seen++;
        }
        for (let slot = 0; slot < slots; slot++) counts[slot + 1] += counts[slot];
        const next = this.next;
        next.set(counts.subarray(0, slots));
        for (let zombie = 0; zombie < crowd.count; zombie++) {
            // Only those counted above: drawn at this image.
            if (this.bandOf[zombie] >= 0) this.order[next[this.bandOf[zombie]]++] = zombie;
        }
        // Each band its zombies, from the top down, in the batch of the altitude each is drawn at.
        for (const batch of this.bands.values()) batch.drawn = 0;
        let at = 0;
        const dying = this.dust ? 1 - alpha : 0;
        for (let band = firstBand; band <= lastBand && at < seen; band++) {
            const end = counts[(band - firstBand + 1) * SUB_BANDS];
            for (; at < end; at++) {
                const zombie = this.order[at];
                const batch = this.batchOf(band, this.liftOf[zombie]);
                const look = zombie % ZOMBIE_SHEETS.length;
                const sheet = ZOMBIE_SHEETS[look];
                const size = (zombie >> 2) % SCALES.length;
                const bob = batch.drawn < batch.bobs.length ? batch.bobs[batch.drawn] : this.addBob(batch);
                batch.drawn++;
                let row = ZOMBIE_WALK;
                let image: number;
                if (this.dust) {
                    // Falling to dust: they collapse, then fade.
                    row = ZOMBIE_DEAD;
                    image = Math.min(sheet.counts[ZOMBIE_DEAD] - 1, Math.floor(dying * 2 * sheet.counts[ZOMBIE_DEAD]));
                } else {
                    const vx = crowd.vx[zombie];
                    const vy = crowd.vy[zombie];
                    if (vx * vx + vy * vy < STANDING_PX_S * STANDING_PX_S) {
                        row = ZOMBIE_IDLE;
                        image = still
                            ? 0
                            : Math.floor((this.scene.time.now / 1000) * IDLE_FPS + zombie) % sheet.counts[ZOMBIE_IDLE];
                    } else {
                        image = still ? 0 : Math.floor(this.stride[zombie]) % sheet.counts[ZOMBIE_WALK];
                    }
                }
                const wading = this.wading[zombie] === 1;
                bob.setFrame((wading ? WADING_FRAMES : 0) + size * FRAMES_A_SCALE + zombieAtlasFrame(look, row, image));
                bob.flipX = this.facing[zombie] === 1;
                bob.x = Math.round(this.drawX[zombie] - this.frameWidthOf(sheet, size) / 2);
                const height = this.frameHeightOf(sheet, size);
                bob.y = Math.round(this.drawY[zombie] - height + 1 + (wading ? height * WADING_SINK : 0));
                bob.tint = this.tint[zombie];
                bob.setAlpha(this.dust ? Math.min(1, alpha * 2) : 1);
                bob.setVisible(true);
            }
        }
        for (const batch of this.bands.values()) {
            for (let hidden = batch.drawn; hidden < batch.shown; hidden++) batch.bobs[hidden].setVisible(false);
            batch.shown = batch.drawn;
        }
    }

    /**
     * The batch of a band of the map at an altitude: on the ground at the depth of the bottom of the band; above it
     * (a deck, a ramp), in the band of depths of that altitude, over its slabs (floorDepth), sorted as on the ground.
     */
    private batchOf(band: number, lift: number): ZombieBatch {
        const key = lift * BANDS_AN_ALTITUDE + band;
        let batch = this.bands.get(key);
        if (!batch) {
            const groundDepth = (band + 1) * BAND_PX;
            const blitter = this.scene.add.blitter(0, 0, TEXTURE).setDepth(floorDepth(lift, groundDepth));
            batch = { blitter, bobs: [], shown: 0, drawn: 0 };
            this.bands.set(key, batch);
        }
        return batch;
    }

    private addBob(batch: ZombieBatch): Phaser.GameObjects.Bob {
        const bob = batch.blitter.create(0, 0, 0);
        batch.bobs.push(bob);
        return bob;
    }

    private hideAll(): void {
        for (const batch of this.bands.values()) {
            for (let hidden = 0; hidden < batch.shown; hidden++) batch.bobs[hidden].setVisible(false);
            batch.shown = 0;
        }
    }

    /** The horde is gone: its images with it. */
    private forget(): void {
        for (const batch of this.bands.values()) batch.blitter.destroy();
        this.bands.clear();
        this.crowd = undefined;
        this.dust = undefined;
        this.walkingNow = 0;
        this.shown = false;
        this.scene.markDirty();
    }

    public destroy(): void {
        for (const batch of this.bands.values()) batch.blitter.destroy();
        this.bands.clear();
        this.crowd = undefined;
    }
}
