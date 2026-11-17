import type { SwitchPropertyData } from "@workadventure/map-editor";
import { get, type Unsubscriber } from "svelte/store";
import LL from "../../../../i18n/i18n-svelte";
import { actionsMenuStore, type ActionsMenuAction } from "../../../Stores/ActionsMenuStore";
import { entityStatesManagerStore } from "../../../Stores/EntityStatesStore";
import type { Entity } from "../../ECS/Entity";
import type { EntityStatesManager } from "../EntityStates/EntityStatesManager";
import type { GameScene } from "../GameScene";
import { zoneOf } from "../Lamps/LampJam";
import { lampSource } from "../Lamps/LampReconcile";
import { mapRoomAreas, roomZonesAt } from "../Lamps/RoomZones";
import { mapEditorModeStore, mapEditorSelectedEntityStore } from "../../../Stores/MapEditorStore";
import { SwitchIndicator } from "./SwitchIndicator";
import { SwitchWiringView, wiringOf } from "./SwitchWiringView";
import {
    entityStateKeysOf,
    resolveSwitchTargets,
    switchPressValue,
    switchPropertyOf,
    type SwitchableTarget,
} from "./SwitchTargets";

/** The switches of the map are looked for this often: one appears or goes as the map is edited. */
const RECONCILE_INTERVAL_MS = 250;

/**
 * The switches of the map in the game: what a press does (asks the server to set the state of the objects the switch
 * commands) and the small light each one carries. The wiring is read from the map at every press: a lamp added to the
 * room since is commanded too.
 */
export class GameSwitches {
    private readonly indicators = new Map<string, SwitchIndicator>();
    private readonly unsubscribe: Unsubscriber;
    private states: EntityStatesManager | undefined;
    private lastReconcileAt: number | undefined;
    private switches: Entity[] = [];
    private readonly wiringView: SwitchWiringView;

    constructor(private readonly scene: GameScene) {
        this.wiringView = new SwitchWiringView(scene);
        this.unsubscribe = entityStatesManagerStore.subscribe((states) => (this.states = states));
    }

    /** The objects this switch commands now. */
    public targetsOf(entity: Entity, property: SwitchPropertyData): SwitchableTarget[] {
        const candidates: SwitchableTarget[] = [];
        for (const [id, candidate] of this.entities()) {
            const keys = entityStateKeysOf(candidate.getPrefab());
            if (keys.length > 0) {
                candidates.push({
                    id,
                    point: lampSource(candidate, candidate.getPrefab().lamp?.anchor),
                    elevation: candidate.getElevation(),
                    keys,
                });
            }
        }
        // A switch stands in the room its foot is in.
        const point = { x: entity.x + entity.displayWidth / 2, y: entity.y + entity.displayHeight - 1 };
        const elevation = entity.getElevation();
        const room =
            property.targets.mode === "zone"
                ? zoneOf(point, roomZonesAt(this.scene, mapRoomAreas(this.scene), elevation, point))
                : undefined;
        return resolveSwitchTargets(property, room, elevation, candidates);
    }

    /** What activating the switch does, for the menu of the object; undefined when this player may not use it. */
    public actionOf(entity: Entity, property: SwitchPropertyData): ActionsMenuAction | undefined {
        const allowedTags = property.allowedTags ?? [];
        const tags = this.scene.connection?.getAllTags() ?? [];
        if (allowedTags.length > 0 && !tags.some((tag) => allowedTags.includes(tag))) {
            return undefined;
        }
        const labels = get(LL).mapEditor.properties.switchPropertyData;
        const value = switchPressValue(this.targetsOf(entity, property), (id) => this.isOn(id));
        return {
            actionName:
                value === undefined
                    ? labels.actionButtonLabel()
                    : value === "true"
                      ? labels.turnOn()
                      : labels.turnOff(),
            protected: true,
            priority: 1,
            callback: () => {
                // Read again: the menu may have stayed open while somebody else used a switch.
                const targets = this.targetsOf(entity, property);
                const next = switchPressValue(targets, (id) => this.isOn(id));
                if (next !== undefined) {
                    this.states?.press(
                        entity.entityId,
                        targets.map((target) => target.id),
                        property.key,
                        next,
                    );
                }
                actionsMenuStore.clear();
            },
        };
    }

    /** The switches that command this object now, by their ids. */
    public switchesCommanding(entityId: string): string[] {
        const commanding: string[] = [];
        for (const [id, entity] of this.entities()) {
            const property = switchPropertyOf(entity);
            if (property && this.targetsOf(entity, property).some((target) => target.id === entityId)) {
                commanding.push(id);
            }
        }
        return commanding;
    }

    /** At every image: the small lights follow their switch and the state of its targets. */
    public update(now: number): void {
        if (this.lastReconcileAt === undefined || now - this.lastReconcileAt >= RECONCILE_INTERVAL_MS) {
            this.lastReconcileAt = now;
            this.reconcile();
        }
        let changed = false;
        for (const entity of this.switches) {
            const property = switchPropertyOf(entity);
            const indicator = this.indicators.get(entity.entityId);
            if (!property || !indicator) {
                continue;
            }
            const lit = this.targetsOf(entity, property).some((target) => this.isOn(target.id));
            changed = indicator.update(entity, lit) || changed;
        }
        changed = this.drawWiring() || changed;
        if (changed) {
            // The scene is only drawn when something changed.
            this.scene.markDirty();
        }
    }

    /**
     * In the map editor, the switch that is selected shows what it commands: a line to each of its targets, and a
     * ring around them. True when what is drawn changed.
     */
    private drawWiring(): boolean {
        const selected = get(mapEditorModeStore) ? get(mapEditorSelectedEntityStore) : undefined;
        const property = selected ? switchPropertyOf(selected) : undefined;
        const wiring = selected && property ? wiringOf(selected, this.targetsOf(selected, property)) : undefined;
        return this.wiringView.draw(wiring);
    }

    public destroy(): void {
        this.unsubscribe();
        this.wiringView.destroy();
        for (const indicator of this.indicators.values()) {
            indicator.destroy();
        }
        this.indicators.clear();
        this.switches = [];
    }

    private reconcile(): void {
        this.switches = [...this.entities().values()].filter((entity) => switchPropertyOf(entity) !== undefined);
        const ids = new Set(this.switches.map((entity) => entity.entityId));
        let removed = false;
        for (const [id, indicator] of this.indicators) {
            if (!ids.has(id)) {
                indicator.destroy();
                this.indicators.delete(id);
                removed = true;
            }
        }
        for (const id of ids) {
            if (!this.indicators.has(id)) {
                this.indicators.set(id, new SwitchIndicator(this.scene));
            }
        }
        if (removed) {
            this.scene.markDirty();
        }
    }

    private entities(): ReadonlyMap<string, Entity> {
        return this.scene.getGameMapFrontWrapper().getEntitiesManager().getEntities();
    }

    private isOn(entityId: string): boolean {
        return this.states?.isOn(entityId) ?? true;
    }
}
