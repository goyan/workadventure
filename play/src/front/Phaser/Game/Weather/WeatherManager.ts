import { WeatherType } from "@workadventure/map-editor";
import { get } from "svelte/store";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import { weatherEffectsEnabledStore } from "../../../Stores/WeatherStore";
import { DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import type { GameScene } from "../GameScene";
import type { OutdoorGrid } from "../Outdoor/OutdoorGrid";
import { SeasonalTheme } from "../Seasonal/SeasonalTheme";
import { effectiveWeather, keepOutdoorParticles, stormGlow, weatherParticles, weatherAtTime } from "./WeatherFrame";
import { SnowGround } from "./SnowGround";
import { WeatherSounds } from "./WeatherSounds";

export interface WeatherManagerOptions {
    /** Outdoor cells of the map: weather is only drawn there. Without a grid, it covers the whole view. */
    outdoorGrid?: () => OutdoorGrid | undefined;
    /** The personal seasonal theme: Christmas shows snow instead of the map weather, autumn colours the grass. */
    seasonalTheme?: () => SeasonalTheme | undefined;
}

export class WeatherManager {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private lastFrameAt = -Infinity;
    private visible = false;
    private readonly sounds: WeatherSounds;
    private readonly snowGround: SnowGround;

    constructor(
        private readonly scene: GameScene,
        private readonly options: WeatherManagerOptions = {},
    ) {
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
        const theme = this.options.seasonalTheme?.();
        const weather = effectiveWeather(weatherAtTime(configured, serverDate), theme);
        this.sounds.update(weather, serverDate, get(mapEditorModeStore), night);
        const enabled = get(weatherEffectsEnabledStore) && !get(mapEditorModeStore);
        this.snowGround.update(
            now,
            serverDate,
            enabled ? configured : WeatherType.Clear,
            // The Christmas theme draws its own snow ground over the whole outside: the seasonal ground steps aside.
            !get(mapEditorModeStore) && theme !== SeasonalTheme.Christmas,
            theme === SeasonalTheme.Autumn,
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
        const grid = this.options.outdoorGrid?.();
        // Veils cover the outdoor runs of the view only, so rooms stay as they are.
        const veil = grid ? grid.outdoorRunsInView(view) : [view];
        const epoch = serverDate?.getTime() ?? now;
        this.graphics.clear().setVisible(true);
        if (weather !== WeatherType.Snow) {
            this.graphics.fillStyle(0x27344b, weather === WeatherType.Storm ? 0.12 : 0.05);
            for (const rect of veil) this.graphics.fillRect(rect.x, rect.y, rect.width, rect.height);
        }
        if (weather === WeatherType.Snow) {
            this.graphics.fillStyle(0xf2f5ff, 0.8);
        } else {
            this.graphics.lineStyle(1, 0xa8c9e5, 0.65);
            this.graphics.beginPath();
        }
        const isOutdoor = grid ? (x: number, y: number): boolean => grid.isOutdoorAt(x, y) : undefined;
        for (const particle of keepOutdoorParticles(weatherParticles(weather, epoch, view), isOutdoor)) {
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
            for (const rect of veil) this.graphics.fillRect(rect.x, rect.y, rect.width, rect.height);
        }
        this.scene.markDirty();
    }

    public destroy(): void {
        this.sounds.destroy();
        this.snowGround.destroy();
        this.graphics.destroy();
    }
}
