import { isHomeJam, type AreaData } from "@workadventure/map-editor";
import type { SpotifyListening } from "@workadventure/messages";
import type { Unsubscriber } from "svelte/store";
import { joinedJamStore, type JoinedJam } from "../../../ListeningZone/ListeningZoneStore";
import { spotifyTrackUri } from "../../../../common/SpotifyListening";
import { jamAudioSession } from "../../../ListeningZone/GameJamAudioSession";
import { jamMusicCapture, type SharedJamMusic } from "../../../ListeningZone/JamMusicCapture";
import { jamMusicStreamsStore } from "../../../ListeningZone/JamMusicStore";
import {
    allJamRoomsStore,
    jamParticipantsCountStore,
    type JamRoom,
} from "../../../ListeningZone/ListeningZoneController";
import { listeningByUserUuidStore } from "../../../Spotify/SpotifyListeningDirectory";
import { lampDemoEnabledStore } from "../../../Stores/LampDemoStore";
import { lampEffectsEnabledStore, partyRoomsStore } from "../../../Stores/LampEffectsStore";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import { lightableAreas } from "../Night/NightLights";
import type { Entity } from "../../ECS/Entity";
import { DEPTH_LAMP_LIGHT_INDEX } from "../DepthIndexes";
import { FLOOR_OBJECT_DEPTH } from "../../ECS/EntityLayerDepth";
import type { GameScene } from "../GameScene";
import { SpotifyMusicSignal } from "./SpotifyMusicSignal";
import {
    jamOfSpaces,
    lampJamsOf,
    lampLightZone,
    resolveLampJam,
    toLampZone,
    type LampJam,
    type LampJamChoice,
    type LampZone,
    zoneOf,
} from "./LampJam";
import { resolveLampDemo } from "./LampDemo";
import { danceFloorBounds, lampSizeOf, lampSource, planLamps } from "./LampReconcile";
import { DanceFloorEngine } from "./DanceFloorEngine";
import { danceFloorGrid, danceFloorSeed, type FloorGrid } from "./DanceFloorPatterns";
import { DanceFloorVisual } from "./DanceFloorVisual";
import { nextBrightness } from "./LampStyle";
import type { LampFrame, LampSignalSource } from "./LampSignal";
import { isSilentFrame, SpectrumSignalSource } from "./LampSignal";
import { ensureLampTextures } from "./LampTextures";
import { StreamSpectrum } from "./StreamSpectrum";
import { LampZoneLights, type RoomAmbience } from "./LampZoneLights";
import { RgbLamps } from "./RgbLamps";
import { syntheticSpectrum } from "./SyntheticBeat";
import { createLamp, PALETTE, type LampKind, type LampVisual } from "./LampVisuals";

/** What the lamps of one room do at this image: the room is lit and coloured from it. */
interface RoomBeat {
    zone: LampZone;
    darkness: number;
    beat: boolean;
    bar: boolean;
    bass: number;
    level: number;
}

/** Above the night veil: lamps glow at night, and are a light touch by day. */
const LAMP_DEPTH = DEPTH_LAMP_LIGHT_INDEX;
/** Where a playing room is darkened: over its floor (and rugs), under the players and the furniture standing on it. */
const ROOM_SHADE_DEPTH = FLOOR_OBJECT_DEPTH + 0.5;
/** A dance floor shines in the dark: over the darkness of its room, still under the players. */
const DANCE_FLOOR_DEPTH = ROOM_SHADE_DEPTH + 0.1;
const DEMO_KINDS: LampKind[] = ["spot", "disco", "neon", "strobe"];
/** Tiles are 32 px: the demo lamps stand three tiles above the player, a lamp every three tiles. */
const DEMO_SPACING_PX = 96;
const DEMO_OFFSET_Y_PX = -96;
/** The objects of the map, and the Jam each lamp follows, are looked at this often. */
const RECONCILE_INTERVAL_MS = 250;
/** No music: nothing moves. */
const IDLE_FRAME: LampFrame = { bass: 0, mid: 0, treble: 0, beat: false };
/** In the map editor: a steady light, so that the one who places a lamp sees where it falls. */
const EDITOR_FRAME: LampFrame = { bass: 0.5, mid: 0.6, treble: 0.5, beat: false };
const LISTENING_ZONE_PROPERTY = "listeningZonePropertyData";

