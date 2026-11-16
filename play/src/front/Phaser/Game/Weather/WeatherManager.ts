import { WeatherType } from "@workadventure/map-editor";
import type { Unsubscriber } from "svelte/store";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import { cloudsHeightStore, cloudsShownStore, weatherEffectsEnabledStore } from "../../../Stores/WeatherStore";
import { DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import type { GameScene } from "../GameScene";
import type { OutdoorGrid } from "../Outdoor/OutdoorGrid";
import { SeasonalTheme } from "../Seasonal/SeasonalTheme";
import type { SunPosition } from "../Night/NightClock";
import {
    effectiveWeather,
    FOG_LEVELS,
    fieldLevels,
    fogPatches,
    fogStrength,
    keepOutdoorParticles,
    leafParticles,
    lastStrike,
    lightningBolt,
    outdoorCells,
    paddedView,
    stormFlash,
    weatherParticles,
    weatherAtTime,
    wellInside,
} from "./WeatherFrame";
import type { WeatherView } from "./WeatherFrame";
import { shownWeatherSettings } from "./RealWeatherClient";
import {
    cloudAlpha,
    cloudBlockSize,
    cloudDrift,
    cloudLightStep,
    cloudPalette,
    cloudPatches,
    cloudShadowOffset,
    cloudSunlight,
    cloudTint,
    cloudTones,
    cloudZoomFade,
    overcastVeil,
    rainPalette,
    shownCloudiness,
    shownRainCover,
    SkyDrift,
} from "./Clouds";
import type { CloudPalette } from "./Clouds";
import { SnowGround } from "./SnowGround";
import { createBlockSurface } from "./BlockSurface";
import type { BlockCanvasArea, BlockSurface } from "./BlockSurface";
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
/** A layer painted where it is computed (the shadows are moved by the sun). */
const NO_SHIFT = { columns: 0, rows: 0 };
/** Weather drawn beyond each edge of the screen, in a share of its size: a quick scroll never shows a bare band. */
const DRAW_MARGIN = 0.1;
/**
 * The body of the clouds (their rim is fainter, cloudAlpha) and their shadows: shadows first, the clouds over them,
 * opaque enough to hide their own shadow and read as clouds, not mist.
 */
const CLOUD_ALPHA = 0.78;
const CLOUD_SHADOW_ALPHA = 0.2;
/**
 * Clouds over the rain (grey) and the storm (dark), as cumulus thicker than fine weather ones: a covered sky, no sun,
 * so no shadows.
 */
const RAIN_CLOUDS = { color: 0x7d8794, alpha: 0.65, cloudiness: 0.9 };
const STORM_CLOUDS = { color: 0x2b3240, alpha: 0.75, cloudiness: 1 };
const MIN_RAIN_COVER = 0.6;
const OVERCAST_COLOR = 0x8a94a3;

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
    /** Fog, clouds and their shadows: one image over the veils and the falling weather. */
    private readonly blocks: BlockSurface;
    private lastFrameAt = -Infinity;
    private visible = false;
    private readonly sounds: WeatherSounds;
    private readonly snowGround: SnowGround;
    // The settings, kept up to date by their stores rather than read at every image.
    private readonly unsubscribers: Unsubscriber[];
    private editing = false;
    private weatherShown = true;
    private cloudsShown = true;
    private cloudsHeight = 0;
    /** Where the sky has drifted to with the wind of the map (the real one, or the usual drift). */
    private readonly skyDrift = new SkyDrift();
    private readonly reducedMotion: boolean;
    // What the last fog image looked like: a still fog is not drawn again until one of these changes.
    private lastFogKey: string | undefined;
    /** What the last drawing covered (the view and its margin), to draw again before a scroll reaches its edge. */
    private drawn: WeatherView | undefined;

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
            cloudsShownStore.subscribe((shown) => (this.cloudsShown = shown)),
            cloudsHeightStore.subscribe((height) => (this.cloudsHeight = height)),
        ];
        this.graphics = scene.add
            .graphics()
            .setDepth(DEPTH_NIGHT_INDEX + 1)
            .setVisible(false);
        // Added after the graphics, at the same depth: above them.
        this.blocks = createBlockSurface(scene, DEPTH_NIGHT_INDEX + 1);
    }

    /** `sun`: where the sun of the map is (NightManager), for the shadows of the clouds and their fading at dusk. */
    public update(now: number, serverDate: Date | undefined, night = false, sun?: SunPosition): void {
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
        // Clouds of a clear sky, still fading out over the first minutes of a bad weather; none at night, nor in the
        // Christmas snow.
        const cloudiness = theme === SeasonalTheme.Christmas ? 0 : (settings?.cloudiness ?? 0);
        const sunlight = cloudSunlight(sun?.elevation);
        // The grey veil of an overcast sky only by day: at night it would light the night veil up.
        const veilAlpha = overcastVeil(cloudiness, 1 - sunlight.night);
        const showClouds = enabled && this.cloudsShown && cloudiness > 0;
        if (!showWeather && !showLeaves && !showClouds) {
            if (this.visible) {
                this.graphics.clear().setVisible(false);
                this.blocks.hide();
                this.visible = false;
                this.scene.markDirty();
            }
            this.lastFrameAt = -Infinity;
            this.lastFogKey = undefined;
            this.drawn = undefined;
            return;
        }
        // Keep weather light on the CPU, including when the avatar is idle: rain and snow 30 times a second, the slow
        // falling leaves 15 times, a fog alone 5 times (each drawing makes the whole map drawn again).
        const falling = showWeather && weather !== WeatherType.Fog;
        const fogOnly = showWeather && weather === WeatherType.Fog && !showLeaves;
        // Clouds cross a screen in about 30 s: 15 images a second for them to glide (rain and storm already draw 30).
        const cloudsOnly = showClouds && !showLeaves;
        const camera = this.scene.cameras.main.worldView;
        const screen = { x: camera.x, y: camera.y, width: camera.width, height: camera.height };
        // A scroll that has used half of the drawn margin draws again at once, whatever the pace.
        const nearEdge = this.drawn !== undefined && !wellInside(this.drawn, screen, DRAW_MARGIN / 2);
        if (!nearEdge && now - this.lastFrameAt < 1000 / (falling ? 30 : fogOnly ? 5 : 15)) return;
        this.lastFrameAt = now;
        const view = paddedView(screen, DRAW_MARGIN);
        this.drawn = view;
        const fogStrengthNow =
            showWeather && weather === WeatherType.Fog
                ? serverDate
                    ? fogStrength(configured, serverDate, settings?.weatherAuto, realFogSince, realFogUntil)
                    : 1
                : 1;
        const shadowOffset = showClouds && sunlight.shadows > 0 ? cloudShadowOffset(sun) : undefined;
        if ((fogOnly || cloudsOnly) && this.reducedMotion) {
            // Nothing moves: draw again only when the camera, the fog or clouds, the sun or the night changed.
            const key = [
                view.x,
                view.y,
                view.width,
                view.height,
                this.scene.cameras.main.zoom,
                Math.round(fogStrengthNow * 40),
                night,
                Math.round(cloudiness * 40),
                Math.round(sunlight.night * 20),
                Math.round(sunlight.shadows * 20),
                Math.round((shadowOffset?.x ?? 0) / 4),
                Math.round((shadowOffset?.y ?? 0) / 4),
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
                this.blocks.hide();
                this.visible = false;
                this.scene.markDirty();
            }
            return;
        }
        this.visible = true;
        const epoch = serverDate?.getTime() ?? now;
        const sky = this.skyDrift.at(epoch, cloudDrift(settings?.windFrom, settings?.windSpeed));
        const isOutdoor = grid ? (x: number, y: number): boolean => grid.isOutdoorAt(x, y) : undefined;
        this.graphics.clear().setVisible(true);
        // Cells of the clouds at this zoom, never finer than the fog's 16 px when there is fog (powers of two).
        const cloudBlock = cloudBlockSize(this.scene.cameras.main.zoom);
        const foggy = showWeather && weather === WeatherType.Fog;
        const size = foggy ? Math.max(FOG_BLOCK, cloudBlock) : cloudBlock;
        const canvas = this.blocks.begin(view, size);
        // The walls once for all the layers: a cell is painted when its centre is outdoors.
        const outdoor = grid ? outdoorCells(canvas, size, veil) : new Uint8Array(canvas.columns * canvas.rows).fill(1);
        if (showWeather && weather === WeatherType.Fog) {
            const density = fogStrengthNow * (night ? FOG_NIGHT_FACTOR : 1);
            this.graphics.fillStyle(FOG_COLOR, FOG_VEIL_ALPHA * density);
            for (const rect of veil) this.graphics.fillRect(rect.x, rect.y, rect.width, rect.height);
            // The patches stop at the walls: only outdoor cells are painted.
            const levels = fieldLevels(canvas, size, fogPatches(epoch, view, this.reducedMotion));
            this.blocks.paintField(canvas, levels, outdoor, NO_SHIFT, FOG_COLOR, (level) => {
                return ((FOG_PATCH_ALPHA * level) / FOG_LEVELS) * density;
            });
        } else if (showWeather) {
            if (weather !== WeatherType.Snow) {
                this.graphics.fillStyle(0x27344b, weather === WeatherType.Storm ? 0.2 : 0.05);
                for (const rect of veil) this.graphics.fillRect(rect.x, rect.y, rect.width, rect.height);
            }
            // The rain falls from grey clouds, the storm from dark ones (not at night, with the personal switch).
            const covering =
                weather === WeatherType.Storm ? STORM_CLOUDS : weather === WeatherType.Rain ? RAIN_CLOUDS : undefined;
            if (covering && this.cloudsShown) {
                // The real cover when known, never so thin that the rain seems to fall from a clear sky.
                const cover =
                    settings?.cloudCover === undefined
                        ? covering.cloudiness
                        : Math.max(MIN_RAIN_COVER, settings.cloudCover);
                const patches = cloudPatches(epoch, view, shownRainCover(cover), this.reducedMotion, sky);
                const levels = fieldLevels(canvas, size, patches);
                const body = covering.alpha * this.zoomFade();
                this.paintCumulus(canvas, levels, outdoor, size, rainPalette(covering.color), body, sunlight.night);
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
        if (showClouds) {
            const zoom = this.screenScale();
            this.drawClouds(
                epoch,
                sky,
                canvas,
                size,
                outdoor,
                veil,
                cloudiness,
                sunlight,
                shadowOffset,
                veilAlpha,
                zoom,
            );
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
        this.blocks.end();
        this.scene.markDirty();
    }

    /**
     * Clouds of a clear sky, outdoors only and over everything (avatars and objects too): the grey veil of an overcast
     * sky, the shadows cast away from the sun, then the clouds over them. Each cloud is a cumulus with a sharp edge, lit
     * from the north-west and grey on the other side, white by fine weather, greyer as the
     * sky gets covered and dark at night. A very cloudy sky shows more and greyer clouds, never a sheet over the map.
     * Gone zoomed in (the camera is under them), their shadows kept. Fixed to the map, they glide with the wind whatever the camera.
     */
    private drawClouds(
        epoch: number,
        sky: { x: number; y: number },
        canvas: BlockCanvasArea,
        size: number,
        outdoor: Uint8Array,
        veil: readonly WeatherView[],
        cloudiness: number,
        sunlight: { night: number; shadows: number },
        shadowOffset: { x: number; y: number } | undefined,
        veilAlpha: number,
        zoom: number,
    ): void {
        if (veilAlpha > 0) {
            this.graphics.fillStyle(OVERCAST_COLOR, veilAlpha);
            for (const rect of veil) this.graphics.fillRect(rect.x, rect.y, rect.width, rect.height);
        }
        // One field of clouds for the clouds and their shadows (the same clouds, moved by whole cells), wide enough for
        // the shadows of clouds just out of the canvas.
        const shift = shadowOffset
            ? { columns: Math.round(shadowOffset.x / size), rows: Math.round(shadowOffset.y / size) }
            : NO_SHIFT;
        const field = {
            x: canvas.x - Math.abs(shift.columns) * size,
            y: canvas.y - Math.abs(shift.rows) * size,
            columns: canvas.columns + 2 * Math.abs(shift.columns),
            rows: canvas.rows + 2 * Math.abs(shift.rows),
        };
        const fieldView = { x: field.x, y: field.y, width: field.columns * size, height: field.rows * size };
        const patches = cloudPatches(epoch, fieldView, shownCloudiness(cloudiness), this.reducedMotion, sky);
        const levels = fieldLevels(field, size, patches);
        const fade = cloudZoomFade(zoom, this.cloudsHeight);
        if (shadowOffset) {
            // The shadows stay on the ground, also zoomed in under the clouds.
            const alpha = CLOUD_SHADOW_ALPHA * sunlight.shadows;
            this.blocks.paintField(field, levels, outdoor, shift, 0x000000, (level) => (alpha * level) / FOG_LEVELS);
        }
        this.paintCumulus(field, levels, outdoor, size, cloudPalette(cloudiness), CLOUD_ALPHA * fade, sunlight.night);
    }

    /**
     * A field of clouds painted as cumulus: lit from the north-west, in the three tones of the palette, `body` the
     * opacity of their body (their rim fainter), darkened as the night comes.
     */
    private paintCumulus(
        field: BlockCanvasArea,
        levels: Uint8Array,
        outdoor: Uint8Array,
        size: number,
        palette: CloudPalette,
        body: number,
        night: number,
    ): void {
        // Zoomed in under the clouds: nothing to paint.
        if (body <= 0) return;
        const tones = cloudTones(levels, field.columns, field.rows, cloudLightStep(size));
        for (const [tone, color] of [
            [tones.lit, palette.lit],
            [tones.mid, palette.mid],
            [tones.shade, palette.shade],
        ] as const) {
            const tint = cloudTint(color, body, night);
            this.blocks.paintField(field, tone, outdoor, NO_SHIFT, tint.color, (level) =>
                cloudAlpha(level, tint.alpha),
            );
        }
    }

    /** How much of the clouds shows at this zoom, at the height this person set for them. */
    private zoomFade(): number {
        return cloudZoomFade(this.screenScale(), this.cloudsHeight);
    }

    /**
     * Screen pixels a map pixel takes: the camera zoom over Phaser's display scale, which stretches the canvas while the
     * camera stays at 1 (Retina screens). The camera zoom alone when the display scale is unknown.
     */
    private screenScale(): number {
        const zoom = this.scene.cameras.main.zoom;
        const scale = zoom / this.scene.scale.displayScale.x;
        return Number.isFinite(scale) && scale > 0 ? scale : zoom;
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
        this.blocks.destroy();
    }
}
