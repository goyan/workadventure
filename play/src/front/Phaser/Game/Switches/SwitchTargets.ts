import { alignedSwitchValue, isAtAreaLevel, switchPropertyIn } from "@workadventure/map-editor";
import type { EntityPrefab, EntityStateKey, EntityStateValue, SwitchPropertyData } from "@workadventure/map-editor";

/** An object of the map a switch may command: where it is, on which floor, and the states it has. */
export interface SwitchableTarget {
    id: string;
    point: { x: number; y: number };
    elevation: number;
    keys: readonly EntityStateKey[];
}

export interface SwitchRoom {
    x: number;
    y: number;
    width: number;
    height: number;
}

const NO_KEYS: readonly EntityStateKey[] = [];
const LAMP_KEYS: readonly EntityStateKey[] = ["on"];

/**
 * The states an object has, from its catalog entry: an RGB lamp is `on` or not. The one place where a new kind of
 * object that can be switched (a shutter, `open`) is declared. The lamps that follow the music of a Jam are not
 * switched: they light with the music.
 */
export function entityStateKeysOf(prefab: Pick<EntityPrefab, "lamp">): readonly EntityStateKey[] {
    return prefab.lamp?.kind === "rgb" ? LAMP_KEYS : NO_KEYS;
}

/**
 * The objects a switch commands, among those of the map that have the state it commands: the listed ones, or the ones
 * of its room on its own floor. A listed object that is gone is left out; a switch in no room commands nothing.
 */
export function resolveSwitchTargets(
    property: SwitchPropertyData,
    room: SwitchRoom | undefined,
    switchElevation: number,
    candidates: readonly SwitchableTarget[],
): SwitchableTarget[] {
    const switchable = candidates.filter((candidate) => candidate.keys.includes(property.key));
    const { targets } = property;
    if (targets.mode === "ids") {
        const ids = new Set(targets.ids);
        return switchable.filter((candidate) => ids.has(candidate.id));
    }
    if (!room) {
        return [];
    }
    return switchable.filter(
        ({ point, elevation }) =>
            isAtAreaLevel({ elevation: switchElevation }, elevation) &&
            point.x >= room.x &&
            point.x <= room.x + room.width &&
            point.y >= room.y &&
            point.y <= room.y + room.height,
    );
}

/** What a press sets the targets to: everything off when one of them is on, everything on otherwise. */
export function switchPressValue(
    targets: readonly SwitchableTarget[],
    isOn: (entityId: string) => boolean,
): EntityStateValue | undefined {
    return alignedSwitchValue(targets.map((target) => (isOn(target.id) ? "true" : "false")));
}

/** The switch an object carries, checked: one that is not well formed is not a switch (see switchPropertyIn). */
export function switchPropertyOf(entity: { getProperties(): readonly unknown[] }): SwitchPropertyData | undefined {
    return switchPropertyIn(entity.getProperties());
}