interface PlacedLamp {
    kind: LampKind;
    visual: LampVisual;
    entity: Entity;
    /** The Jam this lamp follows now, by the rule of LampJam; undefined: off. */
    jam: LampJamChoice | undefined;
    /** What its light is kept in: its listening zone, or a square of its own when it stands in none. */
    zoneId: string;
    /** The listening zone (room) it stands in: the room put out while it plays. */
    room: LampZone | undefined;
    /** How bright it is, from 0 to 1: it rises quickly and dies away slowly (see nextBrightness). */
    brightness: number;
    lastUpdateAt: number | undefined;
    /** A mirror ball draws its own turning body: the object's flat sprite is hidden under it (not in the editor). */
    bodyHidden: boolean;
}

/** A dance floor of the map: tiles that light up in patterns, on the music of its Jam when one plays. */
interface PlacedFloor {
    entity: Entity;
    visual: DanceFloorVisual;
    engine: DanceFloorEngine | undefined;
    grid: FloorGrid;
    /** The Jam this floor follows now, by the rule of LampJam; undefined: it goes through its patterns by itself. */
    jam: LampJamChoice | undefined;
    /** When the floor last heard its music: a short silence does not send it back to its own patterns. */
    heardAt: number | undefined;
}

/** A silence of the music this long, and the floor goes back to its own patterns. */
const FLOOR_SILENCE_MS = 2000;

/**
 * The kind of light an object carries; a dance floor is not a light, it has its own way (see PlacedFloor), and so has
 * an RGB lamp, which does not follow the music.
 */
function lightKindOf(entity: Entity): LampKind | undefined {
    const kind = entity.getPrefab().lamp?.kind;
    return kind === "dancefloor" || kind === "rgb" ? undefined : kind;
}

function isDanceFloor(entity: Entity): boolean {
    return entity.getPrefab().lamp?.kind === "dancefloor";
}

/** The music of a Jam being read: the stream it comes from, and what listens to it. */
interface ReadMusic {
    stream: MediaStream;
    spectrum: StreamSpectrum;
    signal: SpectrumSignalSource;
}

/**
 * Lamps that follow the music. The objects of the map whose catalog entry says `lamp` carry one, wherever they are
 * put and moved (in the editor too: the light follows the drag). Each follows one Jam, chosen from where it stands
 * and what the user listens to (see LampJam); it moves with the music of that Jam when the user hears it (a guest
 * reads the stream they receive, the host the one they share), and is off when its Jam plays nothing. `?lampDemo` and
 * the setting of the menu light every lamp with a made-up beat instead, and put one lamp of each kind near the player.
 *
 * A dance floor (`lamp.kind: "dancefloor"`) is kept here too, for the music it shares with the lamps, but lives another
 * life: it never goes out (see updateFloors).
 */
export class LampManager {
    private readonly demoLamps: LampVisual[] = [];
    private readonly placed = new Map<string, PlacedLamp>();
    private readonly floors = new Map<string, PlacedFloor>();
    private readonly music = new Map<string, ReadMusic>();
    // The light of a room stays in the room: the lamps of a zone draw in one container, clipped to the zone.
    private readonly zoneLights: LampZoneLights;
    private readonly frames = new Map<string, LampFrame>();
    // The RGB lamps live their own life (see RgbLamps): a steady light with shadows, that no music moves.
    private readonly rgbLamps: RgbLamps;
    private demoSignal: LampSignalSource | undefined;
    private demo: { bpm: number } | undefined;
    private readonly systemReducedMotion: boolean;
    private readonly unsubscribers: Unsubscriber[] = [];
    private editorOpen = false;
    private effectsEnabled = true;
    private lastReconcileAt: number | undefined;
    /** The colour washing over each room on the beat, by area. */
    private readonly roomWash = new Map<string, { colourIndex: number; pulse: number; lastAt: number }>();
    /** The rooms last put out, by area id: the night veil is told only when that list changes. */
    private partyKey = "";

