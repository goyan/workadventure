import { derived, get, type Unsubscriber } from "svelte/store";
import type { AreaData } from "@workadventure/map-editor";
import LL, { locale } from "../../../../i18n/i18n-svelte";
import { localUserStore } from "../../../Connection/LocalUserStore";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import {
    NightMode,
    ambienceFullShareStore,
    mapTimeZoneStore,
    nightDarknessStore,
    nightDateStore,
    nightInEditorStore,
    effectiveNightModeStore,
    worldCityStore,
    worldCustomMinutesStore,
    worldMomentStore,
    worldPointStore,
    realFalloffStore,
    realisticNightStore,
    shownAmbienceStrengthStore,
    shownLightBounceStore,
    shownLightSoftEdgeStore,
    shownSecondBounceStore,
} from "../../../Stores/NightStore";
import { skyLightSettingsStore } from "../../../Stores/SkyLightStore";
import { partyRoomsStore } from "../../../Stores/LampEffectsStore";
import { rgbLampLightsStore, type RgbLampLight } from "../../../Stores/RgbLampStore";
import { skyWindowLightsStore } from "../../../Stores/SkyWindowLightStore";
import { torchLightsStore } from "../../../Stores/TorchStore";
import type { GameScene } from "../GameScene";
import { shownMapPlace } from "../Weather/RealWeatherClient";
import {
    setLightBounceStrength,
    setLightRealFalloff,
    setLightSecondBounce,
    setLightSoftEdgePx,
} from "../Lamps/LightSoftEdge";
import {
    forcedSunMinutes,
    NIGHT_MAX_OPACITY,
    nightOpacityAt,
    nightOpacityWith,
    parisCalendarDay,
    parisWallClockToInstant,
    parseNightAt,
    sunForClouds,
    sunPlaceOf,
    sunPositionAt,
} from "./NightClock";
import type { SunPosition } from "./NightClock";
import { roomAmbience, type AmbienceSettings } from "./AmbientLight";
import { moonPhaseAt, moonPositionAt } from "./MoonClock";
import { halosWhereDrawn, NightHalos } from "./NightHalos";
import { placeOfPoint, worldCityOf } from "./WorldDaylight";
import type { PointWords, WorldPlace } from "./WorldDaylight";
import { coversMostly, isInLightableArea, lightableAreas, NightLights, roomsThatLightUp } from "./NightLights";
import type { LitArea, NightRect } from "./NightLights";
import { NightOverlay } from "./NightOverlay";
import { nightHiddenInEditor, nightRenderAction } from "./NightRenderDecision";
import type { NightFrame } from "./NightRenderDecision";
import { ServerNightClock } from "./ServerNightClock";
import { moonlitNightOpacity, skyLightAt } from "./SkyLight";
import type { SkyLight, SkyLightSettings } from "./SkyLight";

/** The sun only moves the veil during dusk and dawn, over half an hour or more: once a second is plenty. */
const CLOCK_INTERVAL_MS = 1000;

/**
 * Night mode of the map: darkens the scene in the evening, lights the areas where someone is and carries a halo of
 * light around every player.
 * The server supplies the clock; lighting is drawn locally from the players known by this browser.
 */
