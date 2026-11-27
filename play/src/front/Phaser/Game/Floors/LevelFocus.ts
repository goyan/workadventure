import { floorDepth } from "../MapEditor/MapLayer/FloorDepth";
import type { PlacedStair } from "../MapEditor/MapLayer/FloorModel";
import type { FloorWalkState } from "../MapEditor/MapLayer/FloorWalk";

/**
 * Where the avatar is, among the floors of the map (as in top-down games with storeys): its own floor is drawn as it is,
 * the floors under it are darkened by one veil laid just under its floor (everything lower is drawn under it), the
 * floors above it are hidden once it is indoors or up a floor.
 */

/** The veil over the floors under the avatar: dark grey, clearly darker than the floor the avatar is on. */
export const VEIL_COLOR = 0x2b2f38;
export const VEIL_ALPHA = 0.7;
/** A floor above the avatar seen through, outdoors around the avatar: this opaque, greyed by this tint. */
export const ABOVE_ALPHA = 0.3;
export const ABOVE_TINT = 0x9aa0aa;
/** Fade of the veil when the avatar changes floors. */
export const LEVEL_FADE_MS = 300;

export type LevelLook = "below" | "current" | "above";

/** The floors the avatar is on: its own, or both floors of the stair it is on (no blink while it climbs). */
export function currentLevels(state: FloorWalkState, stairs: readonly PlacedStair[]): ReadonlySet<number> {
    const stair = state.stair === undefined ? undefined : stairs[state.stair];
    return stair ? new Set([stair.base, stair.top]) : new Set([state.elevation]);
}

export function levelLook(elevation: number, current: ReadonlySet<number>): LevelLook {
    const levels = [...current];
    if (elevation < Math.min(...levels)) return "below";
    if (elevation > Math.max(...levels)) return "above";
    return "current";
}

/**
 * Depth of the veil: just under the slabs of the lowest current floor (drawn at `floorDepth(level, 0) - 1`), over
 * everything standing lower. None on the ground: nothing is under it.
 */
export function veilDepth(current: ReadonlySet<number>): number | undefined {
    const lowest = Math.min(...current);
    return lowest > 0 ? floorDepth(lowest, 0) - 2 : undefined;
}

/** One step of a fade from `value` to `target` over LEVEL_FADE_MS for the whole `span`; at once when motion is reduced. */
export function fadeToward(value: number, target: number, delta: number, span: number, reducedMotion: boolean): number {
    if (reducedMotion) return target;
    const change = (span * delta) / LEVEL_FADE_MS;
    return target > value ? Math.min(target, value + change) : Math.max(target, value - change);
}

/**
 * How a floor above the avatar shows. Indoors, or up a floor, it is hidden whole with what stands on it (the stairs going
 * up to it stay, see StairHints) when a roof closes the space over the avatar (`roofed`, see roofOver); under an open
 * space it shows, as a mezzanine seen from the hall. Outdoors on the ground a building stays whole; a floor that hides the avatar lets it
 * show through a window around it.
 *
 * A floor in the open air (`openAir`: no room under any of its slabs, as the deck of a bridge) is no storey of a
 * building: it always shows, with the window around an avatar under it, unless it is drawn over the room the avatar
 * is in (`coversRoom`).
 */
export function aboveLevelShows(where: {
    indoors: boolean;
    /** Up a floor of a building (not on a floor in the open air, which is outdoors like the ground). */
    raised: boolean;
    hidesAvatar: boolean;
    underFloor?: boolean;
    openAir?: boolean;
    coversRoom?: boolean;
    /**
     * Whether this floor is out of sight from where the avatar stands: closed when it is the roof of the room of the
     * avatar or above it (see roomRoof), or not over that room at all. In an open room (a hall under a mezzanine), the
     * parts of the floors over that room show; the floors over the other rooms never do. Absent: closed.
     */
    roofed?: boolean;
}): {
    alpha: number;
    window?: true;
} {
    if (where.openAir) {
        if (where.indoors && where.coversRoom) return { alpha: 0 };
        return where.hidesAvatar || where.underFloor ? { alpha: 1, window: true } : { alpha: 1 };
    }
    if (where.indoors || where.raised || where.underFloor) {
        if (where.roofed ?? true) return { alpha: 0 };
        return where.hidesAvatar ? { alpha: 1, window: true } : { alpha: 1 };
    }
    return where.hidesAvatar ? { alpha: 1, window: true } : { alpha: 1 };
}

