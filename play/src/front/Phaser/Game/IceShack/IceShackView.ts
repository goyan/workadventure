import * as Phaser from "phaser";
import { DEPTH_LAMP_LIGHT_INDEX, DEPTH_OVERLAY_INDEX } from "../DepthIndexes";
import { ensureLampTextures, LAMP_DISC_TEXTURE } from "../Lamps/LampTextures";
import { FLOOR, GLOW, puffPixels, shackLayers, smokePuffs } from "./IceShackShapes";
import type { PixelRect, ShackLook } from "./IceShackShapes";

/** The smoke goes over the avatars around the shack, under the roofs of the map and the night. */
const SMOKE_DEPTH = DEPTH_OVERLAY_INDEX - 2;
/** How warm the glow of a lit shack is at night, added over its light. */
const GLOW_TINT = 0xffa040;
const GLOW_ALPHA = 0.3;

/** A shack as it is to be drawn now. */
export interface ShackShown {
    id: number;
    /** The centre of its hole, map pixels. */
    x: number;
    y: number;
    look: ShackLook;
    /** Its stove pipe smokes: somebody sits in it. */
    smoking: boolean;
    /**
     * How much lower it is drawn with the relief seen in 3/4: the drop of the surface of the water under its hole (it
     * stands on the ice), as the float of a line (GameScene.surfaceDropAt). Only the drawing moves, not its depth.
     */
    drop: number;
}

interface ShackObjects {
    ground: Phaser.GameObjects.Graphics;
    back: Phaser.GameObjects.Graphics;
    front: Phaser.GameObjects.Graphics;
    smoke: Phaser.GameObjects.Graphics;
    glow: Phaser.GameObjects.Image;
    /** What was drawn, to draw again only what changed. */
    drawn: string;
}

function fill(graphics: Phaser.GameObjects.Graphics, rects: readonly PixelRect[]): void {
    graphics.clear();
    for (const piece of rects) {
        graphics.fillStyle(piece.color, piece.alpha ?? 1);
        graphics.fillRect(piece.x, piece.y, piece.w, piece.h);
    }
}

/**
 * The ice fishing shacks of the room on the map: each in three layers sorted with the avatars by their feet (its
 * floor and hole under them, its walls behind who sits in it, the posts of its open front before them), its smoke
 * carried by the wind of the air of the map, the warm glow of its lantern and stove at night (IceShackShapes).
 */
export class IceShackView {
    private readonly shacks = new Map<number, ShackObjects>();

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly reducedMotion: boolean,
    ) {
        ensureLampTextures(scene);
    }

    /**
     * Draws the shacks at `timeMs`; `wind` carries the smoke (map pixels a second, see groundWind), `night` lights
     * the glow of the shacks somebody sits in.
     */
    public update(shown: readonly ShackShown[], timeMs: number, wind: { x: number; y: number }, night: boolean): void {
        const seen = new Set<number>();
        for (const shack of shown) {
            seen.add(shack.id);
            const objects = this.shacks.get(shack.id) ?? this.create(shack);
            const y = shack.y + shack.drop;
            for (const layer of [objects.ground, objects.back, objects.front, objects.smoke]) layer.setY(y);
            objects.glow.setY(y + GLOW.y);
            // The look changes seldom (a phase, a crack, a night): drawn again only then; the auger turns.
            const key = JSON.stringify(shack.look);
            if (key !== objects.drawn) {
                const layers = shackLayers(shack.look);
                fill(objects.ground, layers.ground);
                fill(objects.back, layers.back);
                fill(objects.front, layers.front);
                objects.drawn = key;
            }
            if (shack.smoking) {
                const puffs: PixelRect[] = [];
                for (const puff of smokePuffs(timeMs, wind, this.reducedMotion)) puffs.push(...puffPixels(puff));
                fill(objects.smoke, puffs);
                objects.smoke.setVisible(true);
            } else {
                objects.smoke.setVisible(false);
            }
            objects.glow.setVisible(night && shack.look.occupied && shack.look.raised >= 1);
        }
        for (const [id, objects] of this.shacks) {
            if (seen.has(id)) continue;
            this.destroyObjects(objects);
            this.shacks.delete(id);
        }
    }

    public destroy(): void {
        for (const objects of this.shacks.values()) this.destroyObjects(objects);
        this.shacks.clear();
    }

    private create(shack: ShackShown): ShackObjects {
        const at = (depth: number): Phaser.GameObjects.Graphics =>
            this.scene.add.graphics().setPosition(shack.x, shack.y).setDepth(depth);
        const objects: ShackObjects = {
            // Under whoever stands on its floor, over the ice.
            ground: at(shack.y + FLOOR.top - 1),
            // Its walls are behind who sits on its stool, before who passes behind it.
            back: at(shack.y + FLOOR.top),
            // Its open front is before who sits in it.
            front: at(shack.y + FLOOR.bottom),
            smoke: at(SMOKE_DEPTH),
            glow: this.scene.add
                .image(shack.x + GLOW.x, shack.y + GLOW.y, LAMP_DISC_TEXTURE)
                .setDisplaySize(GLOW.radius * 2, GLOW.radius * 2)
                .setTint(GLOW_TINT)
                .setAlpha(GLOW_ALPHA)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setDepth(DEPTH_LAMP_LIGHT_INDEX)
                .setVisible(false),
            drawn: "",
        };
        this.shacks.set(shack.id, objects);
        return objects;
    }

    private destroyObjects(objects: ShackObjects): void {
        objects.ground.destroy();
        objects.back.destroy();
        objects.front.destroy();
        objects.smoke.destroy();
        objects.glow.destroy();
    }
}
