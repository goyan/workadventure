import { TILE_PX } from "@workadventure/map-editor";
import type { CatastropheMessage } from "@workadventure/messages";
import { DEPTH_NIGHT_INDEX } from "@wa/front/Phaser/Game/DepthIndexes";
import { drawLower } from "@wa/front/Phaser/Game/Terrain/GroundDrop";
import { isEffectShown } from "@wa/front/Stores/EffectsStore";
import { coldAt, coldFrostRings, coldMist, coldSparkles, coldStrength, tellCold } from "./ColdShape";
import type { ShownCold } from "./ColdShape";

/** The frost on the ground: a white that leans to blue. */
const FROST_COLOR = 0xe6f3ff;
const FROST_ALPHA = 0.34;
/** The frost takes this long to reach the rim of a mass that just came (ms): it is seen gaining ground. */
const FROST_GAINS_MS = 2500;
/** The mist that creeps on the ground, and the paler heart of each wisp. */
const MIST_COLOR = 0xcfe6fb;
const MIST_LIGHT = 0xffffff;
const MIST_ALPHA = 0.13;
/** The crystals of ice in the air. */
const SPARKLE_COLOR = 0xffffff;
/** Wisps of mist and crystals for each tile of the radius of a mass, and never fewer nor more than these. */
const WISPS_PER_TILE = 5;
const SPARKLES_PER_TILE = 9;
const FEWEST = 10;
const MOST_WISPS = 44;
const MOST_SPARKLES = 110;
/** The mass follows the pointer of its player this fast: all the way in about a fifth of a second. */
const FOLLOW_PER_MS = 0.012;

interface Shown extends ShownCold {
    /** Where it is drawn: it glides to where the server tells it. */
    drawnX: number;
    drawnY: number;
}

/**
 * The cold snaps the server announces: over the disc the server freezes, the frost that gains the ground (whole in
 * the core, fading to the rim, as the cold itself), a mist that creeps outwards along the ground, and crystals of
 * ice that glitter in the air. A mass follows the messages of its player; let go, it stays where it was and fades as
 * its air comes back to the air of the map, by the rule of the server. Drawn in code, in one layer above everything,
 * under the switch of the downpours (a weather laid by hand, as they are); nothing is drawn nor computed while no
 * cold air lies on the map. What freezes (the ice, the snow that holds, the soil) is the server's: it comes with the
 * meadow, not from here.
 */
export class ColdView {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private readonly shown = new Map<number, Shown>();
    private lastUpdate: number | undefined;

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly reducedMotion: () => boolean,
        /** The temperature of the air of the map (°C), which a mass let go comes back to; undefined while not known. */
        private readonly mapCelsius: () => number | undefined,
        /** How many times faster than the clock the time of the map goes (the speed of its water). */
        private readonly times: () => number,
        /** How much lower the ground or the water under a point is drawn (the relief seen in 3/4). */
        private readonly dropAt: (x: number, y: number) => number = () => 0,
    ) {
        this.graphics = scene.add.graphics().setDepth(DEPTH_NIGHT_INDEX + 2);
    }

    /** `receivedAt` in ms of the game: the mass is held `message.impactInMs` more. */
    public report(message: CatastropheMessage, receivedAt: number): void {
        const known = this.shown.get(message.id);
        const told = tellCold(known, message, receivedAt);
        this.shown.set(message.id, { ...told, drawnX: known?.drawnX ?? told.x, drawnY: known?.drawnY ?? told.y });
    }

    public update(now: number): void {
        if (this.shown.size === 0) {
            this.lastUpdate = undefined;
            return;
        }
        const visible = isEffectShown("downpour");
        if (this.graphics.visible !== visible) this.graphics.setVisible(visible);
        const elapsed = this.lastUpdate === undefined ? 0 : Math.max(0, now - this.lastUpdate);
        this.lastUpdate = now;
        const follow = Math.min(1, elapsed * FOLLOW_PER_MS);
        const air = this.mapCelsius();
        const times = this.times();
        const reduced = this.reducedMotion();
        this.graphics.clear();
        for (const [id, cold] of this.shown) {
            const temperature = coldAt(cold, now, air, times);
            if (temperature === undefined) {
                this.shown.delete(id);
                continue;
            }
            cold.drawnX += (cold.x - cold.drawnX) * follow;
            cold.drawnY += (cold.y - cold.drawnY) * follow;
            // Held under an air that is not known, it is seen as against a mild air.
            const strength = coldStrength(temperature, air ?? 10);
            if (!visible || strength <= 0) continue;
            drawLower([this.graphics], Math.round(this.dropAt(cold.drawnX, cold.drawnY)), () =>
                this.draw(cold, now - cold.beganAt, strength, reduced),
            );
        }
        this.scene.markDirty();
    }

    private draw(cold: Shown, elapsed: number, strength: number, reduced: boolean): void {
        const graphics = this.graphics;
        const radius = cold.radiusTiles * TILE_PX;
        const { drawnX: x, drawnY: y } = cold;
        // The frost gains the ground from the core of a mass that just came.
        const gained = reduced ? 1 : Math.min(1, 0.35 + (0.65 * Math.max(0, elapsed)) / FROST_GAINS_MS);
        for (const ring of coldFrostRings()) {
            if (ring.alpha <= 0) continue;
            graphics.fillStyle(FROST_COLOR, FROST_ALPHA * strength * ring.alpha);
            graphics.fillCircle(x, y, ring.radius * radius * gained);
        }
        const wisps = Math.min(MOST_WISPS, Math.max(FEWEST, cold.radiusTiles * WISPS_PER_TILE));
        for (const wisp of coldMist(elapsed, wisps, reduced)) {
            const alpha = MIST_ALPHA * strength * wisp.alpha;
            if (alpha <= 0.004) continue;
            const wide = wisp.size * radius * 2;
            const wispX = x + wisp.x * radius;
            const wispY = y + wisp.y * radius;
            graphics.fillStyle(MIST_COLOR, alpha);
            graphics.fillEllipse(wispX, wispY, wide, wide * 0.5);
            graphics.fillStyle(MIST_LIGHT, alpha * 0.8);
            graphics.fillEllipse(wispX, wispY - wide * 0.04, wide * 0.6, wide * 0.26);
        }
        const sparkles = Math.min(MOST_SPARKLES, Math.max(FEWEST, cold.radiusTiles * SPARKLES_PER_TILE));
        for (const sparkle of coldSparkles(elapsed, sparkles, reduced)) {
            const alpha = strength * sparkle.alpha;
            if (alpha <= 0.05) continue;
            const sparkX = Math.round(x + sparkle.x * radius * gained);
            // In the air over the ground: a little higher than where it would lie.
            const sparkY = Math.round(y + sparkle.y * radius * gained - 6);
            const arm = 1 + 2 * sparkle.alpha;
            graphics.lineStyle(1, SPARKLE_COLOR, alpha);
            graphics.lineBetween(sparkX - arm, sparkY, sparkX + arm, sparkY);
            graphics.lineBetween(sparkX, sparkY - arm, sparkX, sparkY + arm);
        }
    }

    public destroy(): void {
        this.shown.clear();
        this.graphics.destroy();
    }
}
