import * as Phaser from "phaser";
import type { LampZone } from "./LampJam";
import { LAMP_SOFT_EDGE_PX, LAMP_SOFT_RECT_TEXTURE } from "./LampTextures";

interface ZoneLight {
    container: Phaser.GameObjects.Container;
}

/** A room while its lamps play: its own light is put out, and a colour washes over it on the beat. */
export interface RoomAmbience {
    zone: LampZone;
    /** How dark the room is made, from 0 (as the map draws it) to 1 (the darkest a party gets). */
    darkness: number;
    wash: { colour: number; alpha: number };
}

interface RoomLayers {
    shade: Phaser.GameObjects.NineSlice;
    wash: Phaser.GameObjects.NineSlice;
}

/** The room never goes fully black: players and furniture stay readable under the lights. */
const MAX_DARKNESS = 0.78;

/**
 * One container per listening zone, in which the lamps of that zone draw their light, and the darkness and colour of
 * the rooms whose lamps play.
 *
 * Nothing is clipped with a mask: a Phaser mask is a filter that draws the zone into a texture and composites it back
 * without additive blending, so a faint light (the far end of a beam, a fading flash) darkened the floor in the shape
 * of its image: the square shadows. Each lamp keeps its light inside its zone itself instead (see LampPlacement.bounds).
 */
export class LampZoneLights {
    private readonly lights = new Map<string, ZoneLight>();
    private readonly rooms = new Map<string, RoomLayers>();

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly depth: number,
        /** Where the room is darkened: over the floor, under the players and the furniture, which stay visible. */
        private readonly shadeDepth: number,
    ) {}

    /** The container the lamps of a zone draw in. */
    public containerFor(zone: LampZone): Phaser.GameObjects.Container {
        let light = this.lights.get(zone.areaId);
        if (!light) {
            light = { container: this.scene.add.container(0, 0).setDepth(this.depth) };
            this.lights.set(zone.areaId, light);
        }
        return light.container;
    }

    /** Lets go of the zones no lamp uses any more. */
    public sync(used: ReadonlyMap<string, LampZone>): void {
        for (const [areaId, light] of this.lights) {
            if (!used.has(areaId)) {
                light.container.destroy();
                this.lights.delete(areaId);
            }
        }
    }

    /** Darkens and colours the rooms whose lamps play; a room left out gets its own light back. */
    public setAmbience(ambiences: readonly RoomAmbience[]): void {
        const kept = new Set<string>();
        for (const { zone, darkness, wash } of ambiences) {
            kept.add(zone.areaId);
            let room = this.rooms.get(zone.areaId);
            if (!room) {
                room = {
                    shade: this.softRect().setTint(0x000000).setDepth(this.shadeDepth),
                    wash: this.softRect().setBlendMode(Phaser.BlendModes.ADD).setDepth(this.depth),
                };
                this.rooms.set(zone.areaId, room);
            }
            fit(room.shade, zone);
            fit(room.wash, zone);
            room.shade.setAlpha(Math.min(1, Math.max(0, darkness)) * MAX_DARKNESS);
            room.wash.setTint(wash.colour).setAlpha(Math.min(1, Math.max(0, wash.alpha)));
        }
        for (const [areaId, room] of this.rooms) {
            if (!kept.has(areaId)) {
                room.shade.destroy();
                room.wash.destroy();
                this.rooms.delete(areaId);
            }
        }
    }

    public destroy(): void {
        this.sync(new Map());
        this.setAmbience([]);
    }

    private softRect(): Phaser.GameObjects.NineSlice {
        const edge = LAMP_SOFT_EDGE_PX;
        return this.scene.add.nineslice(0, 0, LAMP_SOFT_RECT_TEXTURE, undefined, 1, 1, edge, edge, edge, edge);
    }
}

function fit(rect: Phaser.GameObjects.NineSlice, zone: LampZone): void {
    // A nine-slice cannot be smaller than its two edges: a tiny zone keeps a soft blob instead of a hard square.
    const minimum = LAMP_SOFT_EDGE_PX * 2;
    rect.setPosition(zone.x + zone.width / 2, zone.y + zone.height / 2).setSize(
        Math.max(minimum, zone.width),
        Math.max(minimum, zone.height),
    );
}
