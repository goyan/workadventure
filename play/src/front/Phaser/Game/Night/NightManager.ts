import type { Unsubscriber } from "svelte/store";
import type { AreaData } from "@workadventure/map-editor";
import { localUserStore } from "../../../Connection/LocalUserStore";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import { NightMode, nightModeStore } from "../../../Stores/NightStore";
import type { GameScene } from "../GameScene";
import { nightOpacityAtMinutes, parisMinutes, parseNightAt } from "./NightClock";
import { NightHalos } from "./NightHalos";
import { isInLightableArea, lightableAreas, NightLights } from "./NightLights";
import { NightOverlay } from "./NightOverlay";
import { nightRenderAction } from "./NightRenderDecision";
import type { NightFrame } from "./NightRenderDecision";
import { ServerNightClock } from "./ServerNightClock";

/** The clock only moves the veil during dusk and dawn, by minutes: once a second is plenty. */
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
    private areas: AreaData[] = [];
    private editorOpen = false;
    private mode = NightMode.Server;
    private disabled = false;
    private opacity = 0;
    private lastClockAt: number | undefined;
    private previous: NightFrame | undefined;

    constructor(private readonly scene: GameScene) {
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
        this.unsubscribeMode = nightModeStore.subscribe((mode) => {
            this.mode = mode;
            this.disabled = mode === NightMode.Disabled;
            this.lastClockAt = undefined;
            this.scene.markDirty();
        });
    }

    public update(now: number): void {
        if (this.lastClockAt === undefined || now - this.lastClockAt >= CLOCK_INTERVAL_MS) {
            this.lastClockAt = now;
            const date = this.mode === NightMode.Computer ? new Date() : this.clock.now();
            const minutes =
                this.forcedMinutes ??
                (date
                    ? this.mode === NightMode.Computer
                        ? date.getHours() * 60 + date.getMinutes()
                        : parisMinutes(date)
                    : undefined);
            this.opacity = minutes === undefined ? 0 : nightOpacityAtMinutes(minutes);
        }

        // By day, in the editor or when turned off, nothing else is computed.
        if (this.opacity === 0 || this.editorOpen || this.disabled) {
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
        const lit = this.lights.update(now, this.areas, players);
        // No halo in a lit area: the area already lights the player.
        const halos = this.halos.update(
            now,
            players.map((player) => ({ ...player, sheltered: isInLightableArea(player, this.areas) })),
        );
        const camera = this.scene.cameras.main;
        const frame: NightFrame = {
            opacity: this.opacity,
            editorOpen: this.editorOpen,
            disabled: this.disabled,
            view: {
                x: camera.worldView.x,
                y: camera.worldView.y,
                width: camera.worldView.width,
                height: camera.worldView.height,
                zoom: camera.zoom,
            },
            lit,
            halos,
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

    public destroy(): void {
        this.clock.destroy();
        this.unsubscribeEditor();
        this.unsubscribeMode();
        this.overlay.destroy();
    }

    private readAreas(): void {
        const map = this.scene.getGameMapFrontWrapper().getMap();
        const mapWidth = (map.width ?? 0) * (map.tilewidth ?? 32);
        const mapHeight = (map.height ?? 0) * (map.tileheight ?? 32);
        const areas = this.scene.getGameMap().getWamFile()?.getGameMapAreas()?.getAreas().values() ?? [];
        this.areas = lightableAreas(areas, mapWidth, mapHeight);
    }

    private players(): { id: string; x: number; y: number }[] {
        // Raw sprite positions, as given to GameMapFrontWrapper.setPosition: NightLights adds the feet offset, the
        // halos are centred on them (the body). Animals are not players: they carry no light.
        const players = [{ id: this.localId, x: this.scene.CurrentPlayer.x, y: this.scene.CurrentPlayer.y }];
        for (const [key, player] of this.scene.MapPlayersByKey) {
            players.push({ id: String(key), x: player.x, y: player.y });
        }
        return players;
    }
}