    // What everyone shares, as last seen.
    private rooms: readonly JamRoom[] = [];
    private listeningByUuid: ReadonlyMap<string, SpotifyListening> = new Map();
    private participants: ReadonlyMap<string, number> = new Map();
    private listeningSpace: string | undefined;
    private receivedStreams: ReadonlyMap<string, MediaStream> = new Map();
    private sharedMusic: SharedJamMusic | undefined;
    private joined: JoinedJam | undefined;
    private readonly spotifyMusic = new SpotifyMusicSignal();
    private stopSpotifyMusic: (() => void) | undefined;

    private watchJukeboxMusic(): void {
        const joined = this.joined;
        const home =
            joined !== undefined &&
            this.rooms.some(
                (room) =>
                    isHomeJam(room.jam) && room.zone.areaId === joined.areaId && room.jam.hostUuid === joined.hostUuid,
            );
        if (home && !this.stopSpotifyMusic) {
            this.stopSpotifyMusic = window.WAD?.watchSpotifyMusic?.((frame) =>
                this.spotifyMusic.set(frame, performance.now()),
            );
        } else if (!home && this.stopSpotifyMusic) {
            this.stopSpotifyMusic();
            this.stopSpotifyMusic = undefined;
            this.spotifyMusic.set(null, performance.now());
        }
    }

    constructor(
        private readonly scene: GameScene,
        options: { demo?: { bpm: number } } = {},
    ) {
        ensureLampTextures(scene);
        this.zoneLights = new LampZoneLights(scene, LAMP_DEPTH, ROOM_SHADE_DEPTH);
        this.systemReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        this.rgbLamps = new RgbLamps(scene, LAMP_DEPTH, { reducedMotion: this.systemReducedMotion });
        this.unsubscribers = [
            lampEffectsEnabledStore.subscribe((enabled) => {
                this.effectsEnabled = enabled;
                this.scene.markDirty();
            }),
            mapEditorModeStore.subscribe((open) => {
                this.editorOpen = open;
            }),
            // The demo follows the address (`?lampDemo`) and the setting of the menu, which can change while playing.
            lampDemoEnabledStore.subscribe((enabled) => this.setDemo(resolveLampDemo(options.demo, enabled))),
            allJamRoomsStore.subscribe((rooms) => {
                this.rooms = rooms;
                this.watchJukeboxMusic();
            }),
            joinedJamStore.subscribe((joined) => {
                this.joined = joined;
                this.watchJukeboxMusic();
            }),
            listeningByUserUuidStore.subscribe((listening) => (this.listeningByUuid = listening)),
            jamParticipantsCountStore.subscribe((counts) => (this.participants = counts)),
            jamAudioSession.listeningSpaceName.subscribe((space) => (this.listeningSpace = space)),
            jamMusicStreamsStore.subscribe((streams) => (this.receivedStreams = streams)),
            jamMusicCapture.sharedMusic.subscribe((shared) => (this.sharedMusic = shared)),
        ];
    }

    private reducedMotion = (): boolean => this.systemReducedMotion || this.editorOpen;

    private setDemo(demo: { bpm: number } | undefined): void {
        if (demo?.bpm === this.demo?.bpm) {
            return;
        }
        this.demo = demo;
        for (const lamp of this.demoLamps) {
            lamp.destroy();
        }
        this.demoLamps.length = 0;
        this.demoSignal = demo ? new SpectrumSignalSource((now) => syntheticSpectrum(now, demo.bpm)) : undefined;
        if (demo) {
            this.spawnDemoLamps();
        }
    }

