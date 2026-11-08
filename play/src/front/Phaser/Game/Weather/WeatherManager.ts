import { WeatherType } from "@workadventure/map-editor";
import { get } from "svelte/store";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import { groundModeStore, weatherEffectsEnabledStore } from "../../../Stores/WeatherStore";
import { DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import type { GameScene } from "../GameScene";
import { stormGlow, weatherParticles, weatherAtTime } from "./WeatherFrame";
import { SnowGround } from "./SnowGround";
import { WeatherSounds } from "./WeatherSounds";

export class WeatherManager {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private lastFrameAt = -Infinity;
    private visible = false;
    private readonly sounds: WeatherSounds;
    private readonly snowGround: SnowGround;

    constructor(private readonly scene: GameScene) {
        this.sounds = new WeatherSounds(scene.sound);
        this.snowGround = new SnowGround(scene);
        this.graphics = scene.add
            .graphics()
            .setDepth(DEPTH_NIGHT_INDEX + 1)
            .setVisible(false);
    }

    public update(now: number, serverDate: Date | undefined, night = false): void {
        const settings = this.scene.getGameMap().getWamFile()?.getWam().settings;
        const configured = settings?.weather ?? WeatherType.Clear;
        const weather = weatherAtTime(configured, serverDate);
        this.sounds.update(weather, serverDate, get(mapEditorModeStore), night);
        const enabled = get(weatherEffectsEnabledStore) && !get(mapEditorModeStore);
        this.snowGround.update(
            now,
            serverDate,
            enabled ? configured : WeatherType.Clear,
            !get(mapEditorModeStore),
            get(groundModeStore),
            settings?.weatherStartedAt,
        );
        if (!enabled || weather === WeatherType.Clear) {
            if (this.visible) {
                this.graphics.clear().setVisible(false);
                this.visible = false;
                this.scene.markDirty();
            }
            this.lastFrameAt = -Infinity;
            return;
        }
        // Keep weather light on the CPU, including when the avatar is idle.
        if (now - this.lastFrameAt < 1000 / 30) return;
        this.lastFrameAt = now;
        this.visible = true;
        const view = this.scene.cameras.main.worldView;
        const epoch = serverDate?.getTime() ?? now;
        this.graphics.clear().setVisible(true);
        if (weather !== WeatherType.Snow) {
            this.graphics.fillStyle(0x27344b, weather === WeatherType.Storm ? 0.12 : 0.05);
            this.graphics.fillRect(view.x, view.y, view.width, view.height);
        }
        if (weather === WeatherType.Snow) {
            this.graphics.fillStyle(0xf2f5ff, 0.8);
        } else {
            this.graphics.lineStyle(1, 0xa8c9e5, 0.65);
            this.graphics.beginPath();
        }
        for (const particle of weatherParticles(weather, epoch, view)) {
            if (weather === WeatherType.Snow) {
                this.graphics.fillRect(Math.round(particle.x), Math.round(particle.y), 2, 2);
            } else {
                this.graphics.moveTo(particle.x, particle.y);
                this.graphics.lineTo(particle.x - particle.length / 3, particle.y + particle.length);
            }
        }
        if (weather !== WeatherType.Snow) this.graphics.strokePath();
        if (weather === WeatherType.Storm && serverDate) {
            this.graphics.fillStyle(0xe3eaff, stormGlow(epoch));
            this.graphics.fillRect(view.x, view.y, view.width, view.height);
        }
        this.scene.markDirty();
    }

    public destroy(): void {
        this.sounds.destroy();
        this.snowGround.destroy();
        this.graphics.destroy();
    }
}
