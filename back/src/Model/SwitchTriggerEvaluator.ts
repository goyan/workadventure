import {
    automaticSwitchTargetIds,
    isWithinHours,
    minutesOfDayIn,
    switchPresenceSenses,
    switchPropertyIn,
} from "@workadventure/map-editor";
import * as Sentry from "@sentry/node";
import { asError } from "catch-unknown";
import type { EntityStateKey, EntityStateValue, SwitchPropertyData, WAMEntityData } from "@workadventure/map-editor";
import type { GameRoom } from "./GameRoom";

/**
 * The triggers of a map are looked at this often: 5 times a second, so that a lamp lights before a walking avatar has
 * passed its sensor (at once a second it lit behind them).
 */
export const SWITCH_TRIGGER_TICK_MS = 200;
/** A report of animals holds this long: a browser repeats it while an animal stays in a sensor. */
export const ANIMAL_REPORT_TTL_MS = 5000;
const MAX_REPORTED_SENSORS = 50;

interface AutomaticSwitch {
    id: string;
    entity: WAMEntityData;
    property: SwitchPropertyData;
}

type TriggerUser = { getPosition(): { x: number; y: number }; getFloorZ(): number };

/**
 * Uses the switches that have a trigger (a presence sensor, a timer) for them: 5 times a second it works out, for each
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
    /** The sensors each browser last said one of its wandering animals stands in, and when it said so. */
    private readonly animalReports = new Map<
        string,
        { ids: Set<string>; at: number; from: { x: number; y: number } | undefined }
    >();
    private switches: AutomaticSwitch[] = [];
    private readFor: string | undefined | null = null;
    private timer: ReturnType<typeof setInterval> | undefined;

    constructor(
        private readonly room: Pick<GameRoom, "getWam" | "getUsers">,
        private readonly states: {
            setAutomatic(entityId: string, key: EntityStateKey, value: EntityStateValue): "set" | "same" | "refused";
        },
        private readonly now: () => number = Date.now,
        /**
         * Where the animals of the land the server runs are (antelopes, lions, tigers), in map pixels, on the
         * ground: they are sensed like an avatar, without any report of a browser.
         */
        private readonly animals: () => readonly { x: number; y: number }[] = () => [],
    ) {}

    public start(): void {
        this.timer ??= setInterval(() => {
            try {
                this.tick();
            } catch (error) {
                // An error that left this timer would stop the whole server: the lamps wait for the next look.
                console.error("Could not look at the triggers of the map", asError(error));
                Sentry.captureException(error);
            }
        }, SWITCH_TRIGGER_TICK_MS);
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
        const users: TriggerUser[] = [...this.room.getUsers().values()];
        for (const animal of this.animals()) users.push({ getPosition: () => animal, getFloorZ: () => 0 });
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
            // In the time of the place of the map (Paris without one).
            const timeZone = this.room.getWam()?.settings?.weatherLocation?.timezone;
            return isWithinHours(trigger.from, trigger.to, minutesOfDayIn(new Date(time), timeZone));
        }
        // The area a sensor watches is looked for once, not for each player.
        const area =
            trigger.scope === "room" || trigger.scope === "area"
                ? this.room.getWam()?.areas.find((candidate) => candidate.id === trigger.areaId)
                : undefined;
        if (
            users.some((user) => switchPresenceSenses(entity, trigger, area, user.getPosition(), user.getFloorZ())) ||
            this.animalIn(id, time, trigger.scope === "building")
        ) {
            this.lastSeen.set(id, time);
            return true;
        }
        const last = this.lastSeen.get(id);
        return last !== undefined && time - last < trigger.offDelay * 1000;
    }

    /**
     * A browser tells which presence sensors one of its wandering animals stands in (all of them, at each report; an
     * empty list when none any more). Only the browsers know where the animals are: each works them out from the
     * clock, the server has neither them nor the collisions of the map. A report holds for a few seconds, so a browser
     * that left stops counting. Anything that is not a presence sensor of the map is ignored.
     *
     * The sensors of a building are reported the same way, for the avatar of the user too. A browser stops reporting
     * while its tab is in the background, with the avatar still in the building: for those sensors the last report
     * holds for as long as that user is in the room and stands where they stood when it was made.
     */
    public reportAnimals(reporter: string, switchIds: readonly string[]): void {
        const sensors = new Set(
            this.automaticSwitches()
                .filter((automatic) => automatic.property.trigger?.type === "presence")
                .map((automatic) => automatic.id),
        );
        const ids = switchIds.slice(0, MAX_REPORTED_SENSORS).filter((id) => sensors.has(id));
        if (ids.length === 0) {
            this.animalReports.delete(reporter);
        } else {
            this.animalReports.set(reporter, { ids: new Set(ids), at: this.now(), from: this.positionOf(reporter) });
        }
    }

    private animalIn(switchId: string, time: number, heldWhileStill: boolean): boolean {
        for (const [reporter, report] of this.animalReports) {
            const fresh = time - report.at < ANIMAL_REPORT_TTL_MS;
            const still = !fresh && this.standsWhereReported(reporter, report.from);
            if (!fresh && !still) {
                this.animalReports.delete(reporter);
            } else if (report.ids.has(switchId) && (fresh || heldWhileStill)) {
                return true;
            }
        }
        return false;
    }

    /** Where the user who reports stands now; the reporter is the id of a user of the room. */
    private positionOf(reporter: string): { x: number; y: number } | undefined {
        const position = this.room.getUsers().get(Number(reporter))?.getPosition();
        return position ? { x: position.x, y: position.y } : undefined;
    }

    private standsWhereReported(reporter: string, from: { x: number; y: number } | undefined): boolean {
        const position = this.positionOf(reporter);
        return from !== undefined && position !== undefined && position.x === from.x && position.y === from.y;
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
            // Checked, with its defaults: the map holds what the last edit command carried (see switchPropertyIn).
            const property = switchPropertyIn(entity.properties);
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
