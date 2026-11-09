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
import { lampEffectsEnabledStore } from "../../../Stores/LampEffectsStore";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import type { Entity } from "../../ECS/Entity";
import { DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import type { GameScene } from "../GameScene";
import { SpotifyMusicSignal } from "./SpotifyMusicSignal";
import {
    jamOfSpaces,
    lampJamsOf,
    lampLightZone,
    resolveLampJam,
    type LampJam,
    type LampJamChoice,
    type LampZone,
} from "./LampJam";
import { resolveLampDemo } from "./LampDemo";
import { lampSizeOf, lampSource, planLamps } from "./LampReconcile";
import { nextBrightness } from "./LampStyle";
import type { LampFrame, LampSignalSource } from "./LampSignal";
import { SpectrumSignalSource } from "./LampSignal";
import { ensureLampTextures } from "./LampTextures";
import { StreamSpectrum } from "./StreamSpectrum";
import { LampZoneLights } from "./LampZoneLights";
import { syntheticSpectrum } from "./SyntheticBeat";
import { createLamp, type LampKind, type LampVisual } from "./LampVisuals";

/** Above the night veil: lamps glow at night, and are a light touch by day. */
const LAMP_DEPTH = DEPTH_NIGHT_INDEX + 100;
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
    /** How bright it is, from 0 to 1: it rises quickly and dies away slowly (see nextBrightness). */
    brightness: number;
    lastUpdateAt: number | undefined;
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
 */
export class LampManager {
    private readonly demoLamps: LampVisual[] = [];
    private readonly placed = new Map<string, PlacedLamp>();
    private readonly music = new Map<string, ReadMusic>();
    // The light of a room stays in the room: the lamps of a zone draw in one container, clipped to the zone.
    private readonly zoneLights: LampZoneLights;
    private readonly frames = new Map<string, LampFrame>();
    private demoSignal: LampSignalSource | undefined;
    private demo: { bpm: number } | undefined;
    private readonly systemReducedMotion: boolean;
    private readonly unsubscribers: Unsubscriber[] = [];
    private editorOpen = false;
    private effectsEnabled = true;
    private lastReconcileAt: number | undefined;

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
        this.zoneLights = new LampZoneLights(scene, LAMP_DEPTH);
        this.systemReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
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
    private zones(): LampZone[] {
        const areas: Iterable<AreaData> =
            this.scene.getGameMap().getWamFile()?.getGameMapAreas()?.getAreas().values() ?? [];
        const zones: LampZone[] = [];
        for (const area of areas) {
            if (area.properties.some((property) => property.type === LISTENING_ZONE_PROPERTY)) {
                zones.push({ areaId: area.id, x: area.x, y: area.y, width: area.width, height: area.height });
            }
        }
        return zones;
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
        });
    }

    private reconcile(): void {
        const entities = this.scene.getGameMapFrontWrapper().getEntitiesManager().getEntities();
        const lit = new Map<string, LampKind>();
        for (const [id, lamp] of this.placed) {
            lit.set(id, lamp.kind);
        }
        const objects = [...entities.entries()].map(([id, entity]) => ({ id, kind: entity.getPrefab().lamp?.kind }));
        const plan = planLamps(lit, objects);
        for (const id of plan.remove) {
            this.placed.get(id)?.visual.destroy();
            this.placed.delete(id);
        }
        if (this.placed.size === 0 && plan.create.length === 0) {
            this.zoneLights.sync(new Map());
            return;
        }
        const zones = this.zones();
        for (const { id, kind } of plan.create) {
            const entity = entities.get(id);
            if (!entity) {
                continue;
            }
            const zone = this.clipZoneOf(id, entity, zones);
            this.placed.set(id, {
                kind,
                visual: this.buildVisual(kind, entity, zone),
                entity,
                jam: undefined,
                zoneId: zone.areaId,
                brightness: 0,
                lastUpdateAt: undefined,
            });
        }

        // A lamp that was moved into another zone (in the editor) draws in the container of that zone.
        const usedZones = new Map<string, LampZone>();
        for (const [id, lamp] of this.placed) {
            const zone = this.clipZoneOf(id, lamp.entity, zones);
            if (zone.areaId !== lamp.zoneId) {
                lamp.visual.destroy();
                lamp.visual = this.buildVisual(lamp.kind, lamp.entity, zone);
                lamp.zoneId = zone.areaId;
            }
            usedZones.set(zone.areaId, zone);
        }
        this.zoneLights.sync(usedZones);

        // Which Jam each lamp follows: worked out the same way by every client, from what everyone shares.
        const jams: LampJam[] = lampJamsOf(this.rooms, this.listeningByUuid, this.participants);
        const listening = this.listenedJam();
        for (const lamp of this.placed.values()) {
            const source = lampSource(lamp.entity, lamp.entity.getPrefab().lamp?.anchor);
            lamp.jam = resolveLampJam({ source, zones, jams, listening });
        }
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
        for (const lamp of this.placed.values()) {
            const space = lamp.jam && this.spaceNameOf(lamp.jam);
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
        if (this.placed.size === 0 && this.demoLamps.length === 0) {
            return;
        }
        if (!this.effectsEnabled) {
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
        this.frames.clear();
        const demoFrame = this.demoSignal?.read(now);
        let anyLit = false;
        for (const lamp of this.demoLamps) {
            lamp.setVisible(true);
            lamp.update(demoFrame ?? IDLE_FRAME, now);
            anyLit = true;
        }
        for (const placed of this.placed.values()) {
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
        }
        if (anyLit) {
            // The scene is only drawn when something changed: lamps change at every image.
            this.scene.markDirty();
        }
    }

    public destroy(): void {
        this.stopSpotifyMusic?.();
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        this.unsubscribers.length = 0;
        for (const lamp of this.demoLamps) {
            lamp.destroy();
        }
        this.demoLamps.length = 0;
        for (const { visual } of this.placed.values()) {
            visual.destroy();
        }
        this.placed.clear();
        this.zoneLights.destroy();
        for (const read of this.music.values()) {
            read.spectrum.destroy();
        }
        this.music.clear();
    }
}
