import { heightAt, TERRAIN_CELL, WeatherType } from "@workadventure/map-editor";
import type { PrecipitationAir } from "@workadventure/map-editor";
import { get } from "svelte/store";
import type { Unsubscriber } from "svelte/store";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import {
    cloudsHeightStore,
    cloudsShownStore,
    rainbowShownStore,
    waterReflectionsStore,
    rainbowSpotStore,
    smoothCloudsStore,
    rainAmountStore,
    rainCloudsStore,
    rainLeanStore,
    rainPuddlesStore,
    rainSplashesStore,
    weatherEffectsEnabledStore,
} from "../../../Stores/WeatherStore";
import { DEPTH_FAR_FOG_INDEX, DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import type { GameScene } from "../GameScene";
import type { OutdoorGrid } from "../Outdoor/OutdoorGrid";
import { SeasonalTheme } from "../Seasonal/SeasonalTheme";
import type { SunPosition } from "../Night/NightClock";
import { basicActiveStore, unlessBasic } from "../../../Stores/BasicModeStore";
import { pixelBlocksShownNow } from "../Terrain/PixelBlocksShown";
import { NO_WATER_REFLECTION } from "../Terrain/WaterReflection";
import type { WaterReflection } from "../Terrain/WaterReflection";
import type { RaisedCover } from "./RaisedCover";
import {
    farFogCells,
    FOG_LEVELS,
    fieldLevels,
    fogPatches,
    fogStrength,
    keepOutdoorParticles,
    lastStrike,
    lightningBolt,
    outdoorCells,
    paddedView,
    stormFlash,
    themedFall,
    weatherAtTime,
    wellInside,
} from "./WeatherFrame";
import type { WeatherView } from "./WeatherFrame";
import { shownWeatherSettings } from "./RealWeatherClient";
import {
    forcedRainLevel,
    parseRainLevel,
    rainDrops,
    rainFineness,
    rainIntensity,
    followWind,
    rainSplashes,
    rainUnderCloud,
    rainVeilAlpha,
} from "./Rain";
import type { RainLocal, RainWind } from "./Rain";
import { mapGroundWetness, PUDDLE_ROW, puddleRows, puddlesIn } from "./Puddles";
import {
    cloudAlpha,
    cloudBlockSize,
    cloudDrift,
    cloudLightStep,
    cloudPalette,
    cloudPatches,
    cumulonimbusPalette,
    cloudShadowOffset,
    cloudSunlight,
    cloudTint,
    cloudTones,
    cloudZoomFade,
    cloudsOverRoofs,
    overcastVeil,
    rainPalette,
    shownCloudiness,
    shownRainCover,
    SkyDrift,
} from "./Clouds";
import type { CloudPalette } from "./Clouds";
import { SnowGround } from "./SnowGround";
import { createBlockSurface } from "./BlockSurface";
import { CLOUD_LAYER_MARGIN, CloudLayer } from "./CloudLayer";
import { rainbowPlacement, rainbowStrength } from "./Rainbow";
import { contrails } from "./Contrails";
import type { Contrail } from "./Contrails";
import type { CloudSky } from "./CloudLayer";
import { screenScale, seenFromFar } from "./ScreenScale";
import type { BlockCanvasArea, BlockSurface } from "./BlockSurface";
import { WeatherSounds } from "./WeatherSounds";
import { drawFlake, flakeMix, groundWind, snowflakes, snowLevel, snowTones } from "./Snowfall";
import type { SnowFall } from "./Snowfall";

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
/** The outdoors of the view is read for a view widened to whole steps of this many map pixels (see veilOver). */
const VEIL_STEP = 256;
/**
 * How many times a second the clouds and the fog are painted, for blocks of this size (map pixels): they drift by
 * whole blocks, so large blocks (seen from far) move seldom.
 */
export function blocksPerSecond(blockSize: number): number {
    return blockSize >= 32 ? 6 : blockSize >= 16 ? 8 : 10;
}

/** A veil of more rectangles than this is painted in the canvas of the clouds instead (see fillVeil). */
const VEIL_MAX_RECTS = 96;
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
const RAIN_COLOR = 0xcfe3f5;
/** Over the grass of the seasons (0.6), under the objects and the avatars. */
const PUDDLE_DEPTH = 0.7;
const PUDDLE_COLOR = 0x4f7ba6;
const PUDDLE_EDGE_COLOR = 0x26384d;
/** Opacity of a splash as the drop hits, spreads and fades. */
const SPLASH_ALPHAS = [0.75, 0.55, 0.3];

export interface WeatherManagerOptions {
    /** Outdoor cells of the map: weather is only drawn there. Without a grid, it covers the whole view. */
    outdoorGrid?: () => OutdoorGrid | undefined;
    /**
     * What is drawn over the outdoors without being outdoors (the slabs of a raised floor in a room, the tall walls):
     * the weather leaves it alone, as it leaves the rooms.
     */
    raisedCover?: () => RaisedCover | undefined;
    /**
     * The room the avatar stands in (OutdoorGrid.roomAt at its feet), undefined outdoors: seen from far the fog passes
     * over the buildings, never over this room.
     */
    avatarRoom?: () => number | undefined;
    /** The personal seasonal theme: autumn colours the grass. */
    seasonalTheme?: () => SeasonalTheme | undefined;
    /**
     * The share of a precipitation that falls as snow, 0 to 1, in the air of the room (snowShareOf its conditions, the
     * same for everyone): flakes instead of as many drops. Rain when not given.
     */
    snowShare?: () => number;
    /**
     * The air the precipitation falls through (precipitationAirNow), which says what flakes it makes (flakeMix): big
     * ones near 0 °C, fine crystals in a hard frost. A usual snow just under 0 °C when not given.
     */
    precipitationAir?: () => PrecipitationAir | undefined;
    /** Overrides the system "reduced motion" setting (read once from matchMedia otherwise). Used by tests. */
    reducedMotion?: boolean;
}

export class WeatherManager {
    private readonly graphics: Phaser.GameObjects.Graphics;
    /** Fog, clouds and their shadows: one image over the veils and the falling weather. */
    private readonly blocks: BlockSurface;
    /** Seen from far, the fog over the buildings: over the lights of the lamps, so that they do not pierce it. */
    private readonly farFog: BlockSurface;
    /** The clouds of a clear sky drawn by the graphics card; undefined without WebGL. */
    private readonly cloudLayer: CloudLayer | undefined;
    private smoothClouds = true;
    /** What the cloud layer draws this time, gathered while the weather is drawn (see drawSkyLayer). */
    private layerVeils: readonly { color: number; alpha: number }[] = [];
    private layerClouds: CloudSky | undefined;
    /** Whether the cloud layer draws what it holds over the roofs too, seen from far: not the fog (paintFarFog). */
    private layerOverRoofs = true;
    /** The strength of the rainbow drawn this time (0: none). */
    private layerRainbow = 0;
    /** The sky the water reflects, worked out at each drawing of the weather (see waterReflection). */
    private reflectedSky: Omit<WaterReflection, "lamps"> = {
        sky: { color: DAY_SKY, share: 0 },
        clouds: undefined,
        sun: { x: 0, y: -1, strength: 0 },
    };
    /** Basique hides every effect: the rainbow too. */
    private basic = false;
    private rainbowShown = true;
    private reflectionsShown = true;
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
    /** What is not outdoors in the cells being drawn, and how much of the clouds passes over it (see cloudsOverRoofs). */
    private roofs: { cells: Uint8Array; share: number } | undefined;
    /** The personal settings of the rain (WeatherStore), 1 each by default. */
    private readonly rainSettings = { amount: 1, lean: 1, splashes: 1, puddles: 1, clouds: 1 };
    /** The puddles, on the ground under the objects and the avatars. */
    private readonly puddleGraphics: Phaser.GameObjects.Graphics;
    private lastPuddleKey = "";
    private puddlesVisible = false;
    /** Where the sky has drifted to with the wind of the map (the real one, or the usual drift). */
    private readonly skyDrift = new SkyDrift();
    /** Where the air near the ground has carried the snow, with the real wind (map pixels): the flakes go with it. */
    private readonly snowDrift = new SkyDrift();
    /** The wind the drops go with, and when it was last read (ms): it follows the real one within a second. */
    private rainWind: { wind: RainWind; at: number } | undefined;
    private readonly reducedMotion: boolean;
    // Development override of the rain intensity (`?rainLevel`), fixed for the life of the scene.
    private readonly forcedRain = parseRainLevel(window.location.search, import.meta.env.DEV);
    // What the last fog image looked like: a still fog is not drawn again until one of these changes.
    private lastFogKey: string | undefined;
    /** What the last drawing covered (the view and its margin), to draw again before a scroll reaches its edge. */
    private drawn: WeatherView | undefined;
    /** The canvas of the clouds and the fog as it was last painted (see update): kept between two paintings. */
    private blockFrame:
        | {
              key: string;
              veil: readonly WeatherView[] | undefined;
              at: number;
              view: WeatherView;
              canvas: BlockCanvasArea;
              outdoor: Uint8Array;
              size: number;
              /** The clouds of the rain as they were painted: the rain falls thicker under them. */
              rainLevels: Uint8Array | undefined;
          }
        | undefined;
    /** A field that covers every cell of the canvas of the clouds: a veil painted in it (see fillVeil). */
    private everyCell = new Uint8Array(0);
    /** The outdoors last read, and what it was read from (see veilOver). */
    private veil:
        | (WeatherView & { grid: OutdoorGrid; cover: RaisedCover | undefined; rects: WeatherView[] })
        | undefined;

    constructor(
        private readonly scene: GameScene,
        private readonly options: WeatherManagerOptions = {},
    ) {
        this.reducedMotion = options.reducedMotion ?? REDUCED_MOTION;
        this.sounds = new WeatherSounds(scene.sound);
        this.snowGround = new SnowGround(scene);
        this.unsubscribers = [
            mapEditorModeStore.subscribe((editing) => (this.editing = editing)),
            unlessBasic(weatherEffectsEnabledStore).subscribe((shown) => (this.weatherShown = shown)),
            unlessBasic(cloudsShownStore).subscribe((shown) => (this.cloudsShown = shown)),
            smoothCloudsStore.subscribe((smooth) => (this.smoothClouds = smooth)),
            basicActiveStore.subscribe((basic) => (this.basic = basic)),
            rainbowShownStore.subscribe((shown) => (this.rainbowShown = shown)),
            waterReflectionsStore.subscribe((shown) => (this.reflectionsShown = shown)),
            cloudsHeightStore.subscribe((height) => (this.cloudsHeight = height)),
            rainAmountStore.subscribe((value) => (this.rainSettings.amount = value)),
            rainLeanStore.subscribe((value) => (this.rainSettings.lean = value)),
            rainSplashesStore.subscribe((value) => (this.rainSettings.splashes = value)),
            rainPuddlesStore.subscribe((value) => (this.rainSettings.puddles = value)),
            rainCloudsStore.subscribe((value) => (this.rainSettings.clouds = value)),
        ];
        this.puddleGraphics = scene.add.graphics().setDepth(PUDDLE_DEPTH).setVisible(false);
        this.graphics = scene.add
            .graphics()
            .setDepth(DEPTH_NIGHT_INDEX + 1)
            .setVisible(false);
        // Added after the graphics, at the same depth: above them.
        this.blocks = createBlockSurface(scene, DEPTH_NIGHT_INDEX + 1);
        this.farFog = createBlockSurface(scene, DEPTH_FAR_FOG_INDEX);
        // Added after the blocks, at the same depth: the clouds over the fog and the veils painted there.
        this.cloudLayer = CloudLayer.create(scene, DEPTH_NIGHT_INDEX + 1);
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
        const mapWeather = weatherAtTime(configured, serverDate, settings?.weatherAuto, settings?.weatherLocation);
        const forcedRain = forcedRainLevel(this.forcedRain, now);
        const mapRaining = mapWeather === WeatherType.Storm || mapWeather === WeatherType.Rain;
        // In cold air the precipitation falls as snow, wholly or among the drops: the weather itself stays a rain. And
        // it snows for who chose the winter theme, whatever the weather of the map (themedFall).
        const { weather, rain, snow, flakes } = themedFall(
            theme,
            mapWeather,
            forcedRain ?? rainIntensity(settings?.rainRate, mapWeather === WeatherType.Storm),
            mapRaining ? Math.max(0, Math.min(1, this.options.snowShare?.() ?? 0)) : 0,
        );
        const storm = weather === WeatherType.Storm;
        const raining = storm || weather === WeatherType.Rain;
        // A forced level (development) soaks the ground as much, so the puddles can be seen at once.
        const wetness = Math.max(mapGroundWetness(settings, serverDate), raining ? (forcedRain ?? 0) : 0);
        this.drawPuddles(this.weatherShown && !this.editing ? wetness : 0);
        this.sounds.update(weather, serverDate, this.editing, night, rain, snow);
        const enabled = this.weatherShown && !this.editing;
        // The grass of the map: left to the blocks of the relief while it is shown in 3/4 (they draw it).
        this.snowGround.update(
            now,
            serverDate,
            !this.editing && !pixelBlocksShownNow(),
            theme === SeasonalTheme.Autumn,
        );
        const showWeather = enabled && weather !== WeatherType.Clear;
        // Clouds of a clear sky, still fading out over the first minutes of a bad weather; none at night.
        const cloudiness = settings?.cloudiness ?? 0;
        const sunlight = cloudSunlight(sun?.elevation);
        // The grey veil of an overcast sky only by day: at night it would light the night veil up.
        const veilAlpha = overcastVeil(cloudiness, 1 - sunlight.night);
        const showClouds = enabled && this.cloudsShown && cloudiness > 0;
        if (!showWeather && !showClouds) {
            if (this.visible) {
                this.graphics.clear().setVisible(false);
                this.blocks.hide();
                this.cloudLayer?.hide();
                this.setRainbowSpot(undefined);
                this.farFog.hide();
                this.blockFrame = undefined;
                this.visible = false;
                this.scene.markDirty();
            }
            this.lastFrameAt = -Infinity;
            this.lastFogKey = undefined;
            this.drawn = undefined;
            return;
        }
        // Keep weather light on the CPU, including when the avatar is idle: rain and snow 30 times a second, a fog alone
        // 5 times (each drawing makes the whole map drawn again).
        const falling = showWeather && weather !== WeatherType.Fog;
        const fogOnly = showWeather && weather === WeatherType.Fog;
        const epoch = serverDate?.getTime() ?? now;
        const sky = this.skyDrift.at(epoch, cloudDrift(settings?.windFrom, settings?.windSpeed));
        if (showClouds && !fogOnly && this.smoothCloudLayer()?.moveSky(sky)) this.scene.markDirty();
        const camera = this.scene.cameras.main.worldView;
        const screen = { x: camera.x, y: camera.y, width: camera.width, height: camera.height };
        // A scroll that has used half of the drawn margin draws again at once, whatever the pace.
        const nearEdge = this.drawn !== undefined && !wellInside(this.drawn, screen, DRAW_MARGIN / 2);
        // Clouds cross a screen in about 30 s: 15 images a second for them to glide (rain and storm already draw 30).
        // Drawn by the graphics card, they glide by fractions of a pixel: 30 images a second, as the rain.
        const cloudRate = this.smoothCloudLayer() ? 30 : 15;
        // A fog in blocks moves by whole blocks: 5 images a second are enough. Drawn by the graphics card, it glides.
        const fogRate = this.smoothCloudLayer() ? cloudRate : 5;
        if (!nearEdge && now - this.lastFrameAt < 1000 / (falling ? 30 : fogOnly ? fogRate : cloudRate)) return;
        this.lastFrameAt = now;
        const view = paddedView(screen, DRAW_MARGIN);
        this.drawn = view;
        const fogStrengthNow =
            showWeather && weather === WeatherType.Fog
                ? serverDate
                    ? fogStrength(
                          configured,
                          serverDate,
                          settings?.weatherAuto,
                          realFogSince,
                          realFogUntil,
                          settings?.weatherLocation,
                      )
                    : 1
                : 1;
        const shadowOffset = showClouds && sunlight.shadows > 0 ? cloudShadowOffset(sun) : undefined;
        const avatarRoom = this.options.avatarRoom?.();
        if ((fogOnly || showClouds) && this.reducedMotion) {
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
                avatarRoom,
            ].join("|");
            if (this.visible && key === this.lastFogKey) return;
            this.lastFogKey = key;
        } else {
            this.lastFogKey = undefined;
        }
        const grid = this.options.outdoorGrid?.();
        // Veils cover the outdoor runs of the view only, so rooms stay as they are.
        const cover = grid ? this.options.raisedCover?.() : undefined;
        const veil = grid ? this.veilOver(view, grid, cover) : [view];
        if (veil.length === 0) {
            // Nothing outside on the screen: nothing to draw, and no reason to draw the map again.
            if (this.visible) {
                this.graphics.clear().setVisible(false);
                this.blocks.hide();
                this.cloudLayer?.hide();
                this.setRainbowSpot(undefined);
                this.farFog.hide();
                this.blockFrame = undefined;
                this.visible = false;
                this.scene.markDirty();
            }
            return;
        }
        this.visible = true;
        const isOutdoor = grid
            ? (x: number, y: number): boolean => grid.isOutdoorAt(x, y) && cover?.has(x, y) !== true
            : undefined;
        this.graphics.clear().setVisible(true);
        // Cells of the clouds at this zoom, never finer than the fog's 16 px when there is fog (powers of two).
        const cloudBlock = cloudBlockSize(this.scene.cameras.main.zoom);
        const foggy = showWeather && weather === WeatherType.Fog;
        const size = foggy ? Math.max(FOG_BLOCK, cloudBlock) : cloudBlock;
        // The clouds and the fog drift slowly, by whole blocks: they are painted a few times a second, while what
        // falls is drawn 30 times. Painted again at once when what they show changes or the scroll nears their edge.
        // Painted again at once when the avatar goes into another room: the fog seen from far leaves it clear.
        const blockKey = [weather, showClouds, this.cloudsShown, night, size, this.reducedMotion, avatarRoom].join("|");
        // The outdoors the walls leave (the same list while they do not change); the whole view without walls.
        const outdoors = grid ? veil : undefined;
        const kept = this.blockFrame;
        const paint =
            !kept ||
            kept.key !== blockKey ||
            kept.veil !== outdoors ||
            now - kept.at >= 1000 / blocksPerSecond(size) ||
            !wellInside(kept.view, screen, DRAW_MARGIN / 2);
        let canvas: BlockCanvasArea;
        this.layerVeils = [];
        this.layerClouds = undefined;
        this.layerOverRoofs = true;
        this.layerRainbow =
            showWeather && !this.basic && this.rainbowShown
                ? rainbowStrength(raining, storm, sun?.elevation, settings?.cloudCover, snow)
                : 0;
        let outdoor: Uint8Array;
        if (paint || !kept) {
            canvas = this.blocks.begin(view, size);
            // The walls once for all the layers: a cell is painted when its centre is outdoors.
            outdoor = grid ? outdoorCells(canvas, size, veil) : new Uint8Array(canvas.columns * canvas.rows).fill(1);
            // Seen from high above, the clouds pass over the buildings too (their shadows stay on the ground outdoors).
            const overRoofs = grid ? cloudsOverRoofs(this.screenScale()) : 0;
            this.roofs = overRoofs > 0 ? { cells: outdoor.map((cell) => (cell ? 0 : 1)), share: overRoofs } : undefined;
            this.blockFrame = {
                key: blockKey,
                veil: outdoors,
                at: now,
                view,
                canvas,
                outdoor,
                size,
                rainLevels: undefined,
            };
        } else {
            ({ canvas, outdoor } = kept);
        }
        if (showWeather && weather === WeatherType.Fog) {
            const density = fogStrengthNow * (night ? FOG_NIGHT_FACTOR : 1);
            this.addVeil(canvas, outdoor, veil, FOG_COLOR, FOG_VEIL_ALPHA * density, paint);
            if (this.smoothCloudLayer()) {
                // Smooth, as the clouds: its patches thickened by the graphics card, one flat colour, no shadow. Over
                // the roofs the fog seen from far (paintFarFog) stays, over the lamps.
                this.layerClouds = this.fogSky(epoch, view, FOG_PATCH_ALPHA * density);
                this.layerOverRoofs = false;
            }
            if (paint) {
                // The patches stop at the walls: only outdoor cells are painted.
                const levels = fieldLevels(canvas, size, fogPatches(epoch, view, this.reducedMotion));
                if (!this.smoothCloudLayer()) {
                    this.blocks.paintField(canvas, levels, outdoor, NO_SHIFT, FOG_COLOR, (level) => {
                        return ((FOG_PATCH_ALPHA * level) / FOG_LEVELS) * density;
                    });
                }
                this.paintFarFog(view, canvas, size, outdoor, levels, density, grid, avatarRoom);
            }
        } else if (showWeather) {
            this.addVeil(canvas, outdoor, veil, 0x27344b, storm ? 0.2 : rainVeilAlpha(rain), paint);
            // The rain falls from grey clouds, the storm from dark ones (not at night, with the personal switch).
            const covering =
                weather === WeatherType.Storm ? STORM_CLOUDS : weather === WeatherType.Rain ? RAIN_CLOUDS : undefined;
            let underClouds: RainLocal | undefined;
            if (covering) {
                // The real cover when known, never so thin that the rain seems to fall from a clear sky.
                const cover =
                    settings?.cloudCover === undefined
                        ? covering.cloudiness
                        : Math.max(MIN_RAIN_COVER, settings.cloudCover);
                if (paint && this.blockFrame) {
                    const patches = cloudPatches(epoch, view, shownRainCover(cover), this.reducedMotion, sky);
                    const painted = fieldLevels(canvas, size, patches);
                    this.blockFrame.rainLevels = painted;
                    if (this.cloudsShown && !this.smoothCloudLayer()) {
                        const body = covering.alpha * this.zoomFade();
                        this.paintCumulus(
                            canvas,
                            painted,
                            outdoor,
                            size,
                            rainPalette(covering.color),
                            body,
                            sunlight.night,
                        );
                    }
                }
                if (this.cloudsShown && this.smoothCloudLayer()) {
                    this.layerClouds = this.cloudSky(
                        epoch,
                        view,
                        sky,
                        shownRainCover(cover),
                        cumulonimbusPalette(covering.color),
                        covering.alpha * this.zoomFade(),
                        sunlight.night,
                        undefined,
                    );
                }
                // More rain under the thick of a cloud, less in a gap: the showers cross the map with the clouds
                // (the clouds as they were last painted).
                const levels = this.blockFrame?.rainLevels;
                if (levels) {
                    underClouds = (x, y) => {
                        const column = Math.floor((x - canvas.x) / size);
                        const row = Math.floor((y - canvas.y) / size);
                        if (column < 0 || row < 0 || column >= canvas.columns || row >= canvas.rows) return 1;
                        return rainUnderCloud(
                            levels[row * canvas.columns + column] / FOG_LEVELS,
                            this.rainSettings.clouds,
                        );
                    };
                }
            }
            // The drops go with the wind near the ground, as the flakes do: the same way in a sleet.
            const wind = this.rainWindAt(
                now,
                groundWind(settings?.windFrom, settings?.windSpeed, this.rainSettings.lean),
            );
            // The part that falls as rain as drops, the part that falls as snow as flakes: both in a sleet.
            if (snow < 1) this.drawRain(epoch, view, rain * (1 - snow), wind, isOutdoor, underClouds);
            const fall: SnowFall = {
                // The snow of the winter theme under a dry sky falls as it says, whatever the rate of the map.
                level: Math.min(1, (flakes ?? snowLevel(settings?.rainRate, snow, storm)) * this.rainSettings.amount),
                mix: flakeMix(this.options.precipitationAir?.()),
            };
            if (fall.level > 0) {
                const darkness = sun ? sunlight.night : night ? 1 : 0;
                this.drawSnow(
                    epoch,
                    view,
                    fall,
                    settings?.windFrom,
                    settings?.windSpeed,
                    darkness,
                    isOutdoor,
                    underClouds,
                );
            }
            if (storm && serverDate) this.drawLightning(epoch, view, veil, isOutdoor);
        }
        if (showClouds) {
            const zoom = this.screenScale();
            this.drawClouds(
                view,
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
                paint,
            );
        }
        const trails = this.reducedMotion
            ? []
            : contrails(
                  epoch,
                  cloudDrift(settings?.windFrom, settings?.windSpeed),
                  { width: this.scene.Map.widthInPixels, height: this.scene.Map.heightInPixels },
                  1 - sunlight.night,
                  cloudiness,
              );
        this.drawSkyLayer(view, sky, grid ? veil : undefined, sun, trails);
        this.reflectedSky = this.skyOverWater(sun, sunlight, cloudiness, raining || storm);
        if (paint) this.blocks.end();
        // Only the fog passes over the buildings seen from far.
        if (paint && !(showWeather && weather === WeatherType.Fog)) this.farFog.hide();
        this.scene.markDirty();
    }

    /**
     * Seen from far, the fog over the buildings too (but the room of the avatar), as thick as outdoors once the camera
     * is high enough and fading in on the way (the clouds pass over the roofs at the same zoom, cloudsOverRoofs): a
     * room left clear stood out of the washed map. Over the lights of the lamps, which no longer pierce it. Seen from
     * close, nothing: the rooms stay as they are.
     */
    private paintFarFog(
        view: WeatherView,
        canvas: BlockCanvasArea,
        size: number,
        outdoor: Uint8Array,
        levels: Uint8Array,
        density: number,
        grid: OutdoorGrid | undefined,
        avatarRoom: number | undefined,
    ): void {
        const share = grid ? cloudsOverRoofs(this.screenScale()) : 0;
        if (!grid || share <= 0) {
            this.farFog.hide();
            return;
        }
        // The same cells as the canvas of the clouds (same view, same size).
        this.farFog.begin(view, size);
        const inside = farFogCells(canvas, size, outdoor, (x, y) => grid.roomAt(x, y), avatarRoom);
        if (this.everyCell.length !== inside.length) this.everyCell = new Uint8Array(inside.length).fill(1);
        const veil = FOG_VEIL_ALPHA * density * share;
        this.farFog.paintField(canvas, this.everyCell, inside, NO_SHIFT, FOG_COLOR, () => veil);
        this.farFog.paintField(canvas, levels, inside, NO_SHIFT, FOG_COLOR, (level) => {
            return ((FOG_PATCH_ALPHA * level) / FOG_LEVELS) * density * share;
        });
        this.farFog.end();
    }

    /**
     * A veil of one colour over the outdoors of the view. Its rectangles when they are few (seen from close: exact
     * along the walls); seen from far they are hundreds, drawn again by the engine at every image: the veil is then
     * painted in the canvas of the clouds, a cell at a time, under them.
     */
    private fillVeil(
        canvas: BlockCanvasArea,
        outdoor: Uint8Array,
        veil: readonly WeatherView[],
        color: number,
        alpha: number,
        paint: boolean,
    ): void {
        if (veil.length <= VEIL_MAX_RECTS) {
            this.graphics.fillStyle(color, alpha);
            for (const rect of veil) this.graphics.fillRect(rect.x, rect.y, rect.width, rect.height);
            return;
        }
        // In the canvas of the clouds: painted with them, kept between two of their paintings.
        if (!paint) return;
        if (this.everyCell.length !== outdoor.length) this.everyCell = new Uint8Array(outdoor.length).fill(1);
        this.blocks.paintField(canvas, this.everyCell, outdoor, NO_SHIFT, color, () => alpha);
    }

    /**
     * The outdoors of the view without what a raised floor covers. Reading it is the costly part of a drawing of the
     * weather, and it only changes with the walls, the floors and the view: kept for a view widened to whole steps,
     * so that a rain drawn 30 times a second, or a scroll, does not read the map again each time.
     */
    private veilOver(view: WeatherView, grid: OutdoorGrid, cover: RaisedCover | undefined): WeatherView[] {
        const x = Math.floor(view.x / VEIL_STEP) * VEIL_STEP;
        const y = Math.floor(view.y / VEIL_STEP) * VEIL_STEP;
        const width = Math.ceil((view.x + view.width) / VEIL_STEP) * VEIL_STEP - x;
        const height = Math.ceil((view.y + view.height) / VEIL_STEP) * VEIL_STEP - y;
        const kept = this.veil;
        if (
            kept &&
            kept.grid === grid &&
            kept.cover === cover &&
            kept.x === x &&
            kept.y === y &&
            kept.width === width &&
            kept.height === height
        ) {
            return kept.rects;
        }
        const runs = grid.outdoorRunsInView({ x, y, width, height });
        const rects = cover ? cover.uncovered(runs) : runs;
        this.veil = { grid, cover, x, y, width, height, rects };
        return rects;
    }

    /**
     * Clouds of a clear sky, outdoors only and over everything (avatars and objects too): the grey veil of an overcast
     * sky, the shadows cast away from the sun, then the clouds over them. Each cloud is a cumulus with a sharp edge, lit
     * from the north-west and grey on the other side, white by fine weather, greyer as the
     * sky gets covered and dark at night. A very cloudy sky shows more and greyer clouds, never a sheet over the map.
     * Gone zoomed in (the camera is under them), their shadows kept. Fixed to the map, they glide with the wind whatever the camera.
     */
    private drawClouds(
        view: WeatherView,
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
        paint: boolean,
    ): void {
        if (veilAlpha > 0) this.addVeil(canvas, outdoor, veil, OVERCAST_COLOR, veilAlpha, paint);
        if (this.smoothCloudLayer()) {
            // The clouds of the rain, when it rains, are those the layer draws.
            this.layerClouds ??= this.cloudSky(
                epoch,
                view,
                sky,
                shownCloudiness(cloudiness),
                cloudPalette(cloudiness),
                CLOUD_ALPHA * cloudZoomFade(zoom, this.cloudsHeight),
                sunlight.night,
                shadowOffset && { ...shadowOffset, alpha: CLOUD_SHADOW_ALPHA * sunlight.shadows },
            );
            return;
        }
        if (!paint) return;
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

    /** The cloud layer of the graphics card when it is there and chosen; otherwise the clouds go in the blocks. */
    private smoothCloudLayer(): CloudLayer | undefined {
        return this.smoothClouds ? this.cloudLayer : undefined;
    }

    /**
     * What the water reflects: the sky worked out at the last drawing of the weather and the lamps of the night veil;
     * nothing with the reflections turned off or in Basique.
     */
    public waterReflection(lamps: WaterReflection["lamps"]): WaterReflection {
        if (!this.reflectionsShown || this.basic) return NO_WATER_REFLECTION;
        return { ...this.reflectedSky, lamps };
    }

    /**
     * The sky over the water: its blue by day (greyer under clouds or rain), nothing at night; the clouds the layer
     * drew; the glint of the sun on the waves, towards it, stronger when it is high and the sky clear.
     */
    private skyOverWater(
        sun: SunPosition | undefined,
        sunlight: { night: number; shadows: number },
        cloudiness: number,
        raining: boolean,
    ): Omit<WaterReflection, "lamps"> {
        const day = 1 - sunlight.night;
        const grey = Math.min(1, cloudiness + (raining ? 0.6 : 0));
        const thickness = this.cloudLayer?.reflected();
        const tones = this.layerClouds?.tones;
        const toSun = sun ? sun.azimuth * (Math.PI / 180) : 0;
        return {
            sky: { color: grey > 0.5 ? GREY_SKY : DAY_SKY, share: 0.1 * day },
            clouds: thickness && tones ? { ...thickness, color: tones.lit, share: 0.45 * day + 0.15 } : undefined,
            sun: {
                x: Math.sin(toSun),
                y: -Math.cos(toSun),
                strength: sunlight.shadows * (1 - 0.8 * grey),
            },
        };
    }

    /**
     * Told only when it changes, against what the store holds (not what this manager last told): a scene made again
     * destroys its old manager after the new one told its rainbow, and the button by the clock was left without it.
     */
    private setRainbowSpot(spot: { x: number; y: number } | undefined): void {
        const told = get(rainbowSpotStore);
        if (told?.x === spot?.x && told?.y === spot?.y) return;
        rainbowSpotStore.set(spot);
    }

    /** A veil over the outdoors: drawn by the cloud layer when it is there, in the graphics or the blocks otherwise. */
    private addVeil(
        canvas: BlockCanvasArea,
        outdoor: Uint8Array,
        veil: readonly WeatherView[],
        color: number,
        alpha: number,
        paint: boolean,
    ): void {
        if (this.smoothCloudLayer()) {
            this.layerVeils = [...this.layerVeils, { color, alpha }];
            return;
        }
        this.fillVeil(canvas, outdoor, veil, color, alpha, paint);
    }

    /** The fog for the cloud layer: its patches over the view and a margin, in one flat colour, `body` thick. */
    private fogSky(epoch: number, view: WeatherView, body: number): CloudSky {
        return {
            patches: fogPatches(epoch, layerArea(view), this.reducedMotion),
            tones: { lit: FOG_COLOR, mid: FOG_COLOR, shade: FOG_COLOR },
            body,
            shadow: undefined,
        };
    }

    /** Clouds for the cloud layer: their puffs over the view and a margin, their tones for how night it is. */
    private cloudSky(
        epoch: number,
        view: WeatherView,
        sky: { x: number; y: number },
        shownCover: number,
        palette: CloudPalette,
        body: number,
        night: number,
        shadow: CloudSky["shadow"],
    ): CloudSky {
        const tint = (color: number): { color: number; alpha: number } => cloudTint(color, body, night);
        return {
            patches: cloudPatches(epoch, layerArea(view), shownCover, this.reducedMotion, sky),
            cumulus: true,
            tones: { lit: tint(palette.lit).color, mid: tint(palette.mid).color, shade: tint(palette.shade).color },
            body: tint(palette.mid).alpha,
            shadow,
        };
    }

    /** The clouds and veils gathered for the cloud layer this time; hidden when there is none, or no layer. */
    private drawSkyLayer(
        view: WeatherView,
        sky: { x: number; y: number },
        outdoors: readonly WeatherView[] | undefined,
        sun: SunPosition | undefined,
        trails: readonly Contrail[],
    ): void {
        const layer = this.smoothCloudLayer();
        if (
            !layer ||
            (!this.layerClouds && this.layerVeils.length === 0 && this.layerRainbow <= 0 && trails.length === 0)
        ) {
            this.cloudLayer?.hide();
            this.setRainbowSpot(undefined);
            return;
        }
        const rainbow =
            this.layerRainbow > 0 && sun
                ? {
                      ...rainbowPlacement(
                          { width: this.scene.Map.widthInPixels, height: this.scene.Map.heightInPixels },
                          sun,
                      ),
                      strength: this.layerRainbow,
                  }
                : undefined;
        // The top of its arc: where the button by the clock takes the avatar.
        this.setRainbowSpot(
            rainbow && {
                x: Math.round(rainbow.x + rainbow.direction.x * rainbow.radius),
                y: Math.round(rainbow.y + rainbow.direction.y * rainbow.radius),
            },
        );
        layer.draw({
            view,
            sky,
            clouds: this.layerClouds,
            veils: this.layerVeils,
            outdoors,
            overRoofs: this.layerOverRoofs ? (this.roofs?.share ?? 0) : 0,
            rainbow,
            still: this.reducedMotion,
            contrails: trails,
        });
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
            const { roofs } = this;
            if (roofs) {
                const over = cloudTint(color, body * roofs.share, night);
                this.blocks.paintField(field, tone, roofs.cells, NO_SHIFT, over.color, (level) =>
                    cloudAlpha(level, over.alpha),
                );
            }
        }
    }

    /** The wind the drops go with now: the real one, caught within a second (followWind); at once if motion is reduced. */
    private rainWindAt(now: number, target: RainWind): RainWind {
        const kept = this.rainWind;
        const wind =
            kept && !this.reducedMotion ? followWind(kept.wind, target, Math.max(0, now - kept.at) / 1000) : target;
        this.rainWind = { wind, at: now };
        return wind;
    }

    /**
     * The rain: drops in three planes leaning with the wind, each a faint streak ending in a brighter head, and the
     * splashes of those reaching the ground (none when motion is reduced). Outdoors only, over everything.
     */
    private drawRain(
        epoch: number,
        view: WeatherView,
        intensity: number,
        wind: RainWind,
        isOutdoor: ((x: number, y: number) => boolean) | undefined,
        local: RainLocal | undefined,
    ): void {
        const amount = intensity * this.rainSettings.amount;
        // Seen from very close the rain is worked out on a finer grid than the map, then brought back to it: the
        // drops keep on screen the size and the number they have at a usual zoom.
        const fine = rainFineness(this.screenScale());
        const finer =
            fine === 1
                ? view
                : { x: view.x * fine, y: view.y * fine, width: view.width * fine, height: view.height * fine };
        const localFine: RainLocal | undefined = local && fine !== 1 ? (x, y) => local(x / fine, y / fine) : local;
        // A drop shows where its whole streak is outdoors (head, middle and tail): no trail over the edge of a roof.
        const drops = rainDrops(epoch, finer, amount, wind, localFine)
            .map((drop) =>
                fine === 1 ? drop : { ...drop, x: drop.x / fine, y: drop.y / fine, length: drop.length / fine },
            )
            .filter(
                (drop) =>
                    !isOutdoor ||
                    [0, 0.5, 1].every((share) =>
                        isOutdoor(drop.x - drop.dx * drop.length * share, drop.y - drop.dy * drop.length * share),
                    ),
            );
        for (let layer = 0; layer < 3; layer++) {
            const plane = drops.filter((drop) => drop.layer === layer);
            if (plane.length === 0) continue;
            // The whole streak faint, then its lower half again: a bright head with a trail.
            for (const [share, fade] of [
                [1, 0.45],
                [0.5, 1],
            ] as const) {
                // The near drops are thicker: they read as closer.
                this.graphics.lineStyle((layer === 2 ? 1.5 : 1) / fine, RAIN_COLOR, plane[0].alpha * fade);
                this.graphics.beginPath();
                for (const drop of plane) {
                    const height = drop.length * share;
                    this.graphics.moveTo(drop.x - drop.dx * height, drop.y - drop.dy * height);
                    this.graphics.lineTo(drop.x, drop.y);
                }
                this.graphics.strokePath();
            }
        }
        if (this.reducedMotion) return;
        const splashing = intensity * this.rainSettings.splashes;
        const lakes = this.scene.getTerrainWater?.();
        const time = this.scene.time.now;
        // The splashes as the drops: on the finer grid, brought back to the map, each this many times smaller.
        const dot = 1 / fine;
        const splashes = rainSplashes(epoch, finer, splashing, localFine).map((splash) =>
            fine === 1 ? splash : { ...splash, x: splash.x / fine, y: splash.y / fine },
        );
        for (const splash of keepOutdoorParticles(splashes, isOutdoor)) {
            if (lakes && lakes.depthAt(splash.x, splash.y, time) > 0) {
                // On the water of the relief a drop leaves a ring that widens and fades.
                this.graphics.lineStyle(dot, RAIN_COLOR, SPLASH_ALPHAS[splash.stage]);
                this.graphics.strokeCircle(splash.x, splash.y, (1.5 + splash.stage * 1.5) * dot);
                continue;
            }
            this.graphics.fillStyle(RAIN_COLOR, SPLASH_ALPHAS[splash.stage]);
            if (splash.stage === 0) {
                this.graphics.fillRect(splash.x, splash.y, dot, dot);
            } else {
                const spread = (splash.stage + 1) * dot;
                this.graphics.fillRect(splash.x - spread, splash.y - dot, dot, dot);
                this.graphics.fillRect(splash.x + spread, splash.y - dot, dot, dot);
                if (splash.stage === 1) this.graphics.fillRect(splash.x, splash.y, dot, dot);
            }
        }
    }

    /**
     * The snow: flakes of the kinds the air makes, carried by the wind near the ground and falling about a metre a
     * second (Snowfall.ts), outdoors only, over everything; standing still when motion is reduced. No splash: a flake
     * lies a moment where it lands, the snow on the ground is drawn apart (SnowGround, TerrainView).
     */
    private drawSnow(
        epoch: number,
        view: WeatherView,
        fall: SnowFall,
        windFrom: number | undefined,
        windSpeed: number | undefined,
        night: number,
        isOutdoor: ((x: number, y: number) => boolean) | undefined,
        local: RainLocal | undefined,
    ): void {
        const velocity = groundWind(windFrom, windSpeed, this.rainSettings.lean);
        // The air goes on with the wind, without a jump when the wind changes; still when motion is reduced.
        const air = this.reducedMotion
            ? { shift: { x: 0, y: 0 }, velocity }
            : { shift: this.snowDrift.at(epoch, velocity), velocity };
        // Seen from very close, worked out on a finer grid like the rain: a flake keeps its size on the screen.
        const fine = rainFineness(this.screenScale());
        const finer =
            fine === 1
                ? view
                : { x: view.x * fine, y: view.y * fine, width: view.width * fine, height: view.height * fine };
        const localFine: RainLocal | undefined = local && fine !== 1 ? (x, y) => local(x / fine, y / fine) : local;
        const tones = snowTones(night);
        const pixel = 1 / fine;
        for (const flake of snowflakes(epoch, finer, fall, air, localFine, this.reducedMotion)) {
            const x = flake.x / fine;
            const y = flake.y / fine;
            if (isOutdoor && !isOutdoor(x, y)) continue;
            drawFlake(this.graphics, x, y, flake.size, flake.alpha * tones.alpha, tones, pixel);
        }
    }

    /**
     * The puddles of a ground this wet (0: none), outdoors only: drawn on the ground once, then again only when the
     * wetness, the personal size or the part of the map on the screen changes.
     */
    private drawPuddles(wetness: number): void {
        const size = this.rainSettings.puddles;
        // Seen from far a puddle is a dot, and the whole map holds so many of them that drawing them again at every
        // image took most of the time of an image: none under this scale.
        if (wetness <= 0 || size <= 0 || seenFromFar(this.scene)) {
            this.lastPuddleKey = "";
            this.hidePuddles();
            return;
        }
        const camera = this.scene.cameras.main.worldView;
        // Whole screens around the camera: a scroll rarely asks for a new drawing.
        const left = Math.floor(camera.x / camera.width - 0.5) * camera.width;
        const top = Math.floor(camera.y / camera.height - 0.5) * camera.height;
        const key = [left, top, camera.width, camera.height, Math.round(wetness * 100), size].join("|");
        if (key === this.lastPuddleKey) return;
        this.lastPuddleKey = key;
        const view = { x: left, y: top, width: camera.width * 2.5, height: camera.height * 2.5 };
        const grid = this.options.outdoorGrid?.();
        const cover = grid ? this.options.raisedCover?.() : undefined;
        const terrain = this.scene.getGameMap().getWamFile()?.getWam().terrain;
        // Where the ground has a relief, its own water is drawn (TerrainView): no puddle there.
        const outdoors = (x: number, y: number): boolean =>
            (!grid || (grid.isOutdoorAt(x, y) && cover?.has(x, y) !== true)) &&
            heightAt(terrain, Math.floor(x / TERRAIN_CELL), Math.floor(y / TERRAIN_CELL)) === 0;
        const puddles = puddlesIn(view, wetness, size).filter((puddle) =>
            // A puddle lies whole outdoors, never across a wall.
            [
                [0, 0],
                [-1, 0],
                [1, 0],
                [0, -1],
                [0, 1],
            ].every(([x, y]) => outdoors(puddle.x + x * puddle.radiusX, puddle.y + y * puddle.radiusY)),
        );
        if (puddles.length === 0) {
            this.hidePuddles();
            return;
        }
        this.puddleGraphics.clear().setVisible(true);
        this.puddlesVisible = true;
        for (const puddle of puddles) {
            const rows = puddleRows(puddle);
            this.puddleGraphics.fillStyle(PUDDLE_COLOR, 0.3);
            for (const row of rows) this.puddleGraphics.fillRect(row.x, row.y, row.width, PUDDLE_ROW);
            // The sky on the far edge of the water, the wet earth under the near one.
            const [first, last] = [rows[0], rows[rows.length - 1]];
            if (!first || first.width < 6) continue;
            this.puddleGraphics.fillStyle(RAIN_COLOR, 0.3);
            this.puddleGraphics.fillRect(first.x + 2, first.y, first.width - 4, 1);
            this.puddleGraphics.fillStyle(PUDDLE_EDGE_COLOR, 0.3);
            this.puddleGraphics.fillRect(last.x + 2, last.y + PUDDLE_ROW - 1, last.width - 4, 1);
        }
        this.scene.markDirty();
    }

    private hidePuddles(): void {
        if (!this.puddlesVisible) return;
        this.puddleGraphics.clear().setVisible(false);
        this.puddlesVisible = false;
        this.scene.markDirty();
    }

    /** How much of the clouds shows at this zoom, at the height this person set for them. */
    private zoomFade(): number {
        return cloudZoomFade(this.screenScale(), this.cloudsHeight);
    }

    private screenScale(): number {
        return screenScale(this.scene);
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
        this.puddleGraphics.destroy();
        this.blocks.destroy();
        this.farFog.destroy();
        this.cloudLayer?.destroy();
        this.setRainbowSpot(undefined);
    }
}

/** The colour of the sky the water reflects: blue by fine weather, grey under a covered or rainy sky. */
const DAY_SKY = 0x8fb9e6;
const GREY_SKY = 0x9aa3ad;

/** What the cloud layer covers: the view and CLOUD_LAYER_MARGIN around it. */
function layerArea(view: WeatherView): WeatherView {
    return {
        x: view.x - CLOUD_LAYER_MARGIN,
        y: view.y - CLOUD_LAYER_MARGIN,
        width: view.width + 2 * CLOUD_LAYER_MARGIN,
        height: view.height + 2 * CLOUD_LAYER_MARGIN,
    };
}
