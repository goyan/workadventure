import {
    ENTITY_STATE_DEFAULT,
    SWITCH_MAX_TARGETS,
    isAutomaticSwitch,
    isEntityStateKey,
    isEntityStateValue,
    switchMayReach,
    switchPropertyIn,
} from "@workadventure/map-editor";
import type { EntityStateKey, EntityStateValue } from "@workadventure/map-editor";
import type { EntityStateMessage, SetEntityStateMessage } from "@workadventure/messages";
import type { VariablesRepositoryInterface } from "../Services/Repository/VariablesRepositoryInterface";
import type { GameRoom } from "./GameRoom";
import type { User } from "./User";

/** A user may use switches this many times a second. */
export const SWITCH_MAX_PRESSES_PER_SECOND = 5;
/**
 * The state of an object changes at most 3 times a second, whoever asks: several users on the switches of one lamp
 * cannot make it flash faster (WCAG 2.3.1).
 */
export const ENTITY_STATE_MIN_CHANGE_INTERVAL_MS = 334;
const FIELD_DELIMITER = "::";

/**
 * Keeps the state of the objects of a map that can be switched (a lamp that is on or off). The wiring is in the WAM
 * (`switchPropertyData`); the state lives here, is sent to every player of the room and to the ones who join, and
 * survives a restart and an empty room (saved in its own Redis hash, like the Jam rooms of the listening zones).
 * Only the states that differ from the default are kept: an object nobody ever switched costs nothing.
 *
 * A press is never trusted: the switch, its key, its tags and each target are checked against the WAM. The server does
 * not know what an object is (the catalogs are not loaded here): a state set on an object that has no use for it is
 * simply ignored by the front.
 */
export class EntityStateManager {
    private readonly states = new Map<string, Map<EntityStateKey, EntityStateValue>>();
    private readonly lastChange = new Map<string, number>();
    private readonly presses = new Map<string, number[]>();

    constructor(
        private readonly room: Pick<GameRoom, "getWam" | "sendSubMessageToRoom">,
        private readonly store?: { repository: VariablesRepositoryInterface; roomUrl: string },
        private readonly now: () => number = Date.now,
    ) {}

    /** Applies the press of a switch and returns the objects whose state changed. A press that is not valid is ignored. */
    public press(user: Pick<User, "uuid" | "tags">, message: SetEntityStateMessage): string[] {
        const { key, value } = message;
        if (!isEntityStateKey(key) || !isEntityStateValue(value) || message.entityIds.length > SWITCH_MAX_TARGETS) {
            return [];
        }
        const entities = this.room.getWam()?.entities;
        const switchEntity = entities?.[message.switchId];
        const property = switchPropertyIn(switchEntity?.properties);
        // A switch with a trigger is used by the server alone (see SwitchTriggerEvaluator), never by hand.
        if (!entities || !switchEntity || !property || property.key !== key || isAutomaticSwitch(property)) {
            return [];
        }
        const allowedTags = property.allowedTags ?? [];
        if (allowedTags.length > 0 && !user.tags.some((tag) => allowedTags.includes(tag))) {
            return [];
        }
        if (!this.mayPress(user.uuid)) {
            return [];
        }

        const time = this.now();
        const changed: string[] = [];
        for (const entityId of new Set(message.entityIds)) {
            const target = entities[entityId];
            if (!target || !switchMayReach(switchEntity, target, property.targets, entityId)) {
                continue;
            }
            if (this.get(entityId, key) === value) {
                continue;
            }
            const last = this.lastChange.get(entityId);
            if (last !== undefined && time - last < ENTITY_STATE_MIN_CHANGE_INTERVAL_MS) {
                continue;
            }
            this.lastChange.set(entityId, time);
            this.set(entityId, key, value);
            this.save(entityId, key, value);
            this.room.sendSubMessageToRoom({
                message: { $case: "entityStateMessage", entityStateMessage: { entityId, key, value } },
            });
            changed.push(entityId);
        }
        return changed;
    }

