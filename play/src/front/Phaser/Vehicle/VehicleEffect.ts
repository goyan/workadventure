import type * as Phaser from "phaser";
import type { PositionMessage_Direction } from "@workadventure/messages";
import type { VehicleColors } from "./Vehicle";
import { readVehicleColors, Vehicle } from "./Vehicle";
import { vehicleArtwork, type VehicleArtwork } from "./VehicleAssets";
import {
    AIRPLANE_SOURCE_TEXTURE,
    AIRPLANE_ROWS,
    airplaneFrame,
    airplaneFrontFrame,
    airplaneShadowFrame,
    airplaneCockpit,
    airplaneTexture,
    airplaneWingTips,
    AIRPLANE_FRAME_SIZE,
    airplaneLightsOn,
    createAirplaneSheet,
} from "./AirplaneArtwork";
import {
    VEHICLE_DIRECTIONS,
    VEHICLE_FRAME_SIZE,
    VEHICLE_FEET_Y,
    cardinalVehicleHeading,
    vehicleHeading,
    turnVehicleTowards,
} from "./VehicleFrames";

export class VehicleEffect {
    private readonly sprites: Phaser.GameObjects.Sprite[];
    private lastTime: number | undefined;
    private lastPosition: { x: number; y: number } | undefined;
    private heading: number | undefined;
    private targetHeading = 0;
    private readonly artwork: VehicleArtwork;
    /** Airplane only: the front of the cockpit, over the pilot's head, and the shadow on the ground. */
    private readonly front: Phaser.GameObjects.Sprite | undefined;
    private readonly shadow: Phaser.GameObjects.Sprite | undefined;
    private shadowShown = false;
    /** Airplane only: navigation lights on the wing tips, red to the pilot's left, green to the right. */
    private readonly lights: Phaser.GameObjects.Rectangle[] = [];

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly container: Phaser.GameObjects.Container,
        public readonly vehicle: Exclude<Vehicle, Vehicle.None>,
    ) {
        this.artwork = vehicleArtwork(vehicle);
        this.sprites = this.artwork.layers.map((part, index) => {
            const key =
                vehicle === Vehicle.Airplane
                    ? this.airplaneKey(readVehicleColors(null, Vehicle.Airplane))
                    : `${this.artwork.texture}-${part}`;
            if (!scene.textures.exists(key)) {
                addSheet(scene, key, this.artwork.createSheet(readVehicleColors(null), part), 4, VEHICLE_FRAME_SIZE);
            }
            const sprite = scene.add.sprite(0, VEHICLE_FEET_Y, key).setVisible(false);
            container.addAt(sprite, index);
            return sprite;
        });
        if (vehicle === Vehicle.Airplane) {
            const key = this.sprites[0]?.texture.key ?? this.airplaneKey(readVehicleColors(null, Vehicle.Airplane));
            this.front = scene.add.sprite(0, VEHICLE_FEET_Y, key).setVisible(false);
            container.add(this.front);
            for (const colour of [0xff3b30, 0x34e36b]) {
                const light = scene.add.rectangle(0, 0, 2, 2, colour).setVisible(false);
                container.add(light);
                this.lights.push(light);
            }
            this.shadow = scene.add.sprite(container.x, container.y, key).setVisible(false);
            // After the physics moved the avatar: placed during the update, the shadow would trail it by a frame.
            this.scene.events.on("postupdate", this.placeShadow);
        }
    }

    public update(
        active: boolean,
        direction: PositionMessage_Direction,
        colors: VehicleColors,
        moving: boolean,
        time: number,
        motion?: { x: number; y: number },
        flight?: { lift: number; altitude: number; groundDepth: number; scale?: number },
    ): void {
        const dx = motion?.x || (this.lastPosition ? this.container.x - this.lastPosition.x : 0);
        const dy = motion?.y || (this.lastPosition ? this.container.y - this.lastPosition.y : 0);
        this.lastPosition = { x: this.container.x, y: this.container.y };
        // How high the plane is drawn (whole pixels), and its altitude from 0 (ground) to 1 (cruise).
        const lift = flight?.lift ?? 0;
        const altitude = flight?.altitude ?? 0;
        // The airplane is drawn bigger as it climbs, around its centre (0, VEHICLE_FEET_Y - lift).
        const scale = flight?.scale ?? 1;
        this.shadowShown = active && lift > 0;
        // Higher, the shadow is smaller and paler.
        this.shadow
            ?.setDepth(flight?.groundDepth ?? this.container.y)
            .setScale(1 - 0.25 * altitude)
            .setAlpha(0.45 - 0.2 * altitude)
            .setVisible(this.shadowShown);
        const delta = this.lastTime === undefined ? 0 : Math.min(100, Math.max(0, time - this.lastTime));
        this.lastTime = time;
        if (!active) {
            this.heading = undefined;
            for (const sprite of this.sprites) sprite.setVisible(false);
            this.front?.setVisible(false);
            for (const light of this.lights) light.setVisible(false);
            return;
        }
        if (this.heading === undefined) this.heading = this.targetHeading = cardinalVehicleHeading(direction);
        if (moving && (dx || dy)) this.targetHeading = vehicleHeading(dx, dy);
        this.heading = turnVehicleTowards(this.heading, this.targetHeading, delta);
        // A unicycle is drawn for each of the eight headings (its diagonals already turned 45°): the in-between
        // turn of a board would tilt its side view.
        const upright = this.vehicle === Vehicle.ElectricUnicycle || this.vehicle === Vehicle.Airplane;
        const heading = Math.round(this.heading) % VEHICLE_DIRECTIONS;
        const frame =
            this.vehicle === Vehicle.Airplane
                ? airplaneFrame(this.heading, time, lift > 0 || moving)
                : heading + (moving ? (Math.floor(time / 70) % 4) * VEHICLE_DIRECTIONS : 0);
        if (this.vehicle === Vehicle.Airplane) {
            // The airplane is painted in its colours (a texture per set), the other vehicles are tinted.
            const key = this.airplaneKey(colors);
            for (const sprite of [...this.sprites, this.front, this.shadow]) {
                if (sprite && sprite.texture.key !== key) sprite.setTexture(key);
            }
        }
        this.shadow?.setFrame(airplaneShadowFrame(this.heading));
        if (this.front) {
            // Over the pilot's head, whatever the avatar added to the container since.
            this.container.bringToTop(this.front);
            this.front
                .setY(VEHICLE_FEET_Y - lift)
                .setScale(scale)
                .setFrame(airplaneFrontFrame(this.heading))
                .setVisible(true);
            const tips = airplaneWingTips(this.heading);
            const flashing = lift > 0 && airplaneLightsOn(time);
            for (const [index, tip] of [tips.left, tips.right].entries()) {
                const light = this.lights[index];
                if (!light) continue;
                this.container.bringToTop(light);
                // Frame pixels to the container: the 64 px frame is centred on (0, VEHICLE_FEET_Y - lift).
                light
                    .setPosition(
                        (tip.x - AIRPLANE_FRAME_SIZE / 2 + 0.5) * scale,
                        VEHICLE_FEET_Y - lift + (tip.y - AIRPLANE_FRAME_SIZE / 2 + 0.5) * scale,
                    )
                    .setScale(scale)
                    .setVisible(flashing);
            }
        }
        for (const [index, sprite] of this.sprites.entries()) {
            if (this.vehicle === Vehicle.Airplane) sprite.setScale(scale);
            sprite
                .setY(VEHICLE_FEET_Y - lift)
                .setFrame(frame)
                .setAngle(upright ? 0 : (this.heading - Math.round(this.heading)) * 45)
                .setVisible(true);
            const part = this.artwork.layers[index];
            if (part !== "outline" && part !== "details" && this.vehicle !== Vehicle.Airplane)
                sprite.setTint(parseInt(colors[part].slice(1), 16));
        }
    }

    public getPilotAnchor(): { x: number; y: number } {
        // In the 64 px frame of the other vehicles (same centre as the airplane's 80 px cell).
        const cockpit = airplaneCockpit(this.heading ?? 0);
        const margin = (AIRPLANE_FRAME_SIZE - VEHICLE_FRAME_SIZE) / 2;
        return { x: cockpit.x - margin, y: cockpit.y - margin };
    }

    /** The texture of the airplane in these colours, painted on first use from the loaded sheet. */
    private airplaneKey(colors: VehicleColors): string {
        const key = airplaneTexture(colors);
        if (!this.scene.textures.exists(key)) {
            const loaded = this.scene.textures.get(AIRPLANE_SOURCE_TEXTURE).getSourceImage();
            const source =
                loaded instanceof HTMLImageElement || loaded instanceof HTMLCanvasElement ? loaded : undefined;
            addSheet(
                this.scene,
                key,
                createAirplaneSheet(colors, undefined, source),
                AIRPLANE_ROWS,
                AIRPLANE_FRAME_SIZE,
            );
        }
        return key;
    }

    private readonly placeShadow = (): void => {
        if (!this.shadowShown || !this.shadow) return;
        this.shadow.setPosition(Math.round(this.container.x), Math.round(this.container.y + VEHICLE_FEET_Y));
    };

    public destroy(): void {
        this.scene.events.off("postupdate", this.placeShadow);
        this.front?.destroy();
        for (const light of this.lights) light.destroy();
        this.shadow?.destroy();
        for (const sprite of this.sprites) sprite.destroy();
    }
}

/** A sheet of eight headings per row, cut in square frames numbered row by row. */
function addSheet(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement, rows: number, size: number): void {
    const texture = scene.textures.addCanvas(key, canvas);
    for (let frame = 0; frame < VEHICLE_DIRECTIONS * rows; frame++)
        texture?.add(
            frame,
            0,
            (frame % VEHICLE_DIRECTIONS) * size,
            Math.floor(frame / VEHICLE_DIRECTIONS) * size,
            size,
            size,
        );
}
