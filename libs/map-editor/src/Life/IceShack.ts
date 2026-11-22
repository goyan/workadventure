import { ICE_SHACK_MM, ICE_SLIPS_MM } from "../Terrain/Ice";
import { TERRAIN_CELL, TILE_PX } from "../types";
import { DOLPHIN_DEPTH_PX } from "./WaterBodies";

/**
 * The ice fishing shacks of a room: a player standing on ice thick enough over deep water drills a hole in it and puts
 * a small shack up around it; the shack stays where it went up, and anyone may sit on its stool and fish through its
 * hole (one at a time). It is an object of the room kept by the server, never an edit of the map: it goes when the ice
 * under it thaws, or when who put it up stayed away a long time. Pure rules, shared by the back (which keeps the
 * shacks) and the front.
 *
 * Positions are in map pixels, those of an avatar as the server knows them (where the fishing lines are cast from).
 */

/** The least water under the hole (px of water): where an avatar swims, not a frozen puddle. */
export const ICE_SHACK_MIN_DEPTH_PX = DOLPHIN_DEPTH_PX;
/** The hole is drilled this far to the right of the avatar, who then sits facing it (px). */
export const ICE_SHACK_HOLE_DX = 18;
/** The shacks of a room, at most. */
export const ICE_SHACK_MAX_PER_ROOM = 8;
/** Two holes are at least this far apart (px): three tiles, room for a shack and a path between. */
export const ICE_SHACK_MIN_SPACING_PX = 3 * TILE_PX;
/** No shack over an object of the map: its hole at least this far from where an object is placed (px). */
export const ICE_SHACK_OBJECT_MARGIN_PX = TILE_PX;
/** How long the hole takes to drill with the auger (ms). */
export const ICE_SHACK_DRILL_MS = 2500;
/** How long the shack then takes to go up around it (ms). */
export const ICE_SHACK_RAISE_MS = 1500;
/** From its start, the shack is used once its hole is drilled and it is up (ms). */
export const ICE_SHACK_READY_MS = ICE_SHACK_DRILL_MS + ICE_SHACK_RAISE_MS;
/** How long the ice cracks under a shack too heavy for it before the shack is taken down (ms). */
export const ICE_SHACK_CRACK_MS = 5000;
/** A shack whose builder stayed out of the room this long is taken down (ms): a day of the real clock. */
export const ICE_SHACK_OWNER_AWAY_MS = 24 * 3600 * 1000;
/** A player enters a shack, or takes it down, from at most this far from its stool (px). */
export const ICE_SHACK_REACH_PX = 2 * TILE_PX;
/** A player who moved this far from the stool got up (px). */
export const ICE_SHACK_SEAT_TOLERANCE_PX = 12;

/**
 * The ground a shack is put on, as kept by the server: the ice over a tile of 32 px (mm), the water over a cell of
 * 16 px (px of water), and whether a cell is in a pool.
 */
export interface IceShackGround {
    iceMmAt(tileX: number, tileY: number): number;
    depthPxAt(cellX: number, cellY: number): number;
    inPool(cellX: number, cellY: number): boolean;
}

export interface IceShack {
    id: number;
    /** The centre of its hole. */
    x: number;
    y: number;
    /** Who put it up: a key that stays through a reconnection (their uuid), and their name. */
    ownerKey: string;
    ownerName: string;
    builtAt: number;
    /** When who put it up was last in the room. */
    ownerSeenAt: number;
    /** Since when its ice is too thin for it; undefined while it bears it. */
    crackingSince?: number;
}

export type IceShackSite = "ok" | "noIce" | "thinIce" | "shallow" | "pool";
export type IceShackPlacement = "onePerPlayer" | "roomFull" | "tooClose" | "object";

/**
 * What happens to a shack, or to what a player asked: told to the room. Their number on the wire is their index.
 */
export const ICE_SHACK_EVENTS = [
    "built",
    "noIce",
    "thinIce",
    "shallow",
    "pool",
    "tooClose",
    "onePerPlayer",
    "roomFull",
    "object",
    "notOnGround",
    "occupied",
    "tooFar",
    "notOwner",
    "notReady",
    "cracking",
    "collapsed",
    "dismantled",
    "abandoned",
    "entered",
    "left",
    "unknown",
] as const;
export type IceShackEvent = (typeof ICE_SHACK_EVENTS)[number];

/** An event on the wire, and back; an unknown number is "unknown". */
export function iceShackEventOnWire(event: IceShackEvent): number {
    return ICE_SHACK_EVENTS.indexOf(event);
}
export function iceShackEventOfWire(type: number): IceShackEvent {
    return ICE_SHACK_EVENTS[type] ?? "unknown";
}

/** The hole a player drills, standing at `avatar`: beside them, on their right. */
export function iceShackAt(avatar: { x: number; y: number }): { x: number; y: number } {
    return { x: Math.round(avatar.x) + ICE_SHACK_HOLE_DX, y: Math.round(avatar.y) };
}

