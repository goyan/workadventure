import { WeatherType } from "@workadventure/map-editor";
import type { Unsubscriber } from "svelte/store";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import { weatherEffectsEnabledStore } from "../../../Stores/WeatherStore";
import { DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import type { GameScene } from "../GameScene";
import type { OutdoorGrid } from "../Outdoor/OutdoorGrid";
import { SeasonalTheme } from "../Seasonal/SeasonalTheme";
import {
    effectiveWeather,
    FOG_LEVELS,
    fogBlocks,
    fogPatches,
    fogStrength,
    keepOutdoorParticles,
    leafParticles,
    lastStrike,
    lightningBolt,
    stormFlash,
    weatherParticles,
    weatherAtTime,
} from "./WeatherFrame";
import type { WeatherView } from "./WeatherFrame";
import { shownWeatherSettings } from "./RealWeatherClient";
import { SnowGround } from "./SnowGround";
import { WeatherSounds } from "./WeatherSounds";

/** The system asks for less motion: the fog patches stand still. */
const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

const FOG_COLOR = 0xdfe6ee;
/** The fog veil over everything outdoors, and how much thicker the centre of a patch is. */
const FOG_VEIL_ALPHA = 0.6;
const FOG_PATCH_ALPHA = 0.3;
/** At night the fog is lighter, so the night stays dark. */
const FOG_NIGHT_FACTOR = 0.6;
/** Size of a fog block, in pixels of the map: small enough to look soft, big enough to stay cheap. */
const FOG_BLOCK = 16;

export interface WeatherManagerOptions {
    /** Outdoor cells of the map: weather is only drawn there. Without a grid, it covers the whole view. */
    outdoorGrid?: () => OutdoorGrid | undefined;
    /** The personal seasonal theme: Christmas shows snow instead of the map weather, autumn colours the grass. */
    seasonalTheme?: () => SeasonalTheme | undefined;
    /** Overrides the system "reduced motion" setting (read once from matchMedia otherwise). Used by tests. */
    reducedMotion?: boolean;
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
    private readonly reducedMotion: boolean;
    // What the last fog image looked like: a still fog is not drawn again until one of these changes.
    private lastFogKey: string | undefined;

    constructor(
        private readonly scene: GameScene,
        private readonly options: WeatherManagerOptions = {},
    ) {
        this.reducedMotion = options.reducedMotion ?? REDUCED_MOTION;
        this.sounds = new WeatherSounds(scene.sound);
        this.snowGround = new SnowGround(scene);
        this.unsubscribers = [
            mapEditorModeStore.subscribe((editing) => (this.editing = editing)),
            weatherEffectsEnabledStore.subscribe((shown) => (this.weatherShown = shown)),
        ];
        this.graphics = scene.add
            .graphics()
            .setDepth(DEPTH_NIGHT_INDEX + 1)
            .setVisible(false);
    }

    public update(now: number, serverDate: Date | undefined, night = false): void {
        const mapSettings = this.scene.getGameMap().getWamFile()?.getWam().settings;
        const settings = shownWeatherSettings(mapSettings, serverDate);
        const configured = settings?.weather ?? WeatherType.Clear;
        // Only a real fog fades in and out with its run: a fixed fog keeps its full thickness, as before.
        const real = mapSettings?.weather === WeatherType.Real;
        const realFogSince = real ? settings?.weatherStartedAt : undefined;
        const realFogUntil = real ? settings?.weatherEndsAt : undefined;
        const theme = this.options.seasonalTheme?.();
        const weather = effectiveWeather(weatherAtTime(configured, serverDate, settings?.weatherAuto), theme);
        this.sounds.update(weather, serverDate, this.editing, night);
        const enabled = this.weatherShown && !this.editing;
        // The snow of the map is the Christmas decor fading in (SeasonalThemeManager): this ground stays grass.
        this.snowGround.update(
            now,
            serverDate,
            // The Christmas theme draws its own snow ground over the whole outside: the seasonal ground steps aside.
            !this.editing && theme !== SeasonalTheme.Christmas,
            theme === SeasonalTheme.Autumn,
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
            this.lastFogKey = undefined;
            return;
        }
        // Keep weather light on the CPU, including when the avatar is idle: rain and snow 30 times a second, the slow
        // falling leaves 15 times, a fog alone 5 times (each drawing makes the whole map drawn again).
        const falling = showWeather && weather !== WeatherType.Fog;
        const fogOnly = showWeather && weather === WeatherType.Fog && !showLeaves;
        if (now - this.lastFrameAt < 1000 / (falling ? 30 : fogOnly ? 5 : 15)) return;
        this.lastFrameAt = now;
        const view = this.scene.cameras.main.worldView;
        const fogStrengthNow =
            showWeather && weather === WeatherType.Fog
                ? serverDate
                    ? fogStrength(configured, serverDate, settings?.weatherAuto, realFogSince, realFogUntil)
                    : 1
                : 1;
        if (fogOnly && this.reducedMotion) {
            // Nothing moves: draw again only when the camera, the fog strength or the night changed.
            const key = [
                view.x,
                view.y,
                view.width,
                view.height,
                this.scene.cameras.main.zoom,
                Math.round(fogStrengthNow * 40),
                night,
            ].join("|");
            if (this.visible && key === this.lastFogKey) return;
            this.lastFogKey = key;
        } else {
            this.lastFogKey = undefined;
        }
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
            const density = fogStrengthNow * (night ? FOG_NIGHT_FACTOR : 1);
            this.graphics.fillStyle(FOG_COLOR, FOG_VEIL_ALPHA * density);
            for (const rect of veil) this.graphics.fillRect(rect.x, rect.y, rect.width, rect.height);
            // The patches are cut into blocks inside the outdoor runs, so they stop at the walls.
            const blocks = fogBlocks(veil, fogPatches(epoch, view, this.reducedMotion), FOG_BLOCK);
            for (let level = 1; level <= FOG_LEVELS; level++) {
                const ofLevel = blocks.filter((block) => block.level === level);
                if (ofLevel.length === 0) continue;
                this.graphics.fillStyle(FOG_COLOR, ((FOG_PATCH_ALPHA * level) / FOG_LEVELS) * density);
                for (const block of ofLevel) this.graphics.fillRect(block.x, block.y, block.width, block.height);
            }
        } else if (showWeather) {
            if (weather !== WeatherType.Snow) {
                this.graphics.fillStyle(0x27344b, weather === WeatherType.Storm ? 0.2 : 0.05);
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
            if (weather === WeatherType.Storm && serverDate) this.drawLightning(epoch, view, veil, isOutdoor);
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

    /** The flash of the last strike over everything outdoors, and its bolt (not when motion is reduced). */
    private drawLightning(
        epoch: number,
        view: WeatherView,
        veil: readonly WeatherView[],
        isOutdoor: ((x: number, y: number) => boolean) | undefined,
    ): void {
        const strike = lastStrike(epoch);
        const elapsed = epoch - strike.at;
        const flash = stormFlash(elapsed, this.reducedMotion);
        if (flash > 0) {
            this.graphics.fillStyle(0xe3eaff, flash);
            for (const rect of veil) this.graphics.fillRect(rect.x, rect.y, rect.width, rect.height);
        }
        if (this.reducedMotion) return;
        const bolt = lightningBolt(strike, elapsed, view, isOutdoor);
        if (!bolt) return;
        // A wide pale halo, then the bright core.
        for (const [width, color, alpha] of [
            [6, 0xb8c8ff, 0.35],
            [2, 0xffffff, 0.95],
        ] as const) {
            this.graphics.lineStyle(width, color, alpha);
            this.graphics.beginPath();
            this.graphics.moveTo(bolt[0].x, bolt[0].y);
            for (const point of bolt.slice(1)) this.graphics.lineTo(point.x, point.y);
            this.graphics.strokePath();
        }
    }

    public destroy(): void {
        for (const unsubscribe of this.unsubscribers) unsubscribe();
        this.sounds.destroy();
        this.snowGround.destroy();
        this.graphics.destroy();
    }
}
