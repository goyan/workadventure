import type * as Phaser from "phaser";
import { ZOMBIE_WALKING, ZombieCrowd } from "@workadventure/map-editor";
import type { WaterWallSides, ZombieHorde } from "@workadventure/map-editor";
import {
    drawZombieSheet,
    ZOMBIE_DOWN,
    ZOMBIE_FEET_Y,
    ZOMBIE_FRAME_HEIGHT,
    ZOMBIE_FRAME_WIDTH,
    ZOMBIE_LOOKS,
    ZOMBIE_SHEET_HEIGHT,
    ZOMBIE_SHEET_WIDTH,
    ZOMBIE_SIDE,
    ZOMBIE_UP,
    zombieFrame,
    zombieFrameAt,
} from "./ZombieSprites";

const TEXTURE = "zombie-horde";
/**
 * The zombies are drawn by bands of the map this high (a tile), each band one batch of images at the depth of its
 * bottom: an avatar (drawn at the depth of its feet) is in front of the zombies of the bands above it, behind those
 * of its band and below. Within a band, the zombies are drawn from the top down.
 */
const BAND_PX = 32;
const SUB_BANDS = 4;
/** A zombie is drawn this far out of the view still: its image overhangs its feet. */
const VIEW_MARGIN_PX = 48;
/** A step of the shamble every this many pixels walked. */
const STRIDE_PX = 7;
/** A browser catches up with the horde at most this long an image (ms): a horde joined late shows in a while. */
const CATCH_UP_MS = 8;
/** The horde shows once it is at most this many steps behind the time of the server. */
const SHOWN_BEHIND_STEPS = 3;
/** Stopped or over, the zombies left fall to dust over this long (ms). */
const DUST_MS = 1500;

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
    /** The batches of images, by band of the map, and how many each shows. */
    private readonly bands = new Map<
        number,
        { blitter: Phaser.GameObjects.Blitter; bobs: Phaser.GameObjects.Bob[]; shown: number }
    >();
    /** The zombies seen, sorted by band then by row, refilled at each image. */
    private order = new Int32Array(0);
    private bandOf = new Int32Array(0);
    private drawY = new Float32Array(0);
    private drawX = new Float32Array(0);
    /** A horde stopped or over: its last zombies (those walking then), fading. */
    private dust: { until: number; walking: Uint8Array } | undefined;
    private walkingNow = 0;
    /** Whether the crowd was drawn at the last image (caught up). */
    private shown = false;
    /** What draw sorts with, kept from an image to the next. */
    private counts = new Int32Array(0);
    private next = new Int32Array(0);
    private readonly used = new Set<number>();

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        /** The walls of the map with their doors closed (landWallsOf), as the server reads them. */
        private readonly walls: () => WaterWallSides | undefined,
        /** How much lower a point of the ground is drawn (the relief in 3/4); none when absent. */
        private readonly groundDropAt: (x: number, y: number) => number = () => 0,
    ) {}

    /** The horde of the room, as the server tells it: the same one keeps its crowd. Undefined: it falls to dust. */
    public setHorde(horde: ZombieHorde | undefined, now: number): void {
        const crowd = this.crowd;
        if (horde && crowd && crowd.horde.id === horde.id && crowd.horde.startedAt === horde.startedAt) {
            // Told again after a silence that let it fall to dust: it walks on, the same crowd.
            if (this.dust && !crowd.over()) this.dust = undefined;
            return;
        }
        if (!horde) {
            if (crowd && !this.dust) this.fallToDust(crowd, now);
            return;
        }
        this.makeTexture();
        const made = new ZombieCrowd(horde, this.walls());
        this.crowd = made;
        this.dust = undefined;
        this.facing = new Uint8Array(made.count);
        this.stride = new Float32Array(made.count);
        this.tint = new Uint32Array(made.count);
        this.order = new Int32Array(made.count);
        this.bandOf = new Int32Array(made.count);
        this.drawX = new Float32Array(made.count);
        this.drawY = new Float32Array(made.count);
        for (let zombie = 0; zombie < made.count; zombie++) {
            // Some a little darker than others: a crowd, not copies.
            const shade = 200 + ((Math.imul(zombie, 2654435761) >>> 0) % 56);
            this.tint[zombie] = (shade << 16) | (shade << 8) | shade;
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

    private makeTexture(): void {
        if (this.scene.textures.exists(TEXTURE)) return;
        const canvas = this.scene.textures.createCanvas(TEXTURE, ZOMBIE_SHEET_WIDTH, ZOMBIE_SHEET_HEIGHT);
        const context = canvas?.getContext();
        if (!canvas || !context) return;
        const image = context.createImageData(ZOMBIE_SHEET_WIDTH, ZOMBIE_SHEET_HEIGHT);
        image.data.set(drawZombieSheet());
        context.putImageData(image, 0, 0);
        const frames = ZOMBIE_LOOKS * (ZOMBIE_SHEET_WIDTH / ZOMBIE_FRAME_WIDTH);
        for (let frame = 0; frame < frames; frame++) {
            const { x, y } = zombieFrameAt(frame);
            canvas.add(frame, 0, x, y, ZOMBIE_FRAME_WIDTH, ZOMBIE_FRAME_HEIGHT);
        }
        canvas.refresh();
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
            this.draw(crowd, 1, left, still);
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
            const ax = Math.abs(dx);
            const ay = Math.abs(dy);
            if (ax + ay < 0.2) continue;
            // It faces the axis it mostly walks along, and turns to the other only once that one clearly wins: no
            // flicker on a diagonal.
            const side = this.facing[zombie] >= 2;
            const turnsSide = side ? ax * 1.15 >= ay : ax > 1.15 * ay;
            this.facing[zombie] = turnsSide ? (dx > 0 ? 2 : 3) : dy > 0 ? 0 : 1;
        }
    }

    private draw(crowd: ZombieCrowd, between: number, alpha: number, still: boolean): void {
        const view = this.scene.cameras.main.worldView;
        const left = view.x - VIEW_MARGIN_PX;
        const right = view.right + VIEW_MARGIN_PX;
        const top = view.y - VIEW_MARGIN_PX;
        const bottom = view.bottom + VIEW_MARGIN_PX + ZOMBIE_FRAME_HEIGHT;
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
            const drop = this.groundDropAt(px, py);
            const dy = py + drop;
            const slot = Math.min(slots - 1, Math.max(0, Math.floor((dy / BAND_PX - firstBand) * SUB_BANDS)));
            this.drawX[zombie] = px;
            this.drawY[zombie] = dy;
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
        // Each band its zombies, from the top down.
        const used = this.used;
        used.clear();
        let at = 0;
        for (let band = firstBand; band <= lastBand && at < seen; band++) {
            const end = counts[(band - firstBand + 1) * SUB_BANDS];
            if (end <= at) continue;
            const batch = this.band(band);
            used.add(band);
            let shown = 0;
            for (; at < end; at++) {
                const zombie = this.order[at];
                const bob = shown < batch.bobs.length ? batch.bobs[shown] : this.addBob(batch);
                shown++;
                const facing = this.facing[zombie];
                const way = facing === 0 ? ZOMBIE_DOWN : facing === 1 ? ZOMBIE_UP : ZOMBIE_SIDE;
                const step = still ? 0 : Math.floor(this.stride[zombie]) & 3;
                const water = crowd.waterAt(x[zombie], y[zombie]);
                bob.setFrame(zombieFrame(zombie % ZOMBIE_LOOKS, water, way, step));
                bob.flipX = facing === 3;
                bob.x = Math.round(this.drawX[zombie] - ZOMBIE_FRAME_WIDTH / 2);
                bob.y = Math.round(this.drawY[zombie] - ZOMBIE_FEET_Y);
                bob.tint = this.tint[zombie];
                bob.setAlpha(alpha);
                bob.setVisible(true);
            }
            for (let hidden = shown; hidden < batch.shown; hidden++) batch.bobs[hidden].setVisible(false);
            batch.shown = shown;
        }
        for (const [band, batch] of this.bands) {
            if (used.has(band) || batch.shown === 0) continue;
            for (let hidden = 0; hidden < batch.shown; hidden++) batch.bobs[hidden].setVisible(false);
            batch.shown = 0;
        }
    }

    private band(band: number): { blitter: Phaser.GameObjects.Blitter; bobs: Phaser.GameObjects.Bob[]; shown: number } {
        let batch = this.bands.get(band);
        if (!batch) {
            const blitter = this.scene.add.blitter(0, 0, TEXTURE).setDepth((band + 1) * BAND_PX);
            batch = { blitter, bobs: [], shown: 0 };
            this.bands.set(band, batch);
        }
        return batch;
    }

    private addBob(batch: {
        blitter: Phaser.GameObjects.Blitter;
        bobs: Phaser.GameObjects.Bob[];
    }): Phaser.GameObjects.Bob {
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
