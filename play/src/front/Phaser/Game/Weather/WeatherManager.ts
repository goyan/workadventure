import { WeatherType } from "@workadventure/map-editor";
import type { Unsubscriber } from "svelte/store";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import { weatherEffectsEnabledStore } from "../../../Stores/WeatherStore";
import { mapSnowShownStore } from "../../../Stores/SeasonalThemeStore";
import { DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import type { GameScene } from "../GameScene";
import type { OutdoorGrid } from "../Outdoor/OutdoorGrid";
import { SeasonalTheme } from "../Seasonal/SeasonalTheme";
import {
    effectiveWeather,
    fogPatches,
    fogStrength,
    keepOutdoorParticles,
    leafParticles,
    stormGlow,
    weatherParticles,
    weatherAtTime,
} from "./WeatherFrame";
import { SnowGround } from "./SnowGround";
import { WeatherSounds } from "./WeatherSounds";

/** The system asks for less motion: the fog patches stand still. */
const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Fog patches: three concentric rings, from the outside in, as a share of the radius and an alpha. */
const FOG_RINGS = [
    { scale: 1, alpha: 0.05 },
    { scale: 0.75, alpha: 0.035 },
    { scale: 0.5, alpha: 0.02 },
];

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
    // The settings, kept up to date by their stores rather than read at every image.
    private readonly unsubscribers: Unsubscriber[];
    private editing = false;
    private weatherShown = true;
    private mapSnowShown = true;

    constructor(
        private readonly scene: GameScene,
        private readonly options: WeatherManagerOptions = {},
    ) {
        this.sounds = new WeatherSounds(scene.sound);
        this.snowGround = new SnowGround(scene);
        this.unsubscribers = [
            mapEditorModeStore.subscribe((editing) => (this.editing = editing)),
            weatherEffectsEnabledStore.subscribe((shown) => (this.weatherShown = shown)),
            mapSnowShownStore.subscribe((shown) => (this.mapSnowShown = shown)),
        ];
        this.graphics = scene.add
            .graphics()
            .setDepth(DEPTH_NIGHT_INDEX + 1)
            .setVisible(false);
    }

    public update(now: number, serverDate: Date | undefined, night = false): void {
        const settings = this.scene.getGameMap().getWamFile()?.getWam().settings;
        const configured = settings?.weather ?? WeatherType.Clear;
        const theme = this.options.seasonalTheme?.();
        const weather = effectiveWeather(weatherAtTime(configured, serverDate, settings?.weatherAuto), theme);
        this.sounds.update(weather, serverDate, this.editing, night);
        const enabled = this.weatherShown && !this.editing;
        this.snowGround.update(
            now,
            serverDate,
            // A chosen theme keeps the map snow off the ground (see mapSnowShown).
            enabled && this.mapSnowShown ? configured : WeatherType.Clear,
            // The Christmas theme draws its own snow ground over the whole outside: the seasonal ground steps aside.
            !this.editing && theme !== SeasonalTheme.Christmas,
            theme === SeasonalTheme.Autumn,
            settings?.weatherStartedAt,
            settings?.weatherAuto,
        );
        const showWeather = enabled && weather !== WeatherType.Clear;
        // Autumn leaves fall on top of the map weather, even on a clear day, but not while it snows.
        const showLeaves = enabled && theme === SeasonalTheme.Autumn && weather !== WeatherType.Snow;
        if (!showWeather && !showLeaves) {
            if (this.visible) {
                this.graphics.clear().setVisible(false);
                this.visible = false;
                this.scene.markDirty();
            }
            this.lastFrameAt = -Infinity;
            return;
        }
        // Keep weather light on the CPU, including when the avatar is idle: rain and snow 30 times a second, the slow
        // falling leaves and fog 15 times (each drawing makes the whole map drawn again).
        const falling = showWeather && weather !== WeatherType.Fog;
        if (now - this.lastFrameAt < 1000 / (falling ? 30 : 15)) return;
        this.lastFrameAt = now;
        const view = this.scene.cameras.main.worldView;
        const grid = this.options.outdoorGrid?.();
        // Veils cover the outdoor runs of the view only, so rooms stay as they are.
        const veil = grid ? grid.outdoorRunsInView(view) : [view];
        if (veil.length === 0) {
            // Nothing outside on the screen: nothing to draw, and no reason to draw the map again.
            if (this.visible) {
                this.graphics.clear().setVisible(false);
                this.visible = false;
                this.scene.markDirty();
            }
            return;
        }
        this.visible = true;
        const epoch = serverDate?.getTime() ?? now;
        const isOutdoor = grid ? (x: number, y: number): boolean => grid.isOutdoorAt(x, y) : undefined;
        this.graphics.clear().setVisible(true);
        if (showWeather && weather === WeatherType.Fog) {
            const strength = serverDate ? fogStrength(configured, serverDate, settings?.weatherAuto) : 1;
            const density = strength * (night ? 0.5 : 1);
            this.graphics.fillStyle(0xdfe6ee, 0.2 * density);
            for (const rect of veil) this.graphics.fillRect(rect.x, rect.y, rect.width, rect.height);
            const patches = fogPatches(epoch, view, REDUCED_MOTION);
            // A patch is only drawn when it covers no room: its centre and its four extreme points are outdoors.
            const roomsKept = patches.filter(
                (patch) =>
                    !isOutdoor ||
                    [
                        [0, 0],
                        [patch.radius, 0],
                        [-patch.radius, 0],
                        [0, patch.radius],
                        [0, -patch.radius],
                    ].every(([dx, dy]) => isOutdoor(patch.x + dx, patch.y + dy)),
            );
            for (const ring of FOG_RINGS) {
                this.graphics.fillStyle(0xdfe6ee, ring.alpha * density);
                for (const patch of roomsKept) {
                    this.graphics.fillCircle(patch.x, patch.y, patch.radius * ring.scale);
                }
            }
        } else if (showWeather) {
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
        }
        if (showLeaves) {
            const leaves = leafParticles(epoch, view).map((leaf) => ({
                ...leaf,
                x: Math.round(leaf.x),
                y: Math.round(leaf.y),
            }));
            for (const leaf of keepOutdoorParticles(leaves, isOutdoor)) {
                this.graphics.fillStyle(leaf.color, 0.95);
                this.graphics.fillRect(leaf.x, leaf.y, leaf.vertical ? 3 : 4, leaf.vertical ? 4 : 3);
            }
        }
        this.scene.markDirty();
    }

    public destroy(): void {
        for (const unsubscribe of this.unsubscribers) unsubscribe();
        this.sounds.destroy();
        this.snowGround.destroy();
        this.graphics.destroy();
    }
}