    /**
     * Sets a state for a trigger of the map (a presence sensor, a timer; see SwitchTriggerEvaluator): no user, so no
     * limit of presses, but the same limit of changes of an object. "refused" asks to try again later.
     */
    public setAutomatic(entityId: string, key: EntityStateKey, value: EntityStateValue): "set" | "same" | "refused" {
        if (!this.room.getWam()?.entities[entityId] || this.get(entityId, key) === value) {
            return "same";
        }
        const time = this.now();
        const last = this.lastChange.get(entityId);
        if (last !== undefined && time - last < ENTITY_STATE_MIN_CHANGE_INTERVAL_MS) {
            return "refused";
        }
        this.lastChange.set(entityId, time);
        this.set(entityId, key, value);
        this.save(entityId, key, value);
        this.room.sendSubMessageToRoom({
            message: { $case: "entityStateMessage", entityStateMessage: { entityId, key, value } },
        });
        return "set";
    }

    /** The states that differ from the default, for a player who joins the room. */
    public getAll(): EntityStateMessage[] {
        const all: EntityStateMessage[] = [];
        for (const [entityId, states] of this.states) {
            for (const [key, value] of states) {
                all.push({ entityId, key, value });
            }
        }
        return all;
    }

    /**
     * Brings back the states saved before a restart, for the objects the map still has. A store that does not answer
     * must not keep the room closed: every object is then in its default state.
     */
    public async restore(): Promise<void> {
        if (!this.store) {
            return;
        }
        let saved: { [field: string]: string };
        try {
            saved = await this.store.repository.loadVariables(this.hashKey());
        } catch (error) {
            console.error("Could not restore the states of the entities of the map", error);
            return;
        }
        const entities = this.room.getWam()?.entities ?? {};
        for (const [field, value] of Object.entries(saved)) {
            const [entityId, key, ...rest] = field.split(FIELD_DELIMITER);
            if (!entityId || !key || rest.length > 0 || !isEntityStateKey(key) || !isEntityStateValue(value)) {
                continue;
            }
            if (!entities[entityId]) {
                // The object was deleted while the room was closed: its state must not come back on anything.
                this.save(entityId, key, ENTITY_STATE_DEFAULT);
                continue;
            }
            this.set(entityId, key, value);
        }
    }

    private get(entityId: string, key: EntityStateKey): EntityStateValue {
        return this.states.get(entityId)?.get(key) ?? ENTITY_STATE_DEFAULT;
    }

    private set(entityId: string, key: EntityStateKey, value: EntityStateValue): void {
        const states = this.states.get(entityId) ?? new Map<EntityStateKey, EntityStateValue>();
        if (value === ENTITY_STATE_DEFAULT) {
            states.delete(key);
        } else {
            states.set(key, value);
        }
        if (states.size === 0) {
            this.states.delete(entityId);
        } else {
            this.states.set(entityId, states);
        }
    }

    /** Whether this user may press now; counts the press. */
    private mayPress(userUuid: string): boolean {
        const time = this.now();
        const recent = (this.presses.get(userUuid) ?? []).filter((at) => time - at < 1000);
        if (recent.length >= SWITCH_MAX_PRESSES_PER_SECOND) {
            this.presses.set(userUuid, recent);
            return false;
        }
        recent.push(time);
        this.presses.set(userUuid, recent);
        return true;
    }

    private save(entityId: string, key: EntityStateKey, value: EntityStateValue): void {
        if (!this.store) {
            return;
        }
        this.store.repository
            .saveVariable(
                this.hashKey(),
                `${entityId}${FIELD_DELIMITER}${key}`,
                value === ENTITY_STATE_DEFAULT ? "" : value,
            )
            .catch((error) => console.error("Could not save the state of an entity of the map", error));
    }

    private hashKey(): string {
        return `entity-states:${this.store?.roomUrl ?? ""}`;
    }
}
