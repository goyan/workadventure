import type { Unsubscriber } from "svelte/store";
import type { AreaData } from "@workadventure/map-editor";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import { nightDisabledStore } from "../../../Stores/NightStore";
import type { GameScene } from "../GameScene";
import { nightOpacityAtMinutes, parisMinutes, parseNightAt } from "./NightClock";
import { lightableAreas, NightLights } from "./NightLights";
import { NightOverlay } from "./NightOverlay";
import { nightRenderAction } from "./NightRenderDecision";
import type { NightFrame } from "./NightRenderDecision";

/** The clock only moves the veil during dusk and dawn, by minutes: once a second is plenty. */
const CLOCK_INTERVAL_MS = 1000;

/**
 * Night mode of the map: darkens the scene in the evening and lights the areas where someone is.
 * Everything is local (same Paris clock for everyone, players known by this browser): nothing goes on the network.
 */
export class NightManager {
    private readonly overlay: NightOverlay;
    private readonly lights = new NightLights();
    // Development override of the clock (`?nightAt=HH:MM`), fixed for the life of the scene.
    private readonly forcedMinutes: number | undefined;
    private readonly unsubscribeEditor: Unsubscriber;
    private readonly unsubscribeDisabled: Unsubscriber;
    private areas: AreaData[] = [];
    private editorOpen = false;
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
        this.unsubscribeDisabled = nightDisabledStore.subscribe((disabled) => {
            this.disabled = disabled;
        });
    }

    public update(now: number): void {
        if (this.lastClockAt === undefined || now - this.lastClockAt >= CLOCK_INTERVAL_MS) {
            this.lastClockAt = now;
            this.opacity = nightOpacityAtMinutes(this.forcedMinutes ?? parisMinutes(new Date()));
        }

        // By day, in the editor or when turned off, nothing else is computed.
        if (this.opacity === 0 || this.editorOpen || this.disabled) {
            if (this.previous !== undefined) {
                this.overlay.hide();
                this.previous = undefined;
            }
            return;
        }

        const lit = this.lights.update(now, this.areas, this.players());
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
            fading: this.lights.isFading(),
        };

        const action = nightRenderAction(frame, this.previous);
        if (action === "draw") {
            this.overlay.draw(frame);
        } else if (action === "hidden") {
            this.overlay.hide();
        }
        this.previous = frame;
    }

    public destroy(): void {
        this.unsubscribeEditor();
        this.unsubscribeDisabled();
        this.overlay.destroy();
    }

    private readAreas(): void {
        const map = this.scene.getGameMapFrontWrapper().getMap();
        const mapWidth = (map.width ?? 0) * (map.tilewidth ?? 32);
        const mapHeight = (map.height ?? 0) * (map.tileheight ?? 32);
        const areas = this.scene.getGameMap().getWamFile()?.getGameMapAreas()?.getAreas().values() ?? [];
        this.areas = lightableAreas(areas, mapWidth, mapHeight);
    }

    private players(): { x: number; y: number }[] {
        // Same position as the one the areas logic uses for the local player.
        const players = [{ x: this.scene.CurrentPlayer.x, y: this.scene.CurrentPlayer.y }];
        for (const player of this.scene.MapPlayersByKey.values()) {
            players.push({ x: player.x, y: player.y });
        }
        return players;
    }
}
