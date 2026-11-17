import { ENTITY_STATE_DEFAULT, isEntityStateKey, isEntityStateValue } from "@workadventure/map-editor";
import type { EntityStateKey, EntityStateValue } from "@workadventure/map-editor";
import type { Observable, Subscription } from "rxjs";
import { writable } from "svelte/store";
import type { Readable } from "svelte/store";

export interface EntityState {
    entityId: string;
    key: string;
    value: string;
}

export interface EntityStatesConnection {
    entityStateMessageStream: Observable<EntityState>;
    emitSetEntityState(switchId: string, entityIds: string[], key: string, value: string): void;
}

/**
 * The state of the objects of the map that can be switched (a lamp that is on or off), as the server keeps it: the
 * states received on joining the room, then every change. An object the server said nothing about is in its default
 * state (on). A press on a switch only asks the server: nothing changes here before it answers, so that every player
 * sees the same thing.
 */
export class EntityStatesManager {
    private readonly states = new Map<string, EntityStateValue>();
    private readonly _version = writable(0);
    /** Goes up at every change of a state: what draws from the states redraws on it. */
    public readonly version: Readable<number> = { subscribe: this._version.subscribe };
    private readonly subscription: Subscription;

    constructor(
        private readonly connection: EntityStatesConnection,
        initial: readonly EntityState[],
    ) {
        for (const state of initial) {
            this.apply(state);
        }
        this.subscription = connection.entityStateMessageStream.subscribe((state) => {
            if (this.apply(state)) {
                this._version.update((version) => version + 1);
            }
        });
    }

    public get(entityId: string, key: EntityStateKey): EntityStateValue {
        return this.states.get(stateId(entityId, key)) ?? ENTITY_STATE_DEFAULT;
    }

    public isOn(entityId: string): boolean {
        return this.get(entityId, "on") === "true";
    }

    /** Asks the server to set the state `key` of the targets of a switch. */
    public press(switchId: string, entityIds: string[], key: EntityStateKey, value: EntityStateValue): void {
        if (entityIds.length === 0) {
            return;
        }
        this.connection.emitSetEntityState(switchId, entityIds, key, value);
    }

    public destroy(): void {
        this.subscription.unsubscribe();
    }

    /** Whether the state changed. A key or a value that is not known (a newer server) is ignored. */
    private apply({ entityId, key, value }: EntityState): boolean {
        if (!isEntityStateKey(key) || !isEntityStateValue(value) || this.get(entityId, key) === value) {
            return false;
        }
        if (value === ENTITY_STATE_DEFAULT) {
            this.states.delete(stateId(entityId, key));
        } else {
            this.states.set(stateId(entityId, key), value);
        }
        return true;
    }
}

function stateId(entityId: string, key: EntityStateKey): string {
    return `${entityId}::${key}`;
}