export class NightManager {
    private readonly overlay: NightOverlay;
    private readonly lights = new NightLights();
    private readonly halos = new NightHalos();
    private readonly clock = new ServerNightClock();
    // Halo id of the local player; remote players use their MapPlayersByKey key.
    private readonly localId = localUserStore.getLocalUser()?.uuid ?? "local";
    // Development override of the clock (`?nightAt=HH:MM`), fixed for the life of the scene.
    private readonly forcedMinutes: number | undefined;
    private readonly unsubscribeEditor: Unsubscriber;
    private readonly unsubscribeMode: Unsubscriber;
    private readonly unsubscribeWorld: Unsubscriber;
    /** The city whose sky is shown (NightMode.World), kept while it stays near the moment chosen. */
    private worldCity: WorldPlace | undefined;
    private readonly unsubscribeParty: Unsubscriber;
    private readonly unsubscribeLamps: Unsubscriber;
    private readonly unsubscribeTorches: Unsubscriber;
    private readonly unsubscribeSkyLight: Unsubscriber;
    private skyLightSettings: SkyLightSettings | undefined;
    private readonly unsubscribeWindows: Unsubscriber;
    private partyRooms: readonly NightRect[] = [];
    // The lights of the RGB lamps and of the torches, each written by its own owner, and both together.
    private rgbLamps: readonly RgbLampLight[] = [];
    private torches: readonly RgbLampLight[] = [];
    // The moonlight that comes in through the windows (SkyWindowLightManager).
    private windows: readonly RgbLampLight[] = [];
    private lamps: readonly RgbLampLight[] = [];
    private areas: AreaData[] = [];
    private editorOpen = false;
    private keptInEditor = false;
    private readonly unsubscribeKeptInEditor: Unsubscriber;
    private mode = NightMode.Server;
    private disabled = false;
    private realistic = false;
    private readonly unsubscribeRealistic: Unsubscriber;
    private readonly unsubscribeDarkness: Unsubscriber;
    private readonly unsubscribeIndirect: Unsubscriber;
    private ambienceSettings: AmbienceSettings = { strength: 0, fullShare: 1 };
    // The light bounced around the rooms, worked out again only when the lights, the rooms or the setting changed.
    private ambience:
        | {
              lamps: readonly RgbLampLight[];
              areas: readonly AreaData[];
              settings: AmbienceSettings;
              lit: readonly LitArea[];
          }
        | undefined;
    private darkness = NIGHT_MAX_OPACITY;
    private opacity = 0;
    private lastClockAt: number | undefined;
    private sun: SunPosition | undefined;
    private light: SkyLight | undefined;
    private previous: NightFrame | undefined;

    /**
     * `skyWeather`: the share of the direct light of the sky the weather lets through (skyWeatherFactor), 1 by
     * default.
     */
    constructor(
        private readonly scene: GameScene,
        private readonly skyWeather: () => number = () => 1,
    ) {
        this.overlay = new NightOverlay(scene);
        this.forcedMinutes = parseNightAt(window.location.search, import.meta.env.DEV);
        this.readAreas();
        this.unsubscribeEditor = mapEditorModeStore.subscribe((open) => {
            // Areas may have been added, moved or removed in the editor.
            if (this.editorOpen && !open) {
                this.readAreas();
            }
            this.editorOpen = open;
        });
        this.unsubscribeKeptInEditor = nightInEditorStore.subscribe((kept) => {
            this.keptInEditor = kept;
            this.scene.markDirty();
        });
        this.unsubscribeParty = partyRoomsStore.subscribe((rooms) => {
            this.partyRooms = rooms;
            this.scene.markDirty();
        });
        this.unsubscribeLamps = rgbLampLightsStore.subscribe((lamps) => {
            this.rgbLamps = lamps;
            this.lamps = [...this.rgbLamps, ...this.torches, ...this.windows];
            this.scene.markDirty();
        });
        this.unsubscribeTorches = torchLightsStore.subscribe((torches) => {
            this.torches = torches;
            this.lamps = [...this.rgbLamps, ...this.torches, ...this.windows];
            this.scene.markDirty();
        });
        this.unsubscribeWindows = skyWindowLightsStore.subscribe((windows) => {
            this.windows = windows;
            this.lamps = [...this.rgbLamps, ...this.torches, ...this.windows];
            this.scene.markDirty();
        });
        this.unsubscribeSkyLight = skyLightSettingsStore.subscribe((settings) => {
            this.skyLightSettings = settings;
            // A setting changed: the light is computed again at the next image, not at the next second.
            this.lastClockAt = undefined;
            this.scene.markDirty();
        });
        const unsubscribeStrength = shownAmbienceStrengthStore.subscribe((strength) => {
            // A new object: the bounced light is worked out again, and the veil drawn again.
            this.ambienceSettings = { ...this.ambienceSettings, strength };
            this.scene.markDirty();
        });
        const unsubscribeFullShare = ambienceFullShareStore.subscribe((fullShare) => {
            this.ambienceSettings = { ...this.ambienceSettings, fullShare };
            this.scene.markDirty();
        });
        const unsubscribeSoftEdge = shownLightSoftEdgeStore.subscribe((px) => {
            // The lights are drawn again with their new edge.
            setLightSoftEdgePx(px);
            this.scene.markDirty();
        });
        const unsubscribeBounce = shownLightBounceStore.subscribe((strength) => {
            // The lamps are cast again with what their walls send back.
            setLightBounceStrength(strength);
            this.scene.markDirty();
        });
        const unsubscribeSecondBounce = shownSecondBounceStore.subscribe((on) => {
            setLightSecondBounce(on);
            this.scene.markDirty();
        });
        const unsubscribeRealFalloff = realFalloffStore.subscribe((on) => {
            setLightRealFalloff(on);
            this.scene.markDirty();
        });
        this.unsubscribeIndirect = () => {
            unsubscribeRealFalloff();
            unsubscribeSecondBounce();
            unsubscribeBounce();
            unsubscribeStrength();
            unsubscribeFullShare();
            unsubscribeSoftEdge();
        };
        this.unsubscribeDarkness = nightDarknessStore.subscribe((darkness) => {
            this.darkness = darkness;
            // The veil is worked out again at the next image, not at the next second.
            this.lastClockAt = undefined;
            this.scene.markDirty();
        });
        this.unsubscribeRealistic = realisticNightStore.subscribe((realistic) => {
            this.realistic = realistic;
            // The rooms fade in or out at the next image.
            this.previous = undefined;
            this.scene.markDirty();
        });
        // Basique is the diffuse light of day, whatever the night chosen.
        this.unsubscribeMode = effectiveNightModeStore.subscribe((mode) => {
            this.mode = mode;
            this.disabled = mode === NightMode.Disabled;
            this.lastClockAt = undefined;
            this.scene.markDirty();
        });
        // Another moment of the sky of the world: its city and its light at once.
        this.unsubscribeWorld = derived(
            [worldMomentStore, worldCustomMinutesStore, worldPointStore],
            (values) => values,
        ).subscribe(() => {
            this.worldCity = undefined;
            this.lastClockAt = undefined;
            this.scene.markDirty();
        });
    }

