import * as Phaser from "phaser";
import type { LampZone } from "./LampJam";

interface ZoneLight {
    container: Phaser.GameObjects.Container;
    mask: Phaser.GameObjects.Rectangle;
}

/**
 * One container per listening zone, in which the lamps of that zone draw their light. A mask the size of the zone cuts
 * what spills over its edges, so that the light of a room stays in the room instead of washing over the walls and the
 * room next door. The container is drawn additively, like the light itself.
 *
 * Masks are filters, which only the WebGL renderer has: with another one, nothing clips the light (the rest works).
 */
export class LampZoneLights {
    private readonly lights = new Map<string, ZoneLight>();

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly depth: number,
    ) {}

    private canClip(): boolean {
        return this.scene.game.renderer?.type === Phaser.WEBGL;
    }

    /** The container the lamps of a zone draw in; undefined when the renderer cannot clip. */
    public containerFor(zone: LampZone): Phaser.GameObjects.Container | undefined {
        if (!this.canClip()) {
            return undefined;
        }
        let light = this.lights.get(zone.areaId);
        if (!light) {
            // The mask is not shown: only its shape matters, it is drawn into the mask texture.
            const mask = this.scene.add.rectangle(0, 0, 1, 1, 0xffffff).setVisible(false);
            const container = this.scene.add.container(0, 0).setDepth(this.depth).setBlendMode(Phaser.BlendModes.ADD);
            container.enableFilters();
            container.filters?.external.addMask(mask, false, this.scene.cameras.main, "world");
            light = { container, mask };
            this.lights.set(zone.areaId, light);
        }
        this.fit(light, zone);
        return light.container;
    }

    private fit(light: ZoneLight, zone: LampZone): void {
        light.mask.setPosition(zone.x + zone.width / 2, zone.y + zone.height / 2).setSize(zone.width, zone.height);
    }

    /** Keeps the zones in use at the size of their zone (it may be resized in the editor), lets go of the others. */
    public sync(used: ReadonlyMap<string, LampZone>): void {
        for (const [areaId, light] of this.lights) {
            const zone = used.get(areaId);
            if (zone) {
                this.fit(light, zone);
            } else {
                light.container.destroy();
                light.mask.destroy();
                this.lights.delete(areaId);
            }
        }
    }

    public destroy(): void {
        this.sync(new Map());
    }
}
