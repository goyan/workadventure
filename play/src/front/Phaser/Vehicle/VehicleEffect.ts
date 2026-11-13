import type * as Phaser from "phaser";
import type { PositionMessage_Direction } from "@workadventure/messages";
import type { VehicleColors } from "./Vehicle";
import { readVehicleColors, Vehicle } from "./Vehicle";
import { vehicleArtwork, type VehicleArtwork } from "./VehicleAssets";
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

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly container: Phaser.GameObjects.Container,
        public readonly vehicle: Exclude<Vehicle, Vehicle.None>,
    ) {
        this.artwork = vehicleArtwork(vehicle);
        this.sprites = this.artwork.layers.map((part, index) => {
            const key = `${this.artwork.texture}-${part}`;
            if (!scene.textures.exists(key)) {
                const texture = scene.textures.addCanvas(key, this.artwork.createSheet(readVehicleColors(null), part));
                for (let frame = 0; frame < 32; frame++)
                    texture?.add(
                        frame,
                        0,
                        (frame % VEHICLE_DIRECTIONS) * VEHICLE_FRAME_SIZE,
                        Math.floor(frame / VEHICLE_DIRECTIONS) * VEHICLE_FRAME_SIZE,
                        VEHICLE_FRAME_SIZE,
                        VEHICLE_FRAME_SIZE,
                    );
            }
            const sprite = scene.add.sprite(0, VEHICLE_FEET_Y, key).setVisible(false);
            container.addAt(sprite, index);
            return sprite;
        });
    }

    public update(
        active: boolean,
        direction: PositionMessage_Direction,
        colors: VehicleColors,
        moving: boolean,
        time: number,
        motion?: { x: number; y: number },
    ): void {
        const dx = motion?.x || (this.lastPosition ? this.container.x - this.lastPosition.x : 0);
        const dy = motion?.y || (this.lastPosition ? this.container.y - this.lastPosition.y : 0);
        this.lastPosition = { x: this.container.x, y: this.container.y };
        const delta = this.lastTime === undefined ? 0 : Math.min(100, Math.max(0, time - this.lastTime));
        this.lastTime = time;
        if (!active) {
            this.heading = undefined;
            for (const sprite of this.sprites) sprite.setVisible(false);
            return;
        }
        if (this.heading === undefined) this.heading = this.targetHeading = cardinalVehicleHeading(direction);
        if (moving && (dx || dy)) this.targetHeading = vehicleHeading(dx, dy);
        this.heading = turnVehicleTowards(this.heading, this.targetHeading, delta);
        // A unicycle is drawn for each of the eight headings (its diagonals already turned 45°): the in-between
        // turn of a board would tilt its side view.
        const upright = this.vehicle === Vehicle.ElectricUnicycle;
        const heading = Math.round(this.heading) % VEHICLE_DIRECTIONS;
        const frame = heading + (moving ? (Math.floor(time / 70) % 4) * VEHICLE_DIRECTIONS : 0);
        for (const [index, sprite] of this.sprites.entries()) {
            sprite
                .setFrame(frame)
                .setAngle(upright ? 0 : (this.heading - Math.round(this.heading)) * 45)
                .setVisible(true);
            const part = this.artwork.layers[index];
            if (part !== "outline" && part !== "details") sprite.setTint(parseInt(colors[part].slice(1), 16));
        }
    }

    public destroy(): void {
        for (const sprite of this.sprites) sprite.destroy();
    }
}
