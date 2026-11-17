import { alignedSwitchValue, isAtAreaLevel } from "@workadventure/map-editor";
import type { EntityPrefab, EntityStateKey, EntityStateValue, SwitchPropertyData } from "@workadventure/map-editor";

/** An object of the map a switch may command: where it is, on which floor, and the states it has. */
export interface SwitchableTarget {
    id: string;
    point: { x: number; y: number };
    elevation: number;
    keys: readonly EntityStateKey[];
    /** The room it is in (see roomIdAt), if any. */
    roomId?: string;
}

/** A room of the map: an area, or a raised floor. */
export interface SwitchRoom {
    areaId: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

/** A lamp hangs on the wall above its room: up to the top of the tallest wall (4 tiles) above the room. */
const ROOM_MARGIN_ABOVE_PX = 128;
/** On the other sides an object against a wall of its room is at most a tile out of it. */
const ROOM_MARGIN_PX = 32;
/**
 * The face of the wall of a room is drawn on the tile above the room. An object there hangs on that wall and belongs
 * to that room, even where the area of the room above was drawn down over the wall.
 */
const ROOM_WALL_FACE_PX = 32;

/**
 * The room an object is in, among the rooms of its floor: the one whose wall it hangs on (the tile above the room);
 * else the smallest that holds its point; failing that the nearest one it is just out of — a lamp hung on the wall above a room, a switch against one of its walls — so that
 * "the lamps of this room" means what one sees. Undefined far from any room.
 */
export function roomIdAt(point: { x: number; y: number }, rooms: readonly SwitchRoom[]): string | undefined {
    let inside: SwitchRoom | undefined;
    let near: { room: SwitchRoom; distance: number } | undefined;
    let onWall: { room: SwitchRoom; above: number } | undefined;
    for (const room of rooms) {
        const dx = Math.max(room.x - point.x, 0, point.x - (room.x + room.width));
        const above = room.y - point.y;
        const below = point.y - (room.y + room.height);
        if (dx === 0 && above > 0 && above <= ROOM_WALL_FACE_PX && (!onWall || above < onWall.above)) {
            onWall = { room, above };
        }
        if (dx === 0 && above <= 0 && below <= 0) {
            if (!inside || room.width * room.height < inside.width * inside.height) {
                inside = room;
            }
            continue;
        }
        if (dx > ROOM_MARGIN_PX || above > ROOM_MARGIN_ABOVE_PX || below > ROOM_MARGIN_PX) {
            continue;
        }
        const distance = Math.hypot(dx, Math.max(above, below, 0));
        if (!near || distance < near.distance) {
            near = { room, distance };
        }
    }
    return (onWall?.room ?? inside ?? near?.room)?.areaId;
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
 * whose room is its own (`roomId`, see roomIdAt), on its own floor. A listed object that is gone is left out; a switch in no room commands nothing.
 */
export function resolveSwitchTargets(
    property: SwitchPropertyData,
    roomId: string | undefined,
    switchElevation: number,
    candidates: readonly SwitchableTarget[],
): SwitchableTarget[] {
    const switchable = candidates.filter((candidate) => candidate.keys.includes(property.key));
    const { targets } = property;
    if (targets.mode === "ids") {
        const ids = new Set(targets.ids);
        return switchable.filter((candidate) => ids.has(candidate.id));
    }
    if (roomId === undefined) {
        return [];
    }
    return switchable.filter(
        (candidate) =>
            candidate.roomId === roomId && isAtAreaLevel({ elevation: switchElevation }, candidate.elevation),
    );
}

/** What a press sets the targets to: everything off when one of them is on, everything on otherwise. */
export function switchPressValue(
    targets: readonly SwitchableTarget[],
    isOn: (entityId: string) => boolean,
): EntityStateValue | undefined {
    return alignedSwitchValue(targets.map((target) => (isOn(target.id) ? "true" : "false")));
}
