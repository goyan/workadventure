import { SWITCH_MAX_TARGETS, isAtAreaLevel, isAutomaticSwitch } from "@workadventure/map-editor";
import type { SwitchPropertyData } from "@workadventure/map-editor";
import { get, type Unsubscriber } from "svelte/store";
import LL from "../../../../i18n/i18n-svelte";
import { actionsMenuStore, type ActionsMenuAction } from "../../../Stores/ActionsMenuStore";
import { entityStatesManagerStore } from "../../../Stores/EntityStatesStore";
import type { Entity } from "../../ECS/Entity";
import type { EntityStatesManager } from "../EntityStates/EntityStatesManager";
import type { GameScene } from "../GameScene";
import { toLampZone } from "../Lamps/LampJam";
import { lampSource } from "../Lamps/LampReconcile";
import { mapRoomAreas, roomZonesAt } from "../Lamps/RoomZones";
import { mapEditorModeStore, mapEditorSelectedEntityStore } from "../../../Stores/MapEditorStore";
import { SwitchIndicator } from "./SwitchIndicator";
import { SwitchAnimalReporter, sensorsWithAnimals, type AnimalSensor } from "./SwitchAnimalReports";
import { syncedSensorProperty } from "./SwitchSensorSync";
import { SwitchWiringView, wiringOf, type SwitchWatchShape } from "./SwitchWiringView";
import {
    entityStateKeysOf,
    resolveSwitchTargets,
    roomIdAt,
    switchPressValue,
    type SwitchableTarget,
} from "./SwitchTargets";

/** The switches of the map are looked for this often: one appears or goes as the map is edited. */
const RECONCILE_INTERVAL_MS = 250;

/** A switch stands in the room its foot is in. */
function footOf(entity: Entity): { x: number; y: number } {
    return { x: entity.x + entity.displayWidth / 2, y: entity.y + entity.displayHeight - 1 };
}