    public update(now: number): void {
        if (this.lastClockAt === undefined || now - this.lastClockAt >= CLOCK_INTERVAL_MS) {
            this.lastClockAt = now;
            const date = this.mode === NightMode.Computer ? new Date() : this.clock.now();
            nightDateStore.set(date);
            const sunAt = this.sunInstant(date);
            // The sun of the place of the map (Paris when it has none), shared with its real weather.
            const mapPlace = shownMapPlace(this.scene.getGameMap().getWamFile()?.getWam().settings);
            // The sky of the world: the point chosen on its map, or the city where it is now the moment chosen (the height of
            // its sun for the morning, noon and the evening, its solar time for an hour chosen).
            const point = get(worldPointStore);
            this.worldCity =
                this.mode !== NightMode.World || !date
                    ? undefined
                    : point
                      ? placeOfPoint(point, pointWords())
                      : worldCityOf(date, get(worldMomentStore), get(worldCustomMinutesStore), this.worldCity);
            worldCityStore.set(this.worldCity);
            // The clock shown follows the time of the place of the map (of the city of the world).
            mapTimeZoneStore.set(this.worldCity?.timezone ?? mapPlace?.timezone);
            const place =
                this.worldCity ??
                sunPlaceOf(this.mode === NightMode.Computer || this.sunMinutes() !== undefined, mapPlace);
            // The same sun lights the clouds and casts their shadows (WeatherManager).
            this.sun = sunAt === undefined ? undefined : sunPositionAt(sunAt, place);
            // The light of the sky, at the same instant and place: the sun, or the moon at night. With the night
            // turned off the map stays in daylight: the sun alone, while it is up, as for the clouds.
            this.light =
                sunAt === undefined
                    ? undefined
                    : skyLightAt(
                          sunForClouds(this.sun, this.disabled),
                          this.disabled ? undefined : moonPositionAt(sunAt, place),
                          moonPhaseAt(sunAt).illuminated,
                          this.skyWeather(),
                          this.skyLightSettings,
                      );
            // A bright moon takes a little of the veil away.
            this.opacity =
                sunAt === undefined
                    ? 0
                    : moonlitNightOpacity(nightOpacityWith(nightOpacityAt(sunAt, place), this.darkness), this.light);
        }

        // By day, in the editor or when turned off, nothing else is computed.
        const hiddenInEditor = nightHiddenInEditor(this.editorOpen, this.keptInEditor);
        if (this.opacity === 0 || hiddenInEditor || this.disabled) {
            if (this.previous !== undefined) {
                this.overlay.hide();
                this.previous = undefined;
                // Lit areas fade in again when the veil comes back.
                this.lights.reset();
                this.halos.reset();
                // The game only renders dirty scenes: without this, an idle scene would keep showing the veil.
                this.scene.markDirty();
            }
            return;
        }

        const players = this.players();
        const putOut = (area: NightRect): boolean => this.partyRooms.some((room) => coversMostly(area, room));
        // With the realistic lighting no room lights up on its own: only the lamps pierce the veil.
        const rooms = roomsThatLightUp(this.areas, this.realistic);
        const lit = this.lights.update(now, rooms, players, putOut);
        // No halo in a lit area: the area already lights the player. In a room put out for a party, the player
        // keeps their halo: they stay visible under the effects.
        const lightingAreas = rooms.filter((area) => !putOut(area));
        // The rooms are lit by where the players are; their halos are drawn where they are drawn (lower in a hollow of
        // a relief seen in 3/4, higher on a mount).
        const drops = new Map(players.map((player) => [player.id, player.drop]));
        const halos = halosWhereDrawn(
            this.halos.update(
                now,
                players.map((player) => ({ ...player, sheltered: isInLightableArea(player, lightingAreas) })),
            ),
            (id) => drops.get(id) ?? 0,
        );
        const camera = this.scene.cameras.main;
        const frame: NightFrame = {
            opacity: this.opacity,
            editorOpen: hiddenInEditor,
            disabled: this.disabled,
            view: {
                x: camera.worldView.x,
                y: camera.worldView.y,
                width: camera.worldView.width,
                height: camera.worldView.height,
                zoom: camera.zoom,
            },
            // A room a light comes into is lit faintly all over, unless it was put out for a party.
            lit: [...lit, ...this.roomAmbience().filter((area) => !putOut(area))],
            halos,
            lamps: this.lamps,
            fading: this.lights.isFading() || this.halos.isAnimating(),
        };

        // "hidden" cannot happen here: those cases returned above.
        if (nightRenderAction(frame, this.previous) === "draw") {
            this.overlay.draw(frame);
            // Fades, dusk and dawn change the veil while nothing else moves: ask for a render.
            this.scene.markDirty();
        }
        this.previous = frame;
    }