/** Where the avatar sits on the stool of a shack, facing its hole. */
export function iceShackSeat(hole: { x: number; y: number }): { x: number; y: number } {
    return { x: hole.x - ICE_SHACK_HOLE_DX, y: hole.y };
}

/**
 * The tiles (32 px) the shack stands on: its floor, from the stool to past the hole. The floor is drawn from 40 px
 * left of the hole to 24 px right of it, from 20 px above it to 12 px below.
 */
export function iceShackFootprintTiles(hole: { x: number; y: number }): { tileX: number; tileY: number }[] {
    const left = Math.floor((hole.x - 40) / TILE_PX);
    const right = Math.floor((hole.x + 23) / TILE_PX);
    const top = Math.floor((hole.y - 20) / TILE_PX);
    const bottom = Math.floor((hole.y + 11) / TILE_PX);
    const tiles: { tileX: number; tileY: number }[] = [];
    for (let tileY = top; tileY <= bottom; tileY++) {
        for (let tileX = left; tileX <= right; tileX++) tiles.push({ tileX, tileY });
    }
    return tiles;
}

/** The thinnest ice under the floor of a shack (mm). */
export function iceShackIce(hole: { x: number; y: number }, ground: IceShackGround): number {
    let thinnest = Infinity;
    for (const { tileX, tileY } of iceShackFootprintTiles(hole)) {
        const ice = ground.iceMmAt(tileX, tileY);
        thinnest = Math.min(thinnest, Number.isFinite(ice) ? ice : 0);
    }
    return thinnest === Infinity ? 0 : thinnest;
}

/**
 * Whether a shack may go up around a hole: not on a pool (treated water, no fish), on ice under its whole floor, ice
 * thick enough for it (ICE_SHACK_MM), over water deep enough under its hole (not a frozen puddle).
 */
export function iceShackSite(hole: { x: number; y: number }, ground: IceShackGround): IceShackSite {
    const cellX = Math.floor(hole.x / TERRAIN_CELL);
    const cellY = Math.floor(hole.y / TERRAIN_CELL);
    for (const { tileX, tileY } of iceShackFootprintTiles(hole)) {
        const cells = TILE_PX / TERRAIN_CELL;
        for (let dy = 0; dy < cells; dy++) {
            for (let dx = 0; dx < cells; dx++) {
                if (ground.inPool(tileX * cells + dx, tileY * cells + dy)) return "pool";
            }
        }
    }
    const ice = iceShackIce(hole, ground);
    if (ice < ICE_SLIPS_MM) return "noIce";
    if (ice < ICE_SHACK_MM) return "thinIce";
    if (ground.depthPxAt(cellX, cellY) < ICE_SHACK_MIN_DEPTH_PX) return "shallow";
    return "ok";
}

/**
 * Whether a shack may go up there among the others of the room: one a player, ICE_SHACK_MAX_PER_ROOM a room, not too
 * close to another, not over an object of the map (`objects`: where they are placed; the server does not know their
 * size, only where they are).
 */
export function iceShackPlacement(
    shacks: readonly IceShack[],
    hole: { x: number; y: number },
    ownerKey: string,
    objects: readonly { x: number; y: number }[],
): IceShackPlacement | undefined {
    if (shacks.some((shack) => shack.ownerKey === ownerKey)) return "onePerPlayer";
    if (shacks.length >= ICE_SHACK_MAX_PER_ROOM) return "roomFull";
    if (shacks.some((shack) => Math.hypot(shack.x - hole.x, shack.y - hole.y) < ICE_SHACK_MIN_SPACING_PX)) {
        return "tooClose";
    }
    if (objects.some((object) => Math.hypot(object.x - hole.x, object.y - hole.y) < ICE_SHACK_OBJECT_MARGIN_PX)) {
        return "object";
    }
    return undefined;
}

/** Whether the hole of a shack is drilled and the shack up: it may be used. */
export function iceShackReady(shack: Pick<IceShack, "builtAt">, now: number): boolean {
    return now - shack.builtAt >= ICE_SHACK_READY_MS;
}

/**
 * A step of the ice under a shack, `iceMm` its thinnest under its floor: the shack stands while the ice bears it; on
 * an ice that thawed too thin it cracks (since `crackingSince`), and it is taken down after ICE_SHACK_CRACK_MS of it,
 * at once when the ice melted away. An ice that thickens again stops the cracks.
 */
export function stepIceShackIce(
    shack: Pick<IceShack, "crackingSince">,
    iceMm: number,
    now: number,
): "standing" | "cracking" | "collapse" {
    if (!(iceMm >= ICE_SLIPS_MM)) return "collapse";
    if (iceMm >= ICE_SHACK_MM) {
        shack.crackingSince = undefined;
        return "standing";
    }
    shack.crackingSince ??= now;
    return now - shack.crackingSince >= ICE_SHACK_CRACK_MS ? "collapse" : "cracking";
}

/** Whether who put a shack up stayed away from the room long enough for it to be taken down. */
export function iceShackAbandoned(shack: Pick<IceShack, "ownerSeenAt">, now: number): boolean {
    return now - shack.ownerSeenAt >= ICE_SHACK_OWNER_AWAY_MS;
}
