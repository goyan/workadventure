import {
    automaticSwitchTargetIds,
    isAtAreaLevel,
    isInCone,
    isWithinHours,
    parisMinutesOfDay,
} from "@workadventure/map-editor";
import type { EntityStateKey, EntityStateValue, SwitchPropertyData, WAMEntityData } from "@workadventure/map-editor";
import { AreaZoneTracker } from "./AreaZoneTracker";
import type { GameRoom } from "./GameRoom";

/** The triggers of a map are looked at this often. */
export const SWITCH_TRIGGER_TICK_MS = 1000;
/** The server does not know the size of an object: the middle of a sensor is taken half a tile from its corner. */
const SENSOR_MIDDLE_PX = 16;
const TILE_PX = 32;

interface AutomaticSwitch {
    id: string;
    entity: WAMEntityData;
    property: SwitchPropertyData;
}

type TriggerUser = { getPosition(): { x: number; y: number }; getFloorZ(): number };

/**
 * Uses the switches that have a trigger (a presence sensor, a timer) for them: once a second it works out, for each
 * object such a switch commands, whether one of its triggers holds, and sets the state of the object when that
 * changes. The server alone decides, so that every player sees the same lamps.
 *
 * It only writes on a change of what the triggers ask: a lamp somebody put out by hand stays out while the room is
 * occupied, and the sensor has the say again once the room emptied and somebody comes back. At the first look (the
 * room opens, empty) every object with a trigger is set to what its triggers ask.
 *
 * Its cost follows the number of triggers, not the number of objects: the switches with a trigger are read again
 * only when the map changed, and the players are not read at all on a map without one.
 */
export class SwitchTriggerEvaluator {
    /** When each presence sensor last sensed somebody. */
    private readonly lastSeen = new Map<string, number>();
    /** What the triggers asked of each object, as last written. */
    private readonly asked = new Map<string, { key: EntityStateKey; on: boolean }>();
    private switches: AutomaticSwitch[] = [];
    private readFor: string | undefined | null = null;
    private timer: ReturnType<typeof setInterval> | undefined;

    constructor(
        private readonly room: Pick<GameRoom, "getWam" | "getUsers">,
        private readonly states: {
            setAutomatic(entityId: string, key: EntityStateKey, value: EntityStateValue): "set" | "same" | "refused";
        },
        private readonly now: () => number = Date.now,
    ) {}

    public start(): void {
        this.timer ??= setInterval(() => this.tick(), SWITCH_TRIGGER_TICK_MS);
    }

    public stop(): void {
        clearInterval(this.timer);
        this.timer = undefined;
    }

    /** One look at the triggers. Returns the objects whose state was written. */
    public tick(): string[] {
        const switches = this.automaticSwitches();
        if (switches.length === 0) {
            this.lastSeen.clear();
            this.asked.clear();
            return [];
        }
        const time = this.now();
        const users = [...this.room.getUsers().values()];
        const wanted = new Map<string, { key: EntityStateKey; on: boolean }>();
        for (const automatic of switches) {
            const on = this.holds(automatic, users, time);
            for (const targetId of automaticSwitchTargetIds(automatic.property)) {
                const previous = wanted.get(targetId);
                wanted.set(targetId, { key: automatic.property.key, on: on || (previous?.on ?? false) });
            }
        }
        // An object no trigger commands any more keeps its last state; it is asked afresh if one commands it again.
        for (const targetId of this.asked.keys()) {
            if (!wanted.has(targetId)) {
                this.asked.delete(targetId);
            }
        }
        const written: string[] = [];
        for (const [targetId, { key, on }] of wanted) {
            const asked = this.asked.get(targetId);
            if (asked?.on === on && asked.key === key) {
                continue;
            }
            const result = this.states.setAutomatic(targetId, key, on ? "true" : "false");
            // A change refused (the object changed a moment ago) is asked again at the next look.
            if (result !== "refused") {
                this.asked.set(targetId, { key, on });
            }
            if (result === "set") {
                written.push(targetId);
            }
        }
        return written;
    }

    private holds({ id, entity, property }: AutomaticSwitch, users: TriggerUser[], time: number): boolean {
        const trigger = property.trigger;
        if (!trigger) {
            return false;
        }
        if (trigger.type === "hours") {
            return isWithinHours(trigger.from, trigger.to, parisMinutesOfDay(new Date(time)));
        }
        if (users.some((user) => this.senses(entity, trigger, user))) {
            this.lastSeen.set(id, time);
            return true;
        }
        const last = this.lastSeen.get(id);
        return last !== undefined && time - last < trigger.offDelay * 1000;
    }

    private senses(
        entity: WAMEntityData,
        trigger: Extract<SwitchPropertyData["trigger"], { type: "presence" }>,
        user: TriggerUser,
    ): boolean {
        if (trigger.scope === "proximity" || trigger.scope === "cone") {
            if (!isAtAreaLevel(entity, user.getFloorZ())) {
                return false;
            }
            // Proximity is a cone open all around.
            return isInCone(
                { x: entity.x + SENSOR_MIDDLE_PX, y: entity.y + SENSOR_MIDDLE_PX },
                {
                    direction: trigger.direction,
                    angle: trigger.scope === "cone" ? trigger.angle : 360,
                    reach: trigger.tiles * TILE_PX,
                },
                user.getPosition(),
            );
        }
        const area = this.room.getWam()?.areas.find((candidate) => candidate.id === trigger.areaId);
        // An area only applies to the players of its floor, as in AreaZoneTracker.
        return (
            area !== undefined &&
            isAtAreaLevel(area, user.getFloorZ()) &&
            AreaZoneTracker.isPositionInArea(user.getPosition(), area)
        );
    }

    /** The switches of the map that have a trigger, read again only when the map changed. */
    private automaticSwitches(): AutomaticSwitch[] {
        const wam = this.room.getWam();
        const version = wam?.lastCommandId;
        if (this.readFor !== null && this.readFor === version) {
            return this.switches;
        }
        this.readFor = version;
        this.switches = [];
        for (const [id, entity] of Object.entries(wam?.entities ?? {})) {
            const property = entity.properties?.find(
                (candidate): candidate is SwitchPropertyData => candidate.type === "switchPropertyData",
            );
            if (property?.trigger) {
                this.switches.push({ id, entity, property });
            }
        }
        const ids = new Set(this.switches.map((automatic) => automatic.id));
        for (const id of this.lastSeen.keys()) {
            if (!ids.has(id)) {
                this.lastSeen.delete(id);
            }
        }
        return this.switches;
    }
}