    private spawnDemoLamps(): void {
        const { x, y } = this.scene.CurrentPlayer;
        const first = x - ((DEMO_KINDS.length - 1) * DEMO_SPACING_PX) / 2;
        DEMO_KINDS.forEach((kind, index) => {
            this.demoLamps.push(
                createLamp(kind, {
                    scene: this.scene,
                    x: first + index * DEMO_SPACING_PX,
                    y: y + DEMO_OFFSET_Y_PX,
                    depth: LAMP_DEPTH,
                    reducedMotion: this.reducedMotion,
                    drawsBody: true,
                }),
            );
        });
    }

    /** The listening zones of the map, with their rectangle: a lamp inside one belongs to it. */
    private areas(): AreaData[] {
        const areas = this.scene.getGameMap().getWamFile()?.getGameMapAreas()?.getAreas().values() ?? [];
        const map = this.scene.getGameMapFrontWrapper().getMap();
        const mapWidth = (map.width ?? 0) * (map.tilewidth ?? 32);
        const mapHeight = (map.height ?? 0) * (map.tileheight ?? 32);
        // As for the night lights: an area that covers most of the map is not a room.
        return lightableAreas(areas, mapWidth, mapHeight);
    }

    /** The listening zones of the map: the Jam a lamp follows comes from the one it stands in. */
    private listeningZones(areas: readonly AreaData[]): LampZone[] {
        return areas
            .filter((area) => area.properties.some((property) => property.type === LISTENING_ZONE_PROPERTY))
            .map(toLampZone);
    }

    private spaceNameOf(choice: LampJamChoice): string | undefined {
        const room = this.rooms.find(
            (candidate) => candidate.zone.areaId === choice.areaId && candidate.jam.hostUuid === choice.hostUuid,
        );
        return room
            ? jamAudioSession.spaceNameOf({
                  areaId: choice.areaId,
                  propertyId: room.zone.propertyId,
                  hostUuid: choice.hostUuid,
              })
            : undefined;
    }

    /** The Jam the user hears, as a choice: the one they listen to, or, for a host, the one whose music they share. */
    private listenedJam(): LampJamChoice | undefined {
        const joined = this.joined;
        if (
            joined &&
            this.rooms.some(
                (room) =>
                    isHomeJam(room.jam) && room.zone.areaId === joined.areaId && room.jam.hostUuid === joined.hostUuid,
            )
        ) {
            return { areaId: joined.areaId, hostUuid: joined.hostUuid };
        }
        const rooms = this.rooms.map((room) => ({ areaId: room.zone.areaId, hostUuid: room.jam.hostUuid }));
        return jamOfSpaces(rooms, (choice) => this.spaceNameOf(choice), [
            this.listeningSpace,
            this.sharedMusic?.spaceName,
        ]);
    }

    /**
     * Where the light of a lamp stays: the size set for it in the editor, within its listening zone; else that zone,
     * or a square around it when it stands in none (see lampLightZone).
     */
    private clipZoneOf(id: string, entity: Entity, zones: readonly LampZone[]): LampZone {
        return lampLightZone({
            id,
            source: lampSource(entity, entity.getPrefab().lamp?.anchor),
            zones,
            sizeInTiles: lampSizeOf(entity.getEntityData().properties),
        });
    }

    private buildVisual(kind: LampKind, entity: Entity, zone: LampZone): LampVisual {
        const source = lampSource(entity, entity.getPrefab().lamp?.anchor);
        return createLamp(kind, {
            scene: this.scene,
            x: source.x,
            y: source.y,
            depth: LAMP_DEPTH,
            reducedMotion: this.reducedMotion,
            drawsBody: false,
            container: this.zoneLights.containerFor(zone),
            bounds: zone,
        });
    }