    /** The night veil for the water that reflects the light of the lamps (NightOverlay); undefined by day. */
    public lampReflection(): ReturnType<NightOverlay["reflected"]> {
        return this.overlay.reflected();
    }

    public isNight(): boolean {
        return this.opacity > 0 && !this.disabled;
    }

    /** Where the sun of the map is, at the instant and place of the night (updated once a second). */
    public sunPosition(): SunPosition | undefined {
        return sunForClouds(this.sun, this.disabled);
    }

    /** The light bounced around the rooms the lights come into (see roomAmbience), as areas to cut out of the veil. */
    private roomAmbience(): readonly LitArea[] {
        const { ambience } = this;
        if (
            ambience !== undefined &&
            ambience.lamps === this.lamps &&
            ambience.areas === this.areas &&
            ambience.settings === this.ambienceSettings
        ) {
            return ambience.lit;
        }
        const lit = roomAmbience(
            this.areas,
            this.lamps.map((lamp) => ({
                polygon: lamp.polygon,
                intensity: lamp.ambient ?? lamp.intensity,
                elevation: lamp.elevation,
            })),
            this.ambienceSettings,
        );
        this.ambience = { lamps: this.lamps, areas: this.areas, settings: this.ambienceSettings, lit };
        return lit;
    }

    /**
     * The light of the sky that casts the shadows (SkyLight), at the instant and place of the night (updated once a
     * second); undefined without one.
     */
    public skyLight(): SkyLight | undefined {
        return this.light;
    }