/**
 * The altitude of the roof over the avatar: the lowest floor above its own ones with a slab right over the tile of the
 * ground it stands on (`covers`). Infinity under the open sky.
 */
export function roofOver(
    levels: readonly { elevation: number; covers: boolean }[],
    current: ReadonlySet<number>,
): number {
    const top = Math.max(...current);
    let roof = Number.POSITIVE_INFINITY;
    for (const level of levels) {
        if (level.covers && level.elevation > top && level.elevation < roof) roof = level.elevation;
    }
    return roof;
}

/**
 * The roof of a room of the ground: the lowest floor above the avatar that covers at least three quarters of the room
 * (`covered`: its cells under a slab of that floor or under the well of a stair reaching it, out of `size`). An office
 * under a floor is closed even where an edge leaves a few cells open; an office under a mezzanine (two thirds of it
 * covered, as Hervé's) and a hall are open.
 */
export function roomRoof(
    levels: readonly { elevation: number; covered: number }[],
    size: number,
    current: ReadonlySet<number>,
): number {
    return roofOver(
        levels.map(({ elevation, covered }) => ({ elevation, covers: size > 0 && covered * 4 >= size * 3 })),
        current,
    );
}

/** Rooms of the ground this small are slivers between walls, not rooms: they open or close nothing. */
export const ROOM_MIN_SIZE = 9;

/**
 * Whether a floor of a building shows from the ground indoors: it lies over open rooms only (below the roof of each,
 * see roomRoof), as the mezzanine of a hall or of an open office, seen from anywhere inside. A floor over a closed
 * room stays hidden, and so does one drawn over the closed room of the avatar.
 */
export function opensOver(
    level: { elevation: number; roomsUnder: ReadonlySet<number>; roomsCovered: ReadonlySet<number> },
    roofOf: (room: number) => number,
    room: number,
): boolean {
    if (level.roomsUnder.size === 0) return false;
    for (const under of level.roomsUnder) if (level.elevation >= roofOf(under)) return false;
    return !(level.roomsCovered.has(room) && level.elevation >= roofOf(room));
}

/** The veil fades in over LEVEL_FADE_MS; it goes at once, so that nothing steps back under a veil still there. */
export function veilAlphaToward(value: number, target: number, delta: number, reducedMotion: boolean): number {
    return target < value ? target : fadeToward(value, target, delta, VEIL_ALPHA, reducedMotion);
}

/** Depth of a stair: its own one, but over the veil while it comes from under the floor of the avatar. */
export function stairDepth(own: number, veil: number | undefined, look: LevelLook): number {
    return veil !== undefined && look === "below" ? veil + 1 : own;
}

/** Opacity of a stair drawn over the avatar: it lets the avatar show through, and still shows itself. */
export const STAIR_OVER_AVATAR_ALPHA = 0.5;

/**
 * Whether a stair is drawn over the avatar: the avatar walks behind it (further north on the ground than its foot row,
 * under its image), lower than where it arrives, and not on it.
 */
export function stairCoversAvatar(
    stair: { image: { x: number; y: number; width: number; height: number }; groundBottom: number; top: number },
    avatar: { x: number; y: number; elevation: number; onStair: boolean },
): boolean {
    if (avatar.onStair || avatar.elevation >= stair.top - 1) return false;
    if (avatar.y + avatar.elevation >= stair.groundBottom) return false;
    const { image } = stair;
    return (
        avatar.x + 10 > image.x &&
        avatar.x - 10 < image.x + image.width &&
        avatar.y > image.y &&
        avatar.y - 30 < image.y + image.height
    );
}

/**
 * Whether a stair shows: only the ones leaving or reaching the floor of the avatar. One between two other floors,
 * under the veil or above, would seem to lead from where the avatar stands.
 */
export function stairShows(stair: { base: number; top: number }, current: ReadonlySet<number>): boolean {
    return current.has(stair.base) || current.has(stair.top);
}

/** In the editor, a floor in the open air above the platform edited: seen through, what is edited under it shows. */
export const EDITOR_OPEN_AIR_ABOVE_ALPHA = 0.6;

/**
 * In construction mode only the selected platform is visible; auto keeps the whole building. A floor in the open air
 * (`openAir`, the deck of a bridge) stays in view whatever the platform edited: a ramp placed on the ground is aimed at
 * its edge.
 */
export function editorLevelAlpha(elevation: number, selected: number, openAir = false): number {
    if (!Number.isFinite(selected) || elevation === selected) return 1;
    if (openAir) return elevation > selected ? EDITOR_OPEN_AIR_ABOVE_ALPHA : 1;
    return 0;
}
