import type * as Phaser from "phaser";
import { HURRICANE_GUST_FACTOR, hurricaneHere } from "@workadventure/map-editor";
import { roomHurricaneAir, windOfAir } from "../Weather/HurricaneAir";
import type { Hurricane } from "@workadventure/map-editor";
import { DEPTH_OVERLAY_INDEX } from "../DepthIndexes";
import { DEBRIS_MAX, DEBRIS_MIN_GUST_KMH, DebrisField } from "./DebrisField";
import type { DebrisWind } from "./DebrisField";

/** The bits, drawn once: a dark leaf, a twig, a chip of something torn off (width, height, colour). */
const KINDS: readonly { width: number; height: number; color: string }[] = [
    { width: 3, height: 2, color: "#2f3a1c" },
    { width: 6, height: 1, color: "#3b2a1a" },
    { width: 2, height: 2, color: "#262626" },
];
const TEXTURE = "hurricane-debris";
/** Over every object of the map, under the night (which darkens them) and the clouds of the storm. */
const DEBRIS_DEPTH = DEPTH_OVERLAY_INDEX - 10;
/** The bits drawn a little larger than their pixels: they are seen at a glance. */
const DEBRIS_SCALE = 1.5;

/**
 * The debris a hurricane tears off, carried round its eye (DebrisField): over the view only, a pool of at most
 * DEBRIS_MAX small images. A wind of the map strong enough (set by hand) tears some off too, in a straight line.
 * Nothing while neither blows hard enough, nor while the weather effects are off (Basique included).
 */
export class HurricaneDebris {
    private readonly field = new DebrisField(Math.random, KINDS.length);
    private readonly images: Phaser.GameObjects.Image[] = [];
    private hurricane: Hurricane | undefined;

    constructor(private readonly scene: Phaser.Scene & { markDirty(): void }) {
        if (!scene.textures.exists(TEXTURE)) {
            const width = KINDS.reduce((sum, kind) => sum + kind.width + 1, 0);
            const canvas = scene.textures.createCanvas(TEXTURE, width, 2);
            const context = canvas?.getContext();
            if (canvas && context) {
                let x = 0;
                KINDS.forEach((kind, index) => {
                    context.fillStyle = kind.color;
                    context.fillRect(x, 0, kind.width, kind.height);
                    canvas.add(index, 0, x, 0, kind.width, kind.height);
                    x += kind.width + 1;
                });
                canvas.refresh();
            }
        }
    }

    public setHurricane(hurricane: Hurricane | undefined): void {
        this.hurricane = hurricane;
    }

    /**
     * At each image: the bits move `deltaMs` on with the wind where each is, at the time of the server `epoch`;
     * `mapWind` is the wind of the map shown (km/h, where from), for the debris of a wind set by hand.
     */
    public update(
        deltaMs: number,
        epoch: number | undefined,
        mapWind: { speed?: number; from?: number } | undefined,
        shown: boolean,
    ): void {
        const hurricane = this.hurricane;
        const mapGust = (mapWind?.speed ?? 0) * HURRICANE_GUST_FACTOR;
        const windy = hurricane !== undefined || mapGust > DEBRIS_MIN_GUST_KMH;
        if (!shown || epoch === undefined || !windy) {
            if (this.field.bits.length > 0) {
                this.field.clear();
                this.draw();
            }
            return;
        }
        const windAt = (x: number, y: number): DebrisWind | undefined => {
            if (hurricane) {
                const here = hurricaneHere(hurricane, epoch, x, y);
                if (!here) return undefined;
                // The wind of its air where the server simulates it (the storm grown in it already).
                const air = roomHurricaneAir.windAt(hurricane.id, x, y);
                if (air) {
                    const wind = windOfAir(air);
                    return {
                        speed: wind.windSpeed,
                        gust: wind.windSpeed * HURRICANE_GUST_FACTOR,
                        from: wind.windFrom,
                        calm: here.phase === "eye",
                    };
                }
                const share = Math.min(1, Math.max(0, here.share));
                return {
                    speed: here.windSpeed * share,
                    gust: here.gust * share,
                    from: here.windFrom,
                    calm: here.phase === "eye",
                };
            }
            return { speed: mapWind?.speed ?? 0, gust: mapGust, from: mapWind?.from ?? 0 };
        };
        this.field.step(deltaMs / 1000, this.scene.cameras.main.worldView, windAt);
        this.draw();
    }

    private draw(): void {
        const bits = this.field.bits;
        while (this.images.length < Math.min(bits.length, DEBRIS_MAX)) {
            this.images.push(
                this.scene.add.image(0, 0, TEXTURE, 0).setDepth(DEBRIS_DEPTH).setScale(DEBRIS_SCALE).setVisible(false),
            );
        }
        let hidden = false;
        this.images.forEach((image, index) => {
            const bit = bits[index];
            if (!bit) {
                if (image.visible) {
                    image.setVisible(false);
                    hidden = true;
                }
                return;
            }
            if (image.frame.name !== String(bit.kind)) image.setFrame(bit.kind);
            image.setPosition(bit.x, bit.y).setRotation(bit.angle).setAlpha(bit.alpha).setVisible(true);
        });
        if (bits.length > 0 || hidden) this.scene.markDirty();
    }

    public destroy(): void {
        for (const image of this.images) image.destroy();
        this.images.length = 0;
        this.field.clear();
    }
}
