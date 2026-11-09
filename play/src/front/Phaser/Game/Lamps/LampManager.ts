import type { Unsubscriber } from "svelte/store";
import { lampDemoEnabledStore } from "../../../Stores/LampDemoStore";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import type { Entity } from "../../ECS/Entity";
import { DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import type { GameScene } from "../GameScene";
import type { LampFrame, LampSignalSource } from "./LampSignal";
import { SpectrumSignalSource } from "./LampSignal";
import { resolveLampDemo } from "./LampDemo";
import { lampSource, planLamps } from "./LampReconcile";
import { syntheticSpectrum } from "./SyntheticBeat";
import { createLamp, type LampKind, type LampVisual } from "./LampVisuals";
import { ensureLampTextures } from "./LampTextures";

/** Above the night veil: lamps glow at night, and are a light touch by day. */
const LAMP_DEPTH = DEPTH_NIGHT_INDEX + 100;
const DEMO_KINDS: LampKind[] = ["spot", "disco", "neon", "strobe"];
/** Tiles are 32 px: the demo lamps stand three tiles above the player, a lamp every three tiles. */
const DEMO_SPACING_PX = 96;
const DEMO_OFFSET_Y_PX = -96;
/** The objects of the map are looked at this often: a lamp that appears or goes is not a matter of milliseconds. */
const RECONCILE_INTERVAL_MS = 250;
/** No music: the lamps are lit, not moving. */
const IDLE_FRAME: LampFrame = { bass: 0, mid: 0, treble: 0, beat: false };
/** In the map editor: a steady light, so that the one who places a lamp sees where it falls. */
const EDITOR_FRAME: LampFrame = { bass: 0.5, mid: 0.6, treble: 0.5, beat: false };

interface PlacedLamp {
    kind: LampKind;
    visual: LampVisual;
    entity: Entity;
}

/**
 * Lamps that follow the music. The objects of the map whose catalog entry says `lamp` carry one, wherever they are
 * put and moved (in the editor too: the light follows the drag). `?lampDemo` also puts one lamp of each kind near the
 * player and lights every lamp with a made-up beat, to judge the look without a Jam. Lamps read their frame from a
 * signal source, so the music of a Jam can take the place of the made-up one without touching the visuals.
 */
export class LampManager {
    private readonly demoLamps: LampVisual[] = [];
    private readonly placed = new Map<string, PlacedLamp>();
    private signal: LampSignalSource | undefined;
    private demo: { bpm: number } | undefined;
    private readonly systemReducedMotion: boolean;
    private readonly unsubscribeEditor: Unsubscriber;
    private readonly unsubscribeDemoSetting: Unsubscriber;
    private editorOpen = false;
    private lastReconcileAt: number | undefined;

    constructor(
        private readonly scene: GameScene,
        options: { demo?: { bpm: number } } = {},
    ) {
        ensureLampTextures(scene);
        this.systemReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        this.unsubscribeEditor = mapEditorModeStore.subscribe((open) => {
            this.editorOpen = open;
        });
        // The demo follows the address (`?lampDemo`) and the setting of the menu, which can change while playing.
        this.unsubscribeDemoSetting = lampDemoEnabledStore.subscribe((enabled) => {
            this.setDemo(resolveLampDemo(options.demo, enabled));
        });
    }

    private setDemo(demo: { bpm: number } | undefined): void {
        if (demo?.bpm === this.demo?.bpm) {
            return;
        }
        this.demo = demo;
        for (const lamp of this.demoLamps) {
            lamp.destroy();
        }
        this.demoLamps.length = 0;
        this.signal = demo ? new SpectrumSignalSource((now) => syntheticSpectrum(now, demo.bpm)) : undefined;
        if (demo) {
            this.spawnDemoLamps();
        }
    }

    private reducedMotion = (): boolean => this.systemReducedMotion || this.editorOpen;

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
                }),
            );
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
        for (const { id, kind } of plan.create) {
            const entity = entities.get(id);
            if (!entity) {
                continue;
            }
            const source = lampSource(entity, entity.getPrefab().lamp?.anchor);
            const visual = createLamp(kind, {
                scene: this.scene,
                x: source.x,
                y: source.y,
                depth: LAMP_DEPTH,
                reducedMotion: this.reducedMotion,
            });
            this.placed.set(id, { kind, visual, entity });
        }
    }

    public update(now: number): void {
        if (this.lastReconcileAt === undefined || now - this.lastReconcileAt >= RECONCILE_INTERVAL_MS) {
            this.lastReconcileAt = now;
            this.reconcile();
        }
        if (this.placed.size === 0 && this.demoLamps.length === 0) {
            return;
        }
        const frame = this.editorOpen ? EDITOR_FRAME : (this.signal?.read(now) ?? IDLE_FRAME);
        for (const lamp of this.demoLamps) {
            lamp.update(frame, now);
        }
        for (const { entity, visual } of this.placed.values()) {
            // At every image: the object may be dragged in the editor, and the light goes with it.
            const source = lampSource(entity, entity.getPrefab().lamp?.anchor);
            visual.moveTo(source.x, source.y);
            visual.update(frame, now);
        }
        // The scene is only drawn when something changed: lamps change at every image.
        this.scene.markDirty();
    }

    public destroy(): void {
        this.unsubscribeEditor();
        this.unsubscribeDemoSetting();
        for (const lamp of this.demoLamps) {
            lamp.destroy();
        }
        this.demoLamps.length = 0;
        for (const { visual } of this.placed.values()) {
            visual.destroy();
        }
        this.placed.clear();
    }
}