    private reconcile(): void {
        const entities = this.scene.getGameMapFrontWrapper().getEntitiesManager().getEntities();
        this.reconcileFloors(entities);
        this.rgbLamps.reconcile(entities);
        const lit = new Map<string, LampKind>();
        for (const [id, lamp] of this.placed) {
            lit.set(id, lamp.kind);
        }
        const objects = [...entities.entries()].map(([id, entity]) => ({ id, kind: lightKindOf(entity) }));
        const plan = planLamps(lit, objects);
        for (const id of plan.remove) {
            const lamp = this.placed.get(id);
            if (lamp) {
                showBody(lamp);
                lamp.visual.destroy();
            }
            this.placed.delete(id);
        }
        if (this.placed.size === 0 && plan.create.length === 0) {
            this.zoneLights.sync(new Map());
            return;
        }
        // The light of a lamp stays in the smallest area of the map it stands in, of whatever kind: that is the room.
        const areas = this.areas();
        const areaZones = areas.map(toLampZone);
        for (const { id, kind } of plan.create) {
            const entity = entities.get(id);
            if (!entity) {
                continue;
            }
            const zone = this.clipZoneOf(id, entity, areaZones);
            this.placed.set(id, {
                kind,
                visual: this.buildVisual(kind, entity, zone),
                entity,
                jam: undefined,
                room: undefined,
                zoneId: zone.areaId,
                brightness: 0,
                lastUpdateAt: undefined,
                bodyHidden: false,
            });
        }

        // A lamp that was moved into another zone (in the editor) draws in the container of that zone.
        const usedZones = new Map<string, LampZone>();
        for (const [id, lamp] of this.placed) {
            const zone = this.clipZoneOf(id, lamp.entity, areaZones);
            if (zone.areaId !== lamp.zoneId) {
                lamp.visual.destroy();
                lamp.visual = this.buildVisual(lamp.kind, lamp.entity, zone);
                lamp.zoneId = zone.areaId;
            }
            usedZones.set(zone.areaId, zone);
        }
        this.zoneLights.sync(usedZones);

        // Which Jam each lamp follows: worked out the same way by every client, from what everyone shares.
        const listeningZones = this.listeningZones(areas);
        const jams: LampJam[] = lampJamsOf(this.rooms, this.listeningByUuid, this.participants);
        const listening = this.listenedJam();
        for (const lamp of this.placed.values()) {
            const source = lampSource(lamp.entity, lamp.entity.getPrefab().lamp?.anchor);
            const jam = resolveLampJam({ source, zones: listeningZones, jams, listening });
            // The host turned the effects of their room off: off for everyone, the room keeps its own light.
            lamp.jam = jam && !this.lightsOffIn(jam) ? jam : undefined;
            // The room put out while it plays: the smallest area it stands in, as for its light.
            lamp.room = zoneOf(source, areaZones);
        }
    }

    /** The dance floors of the map: one per object that is one, and the Jam each follows. */
    private reconcileFloors(entities: ReadonlyMap<string, Entity>): void {
        for (const [id, floor] of this.floors) {
            // An object can be replaced under the same id (an undo, a model changed): the floor is the one of the
            // object that is there now.
            if (entities.get(id) !== floor.entity || !isDanceFloor(floor.entity)) {
                floor.visual.destroy();
                this.floors.delete(id);
            }
        }
        for (const [id, entity] of entities) {
            if (isDanceFloor(entity) && !this.floors.has(id)) {
                this.floors.set(id, {
                    entity,
                    visual: new DanceFloorVisual(this.scene, id, DANCE_FLOOR_DEPTH),
                    engine: undefined,
                    grid: { cols: 0, rows: 0 },
                    jam: undefined,
                    heardAt: undefined,
                });
            }
        }
        if (this.floors.size === 0) {
            return;
        }
        // The same rule as the lamps, from the middle of the floor: every client follows the same Jam.
        const listeningZones = this.listeningZones(this.areas());
        const jams: LampJam[] = lampJamsOf(this.rooms, this.listeningByUuid, this.participants);
        const listening = this.listenedJam();
        for (const floor of this.floors.values()) {
            const bounds = this.floorBounds(floor.entity);
            const source = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
            const jam = resolveLampJam({ source, zones: listeningZones, jams, listening });
            floor.jam = jam && !this.lightsOffIn(jam) ? jam : undefined;
        }
    }