export function switchPropertyOf(entity: Entity): SwitchPropertyData | undefined {
    return entity
        .getProperties()
        .find((property): property is SwitchPropertyData => property.type === "switchPropertyData");
}

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
    private candidates: SwitchableTarget[] | undefined;
    private readonly wiringView: SwitchWiringView;
    private readonly animalReporter = new SwitchAnimalReporter();

    constructor(private readonly scene: GameScene) {
        this.wiringView = new SwitchWiringView(scene);
        this.unsubscribe = entityStatesManagerStore.subscribe((states) => (this.states = states));
    }

    /** The objects this switch commands now. */
    public targetsOf(entity: Entity, property: SwitchPropertyData): SwitchableTarget[] {
        const roomId = property.targets.mode === "zone" ? this.roomIdOf(entity, true) : undefined;
        return resolveSwitchTargets(property, roomId, entity.getElevation(), this.candidates ?? this.readCandidates());
    }

    /**
     * The objects of the map that can be switched, each with its room. Read again a few times a second (see
     * reconcile): the small lights of the switches are drawn at every image and must not read the whole map then.
     */
    private readCandidates(): SwitchableTarget[] {
        const areas = mapRoomAreas(this.scene);
        const candidates: SwitchableTarget[] = [];
        for (const [id, candidate] of this.entities()) {
            const keys = entityStateKeysOf(candidate.getPrefab());
            if (keys.length === 0) {
                continue;
            }
            const point = lampSource(candidate, candidate.getPrefab().lamp?.anchor);
            const elevation = candidate.getElevation();
            candidates.push({
                id,
                point,
                elevation,
                keys,
                roomId: roomIdAt(point, roomZonesAt(this.scene, areas, elevation, point)),
            });
        }
        this.candidates = candidates;
        return candidates;
    }

    /**
     * The room a switch is in: an area of its floor, or (`withFloors`) the raised floor it stands on. A switch
     * against a wall of a room is in that room (see roomIdAt).
     */
    private roomIdOf(entity: Entity, withFloors: boolean): string | undefined {
        const point = footOf(entity);
        const elevation = entity.getElevation();
        const areas = mapRoomAreas(this.scene);
        const rooms = withFloors
            ? roomZonesAt(this.scene, areas, elevation, point)
            : areas.filter((area) => isAtAreaLevel(area, elevation)).map(toLampZone);
        return roomIdAt(point, rooms);
    }

    /** What activating the switch does, for the menu of the object; undefined when this player may not use it. */
    public actionOf(entity: Entity, property: SwitchPropertyData): ActionsMenuAction | undefined {
        // A sensor or a timer is not used by hand: the server uses it.
        if (isAutomaticSwitch(property)) {
            return undefined;
        }
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

    /** The area of its floor the switch is in: the room a sensor of its room watches (an area the server knows). */
    public roomAreaIdOf(entity: Entity): string | undefined {
        return this.roomIdOf(entity, false);
    }

    /**
     * With the map editor open: stores in each switch that has a trigger what the server needs (the room of a sensor
     * of its room, the lamps of a switch that commands its room), whenever it changed: a lamp added to the room, the
     * sensor moved. One update of the object, on its own in the history.
     */
    private syncSensors(): void {
        if (!get(mapEditorModeStore)) {
            return;
        }
        for (const entity of this.switches) {
            const property = switchPropertyOf(entity);
            if (!property || !isAutomaticSwitch(property) || !entity.canEdit) {
                continue;
            }
            const resolved = this.targetsOf(entity, property)
                .map((target) => target.id)
                .slice(0, SWITCH_MAX_TARGETS);
            const synced = syncedSensorProperty(property, this.roomAreaIdOf(entity), resolved);
            if (synced) {
                entity.setProperty(synced);
            }
        }
    }

    /**
     * Tells the server which presence sensors a wandering animal stands in: only the browsers know where the animals
     * are. Nothing is worked out on a map without presence sensor.
     */
    private reportAnimals(now: number): void {
        const sensors: AnimalSensor[] = [];
        for (const entity of this.switches) {
            const trigger = switchPropertyOf(entity)?.trigger;
            if (trigger?.type !== "presence") {
                continue;
            }
            const area = trigger.areaId
                ? this.scene.getGameMap().getWamFile()?.getGameMapAreas()?.getAreas().get(trigger.areaId)
                : undefined;
            sensors.push({
                id: entity.entityId,
                x: entity.x,
                y: entity.y,
                elevation: entity.getElevation(),
                trigger,
                area,
            });
        }
        if (sensors.length === 0) {
            return;
        }
        const animals: { x: number; y: number }[] = [];
        this.scene.getWanderingCharactersManager()?.forEachWalker((position) => animals.push(position));
        const report = this.animalReporter.next(sensorsWithAnimals(sensors, animals), now);
        if (report) {
            this.scene.connection?.emitReportSwitchPresence(report);
        }
    }

    /** What the selected sensor watches, to be drawn in the map editor. */
    private watchedBy(entity: Entity, property: SwitchPropertyData): SwitchWatchShape | undefined {
        const trigger = property.trigger;
        if (trigger?.type !== "presence") {
            return undefined;
        }
        if (trigger.scope === "proximity" || trigger.scope === "cone") {
            // Where the server takes the middle of a sensor: half a tile from its corner.
            return {
                kind: "cone",
                x: entity.x + 16,
                y: entity.y + 16,
                reach: trigger.tiles * 32,
                direction: trigger.direction,
                angle: trigger.scope === "cone" ? trigger.angle : 360,
            };
        }
        const areaId = trigger.scope === "room" ? this.roomAreaIdOf(entity) : trigger.areaId;
        const area = areaId
            ? this.scene.getGameMap().getWamFile()?.getGameMapAreas()?.getAreas().get(areaId)
            : undefined;
        return area ? { kind: "rect", x: area.x, y: area.y, width: area.width, height: area.height } : undefined;
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
            this.syncSensors();
            this.reportAnimals(now);
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
        return this.wiringView.draw(wiring, selected && property ? this.watchedBy(selected, property) : undefined);
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
        this.readCandidates();
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