    public serverDate(): Date | undefined {
        return this.clock.now();
    }

    public destroy(): void {
        this.clock.destroy();
        nightDateStore.set(undefined);
        mapTimeZoneStore.set(undefined);
        this.unsubscribeEditor();
        this.unsubscribeMode();
        this.unsubscribeWorld();
        worldCityStore.set(undefined);
        this.unsubscribeRealistic();
        this.unsubscribeDarkness();
        this.unsubscribeKeptInEditor();
        this.unsubscribeIndirect();
        this.unsubscribeParty();
        this.unsubscribeLamps();
        this.unsubscribeTorches();
        this.unsubscribeSkyLight();
        this.unsubscribeWindows();
        this.overlay.destroy();
    }

    /**
     * The instant whose sun lights the map. Server: the server's instant, for the sun of the place of the map.
     * Computer: the date and time shown by the computer, in its own time zone, read as if they were Paris time (a
     * computer showing 22:00 sees the night of Paris at 22:00 that day, whatever the place of the map: sunPlaceOf).
     * `?nightAt=HH:MM` (development): that Paris time, on today's date in Paris, for the sun of Paris too.
     */
    private sunInstant(date: Date | undefined): Date | undefined {
        const forced = this.sunMinutes();
        if (forced !== undefined) {
            const { year, month, day } = parisCalendarDay(date ?? new Date());
            return parisWallClockToInstant(year, month, day, forced);
        }
        if (date === undefined || this.mode !== NightMode.Computer) {
            return date;
        }
        const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
        return parisWallClockToInstant(date.getFullYear(), date.getMonth() + 1, date.getDate(), minutes);
    }

    private sunMinutes(): number | undefined {
        return forcedSunMinutes(this.forcedMinutes, this.mode === NightMode.Always);
    }

    private readAreas(): void {
        const map = this.scene.getGameMapFrontWrapper().getMap();
        const mapWidth = (map.width ?? 0) * (map.tilewidth ?? 32);
        const mapHeight = (map.height ?? 0) * (map.tileheight ?? 32);
        const areas = this.scene.getGameMap().getWamFile()?.getGameMapAreas()?.getAreas().values() ?? [];
        this.areas = lightableAreas(areas, mapWidth, mapHeight);
    }

    private players(): { id: string; x: number; y: number; z: number; drop: number }[] {
        // Raw sprite positions, as given to GameMapFrontWrapper.setPosition: NightLights adds the feet offset, the
        // halos are centred on them (the body). Animals are not players: they carry no light.
        // With the floor each one stands on: an area is lit by the players of its floor.
        const local = this.scene.CurrentPlayer;
        const players = [
            { id: this.localId, x: local.x, y: local.y, z: local.getFloorZ(), drop: local.getGroundDrop?.() ?? 0 },
        ];
        for (const [key, player] of this.scene.MapPlayersByKey) {
            players.push({
                id: String(key),
                x: player.x,
                y: player.y,
                z: player.getFloorZ(),
                drop: player.getGroundDrop?.() ?? 0,
            });
        }
        return players;
    }
}

/** The words a point of the map of the world far from any city is named with, in the language of the player. */
function pointWords(): PointWords {
    const words = get(LL).menu.settings.night;
    const kilometres = new Intl.NumberFormat(get(locale) || undefined, { maximumFractionDigits: 0 });
    return {
        north: words.pointNorth(),
        south: words.pointSouth(),
        east: words.pointEast(),
        west: words.pointWest(),
        far: (point, city, distance) => words.pointFar({ point, city, distance }),
        short: (city, distance) => words.pointShort({ city, distance }),
        kilometres: (km) => kilometres.format(km),
    };
}