    private floorBounds(entity: Entity): { x: number; y: number; width: number; height: number } {
        return danceFloorBounds(entity, lampSizeOf(entity.getEntityData().properties));
    }

    /**
     * Draws the dance floors. A floor never stops: without music (no Jam, effects turned off, a Jam this user does not
     * hear) it goes through its patterns along the clock, the same for everyone. Returns whether one was drawn.
     */
    private updateFloors(now: number, demoFrame: LampFrame | undefined): boolean {
        if (this.floors.size === 0) {
            return false;
        }
        const view = this.scene.cameras.main.worldView;
        const clock = Date.now();
        let drawn = false;
        for (const [id, floor] of this.floors) {
            const { entity } = floor;
            const bounds = this.floorBounds(entity);
            // The object is the floor: it takes its size, so that it is selected, dragged and outlined as a whole.
            if (entity.displayWidth !== bounds.width || entity.displayHeight !== bounds.height) {
                entity.setDisplaySize(bounds.width, bounds.height);
            }
            const grid = danceFloorGrid(bounds);
            if (!floor.engine || grid.cols !== floor.grid.cols || grid.rows !== floor.grid.rows) {
                floor.grid = grid;
                floor.engine = new DanceFloorEngine(grid, danceFloorSeed(id));
            }
            floor.visual.setBounds(bounds, grid);
            floor.visual.setVisible(entity.visible);
            floor.visual.setAlpha(entity.alpha);
            // Out of the screen: nothing to draw, and the next image picks the pattern up from the clock.
            const onScreen =
                bounds.x < view.right &&
                bounds.x + bounds.width > view.x &&
                bounds.y < view.bottom &&
                bounds.y + bounds.height > view.y;
            if (!entity.visible || !onScreen) {
                continue;
            }
            const space = floor.jam && this.spaceNameOf(floor.jam);
            const frame =
                !this.effectsEnabled || this.editorOpen
                    ? undefined
                    : (demoFrame ?? (space ? this.frameOfJam(space, now) : undefined));
            // A Jam this user does not hear, or a source without data, gives silence: the floor keeps its own patterns.
            if (frame && !isSilentFrame(frame)) {
                floor.heardAt = now;
            } else if (!frame || (floor.heardAt !== undefined && now - floor.heardAt >= FLOOR_SILENCE_MS)) {
                floor.heardAt = undefined;
            }
            floor.engine.update({
                now: clock,
                music: frame && floor.heardAt !== undefined ? { beat: frame.beat, bass: frame.bass } : undefined,
                reducedMotion: this.reducedMotion(),
                off: !this.effectsEnabled,
            });
            floor.visual.draw(floor.engine);
            drawn = true;
        }
        return drawn;
    }

    /** The stream of the music of a Jam that this user hears: the one received, or the one the host shares. */
    private streamOf(spaceName: string): MediaStream | undefined {
        if (this.sharedMusic?.spaceName === spaceName) {
            return this.sharedMusic.stream;
        }
        return this.receivedStreams.get(spaceName);
    }

    /** What the music of a Jam does at this image; nothing moves when this user does not hear it. */
    private frameOfJam(spaceName: string, now: number): LampFrame {
        const cached = this.frames.get(spaceName);
        if (cached) {
            return cached;
        }
        const stream = this.streamOf(spaceName);
        const jukebox = this.rooms.find(
            (room) =>
                isHomeJam(room.jam) &&
                this.spaceNameOf({ areaId: room.zone.areaId, hostUuid: room.jam.hostUuid }) === spaceName,
        );
        let frame = jukebox
            ? this.spotifyMusic.read(
                  spotifyTrackUri(this.listeningByUuid.get(jukebox.jam.hostUuid)?.trackUrl ?? ""),
                  performance.now(),
              )
            : IDLE_FRAME;
        if (stream) {
            let read = this.music.get(spaceName);
            if (read?.stream !== stream) {
                read?.spectrum.destroy();
                const spectrum = new StreamSpectrum(stream);
                read = { stream, spectrum, signal: new SpectrumSignalSource(() => spectrum.read()) };
                this.music.set(spaceName, read);
            }
            frame = read.signal.read(now);
        }
        this.frames.set(spaceName, frame);
        return frame;
    }

    /** Lets go of the streams nobody follows any more. */
    private dropUnusedMusic(): void {
        const wanted = new Set<string>();
        for (const follower of [...this.placed.values(), ...this.floors.values()]) {
            const space = follower.jam && this.spaceNameOf(follower.jam);
            if (space) {
                wanted.add(space);
            }
        }
        for (const [space, read] of this.music) {
            if (!wanted.has(space) || this.streamOf(space) !== read.stream) {
                read.spectrum.destroy();
                this.music.delete(space);
            }
        }
    }

    public update(now: number): void {
        if (this.lastReconcileAt === undefined || now - this.lastReconcileAt >= RECONCILE_INTERVAL_MS) {
            this.lastReconcileAt = now;
            this.reconcile();
            this.dropUnusedMusic();
        }
        this.frames.clear();
        // Before anything that returns early: an RGB lamp shines without music, and with the light effects turned off
        // (it is a steady light, not an effect).
        this.rgbLamps.update(this.editorOpen);
        const demoFrame = this.demoSignal?.read(now);
        if (this.updateFloors(now, demoFrame)) {
            // The scene is only drawn when something changed: a floor on the screen changes at every image.
            this.scene.markDirty();
        }
        if (this.placed.size === 0 && this.demoLamps.length === 0) {
            this.zoneLights.setAmbience([]);
            this.setPartyRooms([]);
            return;
        }
        if (!this.effectsEnabled) {
            this.zoneLights.setAmbience([]);
            this.setPartyRooms([]);
            for (const lamp of this.demoLamps) {
                lamp.setVisible(false);
            }
            for (const placed of this.placed.values()) {
                placed.visual.setVisible(false);
                placed.brightness = 0;
                placed.lastUpdateAt = now;
            }
            return;
        }
        let anyLit = false;
        const rooms = new Map<string, RoomBeat>();
        for (const lamp of this.demoLamps) {
            lamp.setVisible(true);
            lamp.update(demoFrame ?? IDLE_FRAME, now);
            anyLit = true;
        }
        for (const placed of this.placed.values()) {
            if (placed.kind === "disco" && placed.bodyHidden === this.editorOpen) {
                if (this.editorOpen) showBody(placed);
                else {
                    placed.entity.setAlpha(0);
                    placed.bodyHidden = true;
                }
            }
            const space = placed.jam && this.spaceNameOf(placed.jam);
            // In the editor a lamp is always lit, steady, so that it can be placed; with a demo, lit by the demo.
            const lit = this.editorOpen || demoFrame !== undefined || space !== undefined;
            const elapsed = placed.lastUpdateAt === undefined ? 0 : now - placed.lastUpdateAt;
            placed.lastUpdateAt = now;
            placed.brightness = nextBrightness(placed.brightness, lit, elapsed);
            // A lamp whose music stopped keeps drawing while its light dies away.
            const visible = placed.brightness > 0;
            placed.visual.setVisible(visible);
            if (!visible) {
                continue;
            }
            anyLit = true;
            const frame = !lit
                ? IDLE_FRAME
                : this.editorOpen
                  ? EDITOR_FRAME
                  : (demoFrame ?? (space ? this.frameOfJam(space, now) : IDLE_FRAME));
            // At every image: the object may be dragged in the editor, and the light goes with it.
            const source = lampSource(placed.entity, placed.entity.getPrefab().lamp?.anchor);
            placed.visual.moveTo(source.x, source.y);
            placed.visual.setBrightness(placed.brightness);
            placed.visual.update(frame, now);
            // A room whose lamps play is put out: only the lights, in time with the music, are left (not while editing).
            if (placed.room && !this.editorOpen) {
                const room = rooms.get(placed.room.areaId);
                rooms.set(placed.room.areaId, {
                    zone: placed.room,
                    darkness: Math.max(room?.darkness ?? 0, placed.brightness),
                    beat: (room?.beat ?? false) || frame.beat,
                    bar: (room?.bar ?? false) || frame.bar === true,
                    bass: Math.max(room?.bass ?? 0, frame.bass),
                    level: Math.max(room?.level ?? 0, frame.mid, frame.treble),
                });
            }
        }
        this.zoneLights.setAmbience(this.ambienceOf(rooms, now));
        if (anyLit) {
            // The scene is only drawn when something changed: lamps change at every image.
            this.scene.markDirty();
        }
    }

    /** The darkness of each playing room, and the colour that floods it on each beat then fades. */
    private ambienceOf(rooms: ReadonlyMap<string, RoomBeat>, now: number): RoomAmbience[] {
        this.setPartyRooms([...rooms.values()].map(({ zone }) => zone));
        for (const areaId of this.roomWash.keys()) {
            if (!rooms.has(areaId)) this.roomWash.delete(areaId);
        }
        return [...rooms.entries()].map(([areaId, room]) => {
            const previous = this.roomWash.get(areaId);
            const delta = previous ? Math.min(100, now - previous.lastAt) : 0;
            // Each beat moves to the next colour; a new bar jumps across the palette, a change of scene.
            const step = room.bar ? 3 : room.beat ? 1 : 0;
            const wash = {
                colourIndex: ((previous?.colourIndex ?? -1) + Math.max(step, previous ? 0 : 1)) % PALETTE.length,
                pulse: room.beat ? 1 : (previous?.pulse ?? 0) * Math.exp(-delta / 260),
                lastAt: now,
            };
            this.roomWash.set(areaId, wash);
            const flashes = !this.reducedMotion();
            return {
                zone: room.zone,
                darkness: room.darkness,
                wash: {
                    colour: PALETTE[wash.colourIndex],
                    // The room floods with colour on each bass punch, and stays faintly tinted in between.
                    alpha:
                        room.darkness *
                        Math.min(0.45, 0.04 + 0.06 * room.level + (flashes ? 0.12 * wash.pulse + 0.3 * room.bass : 0)),
                },
            };
        });
    }

    private lightsOffIn(choice: LampJamChoice): boolean {
        return this.rooms.some(
            (room) =>
                room.zone.areaId === choice.areaId &&
                room.jam.hostUuid === choice.hostUuid &&
                room.jam.lightsOff === true,
        );
    }

    private setPartyRooms(rooms: readonly LampZone[]): void {
        const key = rooms.map((room) => room.areaId).join(",");
        if (key === this.partyKey) {
            return;
        }
        this.partyKey = key;
        partyRoomsStore.set(rooms);
    }

    public destroy(): void {
        this.setPartyRooms([]);
        this.stopSpotifyMusic?.();
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        this.unsubscribers.length = 0;
        for (const lamp of this.demoLamps) {
            lamp.destroy();
        }
        this.demoLamps.length = 0;
        for (const lamp of this.placed.values()) {
            showBody(lamp);
            lamp.visual.destroy();
        }
        this.placed.clear();
        for (const floor of this.floors.values()) {
            floor.visual.destroy();
        }
        this.floors.clear();
        this.rgbLamps.destroy();
        this.zoneLights.destroy();
        for (const read of this.music.values()) {
            read.spectrum.destroy();
        }
        this.music.clear();
    }
}

function showBody(lamp: PlacedLamp): void {
    if (lamp.bodyHidden) {
        lamp.entity.setAlpha(1);
        lamp.bodyHidden = false;
    }
}
