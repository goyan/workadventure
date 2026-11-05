import { PositionMessage_Direction } from "@workadventure/messages";
import type { EntityPrefab } from "@workadventure/map-editor";
import type { GameScene } from "../Game/GameScene";
import type { Character } from "../Entity/Character";
import type { GameMapFrontWrapper } from "../Game/GameMap/GameMapFrontWrapper";
import type { EntitiesManager } from "../Game/GameMap/EntitiesManager";
import { isSeatObject } from "../../Utils/EntityCategory";

// Below this distance (in pixels), a character is considered to be exactly on its seat.
const SEAT_POSITION_TOLERANCE = 1.5;

export interface Seat {
    /** Unique among the seats of the map: a couch has one seat per place. */
    id: string;
    /** The object the seat belongs to: its hitbox does not push the player sitting on it. */
    entityId: string;
    /**
     * For a seat deduced from the object (no `seat` in the catalog): the zone where the feet must be to sit, i.e.
     * the hitbox and a little margin, since the hitbox keeps the player from standing on the seat itself.
     */
    reach?: { x: number; y: number; width: number; height: number };
    direction: PositionMessage_Direction;
    /** Depth of the seated character: above the seat, except when it turns its back (the backrest hides it). */
    depth: number;
    /** Where the feet of the seated character are. */
    feet: { x: number; y: number };
}

function toPositionDirection(direction: string): PositionMessage_Direction {
    switch (direction) {
        case "Up":
            return PositionMessage_Direction.UP;
        case "Left":
            return PositionMessage_Direction.LEFT;
        case "Right":
            return PositionMessage_Direction.RIGHT;
        default:
            return PositionMessage_Direction.DOWN;
    }
}

function getSeats(scene: GameScene): Seat[] {
    // The map may not be loaded yet when the first characters are created.
    const gameMapFrontWrapper: GameMapFrontWrapper | undefined = scene.getGameMapFrontWrapper();
    const entitiesManager: EntitiesManager | undefined = gameMapFrontWrapper?.getEntitiesManager();
    if (!gameMapFrontWrapper || !entitiesManager) {
        return [];
    }
    const { width, height } = gameMapFrontWrapper.getTileDimensions();
    const seats: Seat[] = [];
    for (const [entityId, entity] of entitiesManager.getEntities()) {
        const prefab = entity.getPrefab();
        const direction = toPositionDirection(prefab.direction);
        const depth = entity.depth + (direction === PositionMessage_Direction.UP ? -1 : 1);
        if (prefab.seat) {
            prefab.seat.forEach((tile, index) => {
                seats.push({
                    id: `${entityId}:${index}`,
                    entityId,
                    direction,
                    depth,
                    feet: { x: entity.x + tile.x * width, y: entity.y + tile.y * height },
                });
            });
        } else if (isSeatObject(prefab)) {
            seats.push(...deduceSeats(entityId, entity, direction, depth, width));
        }
    }
    return seats;
}

/** How far around the hitbox of a deduced seat the feet still reach it. */
const SEAT_REACH_MARGIN = 4;

/**
 * Seats of a chair or a couch the catalog does not describe: at the center of its hitbox (of the image when it has
 * none), one per place of the width of a tile, so that a couch seats several players side by side.
 */
function deduceSeats(
    entityId: string,
    entity: { x: number; y: number; displayWidth: number; displayHeight: number; getPrefab(): EntityPrefab },
    direction: PositionMessage_Direction,
    depth: number,
    tileWidth: number,
): Seat[] {
    const hitbox = entity.getPrefab().collisionRectangles?.[0];
    const zone = hitbox
        ? { x: entity.x + hitbox.x, y: entity.y + hitbox.y, width: hitbox.width, height: hitbox.height }
        : {
              x: entity.x,
              y: entity.y + entity.displayHeight / 2,
              width: entity.displayWidth,
              height: entity.displayHeight / 2,
          };
    const places = Math.max(1, Math.round(zone.width / tileWidth));
    const reach = {
        x: zone.x - SEAT_REACH_MARGIN,
        y: zone.y - SEAT_REACH_MARGIN,
        width: zone.width + SEAT_REACH_MARGIN * 2,
        height: zone.height + SEAT_REACH_MARGIN * 2,
    };
    return Array.from({ length: places }, (_, index) => ({
        id: `${entityId}:auto${index}`,
        entityId,
        direction,
        depth,
        reach,
        feet: { x: zone.x + ((index + 0.5) * zone.width) / places, y: zone.y + zone.height / 2 },
    }));
}

/**
 * The seat whose tile contains the given feet position, if any; else the nearest deduced seat whose object the feet
 * touch.
 */
export function findSeatUnderFeet(scene: GameScene, feet: { x: number; y: number }): Seat | undefined {
    const { width, height } = scene.getGameMapFrontWrapper().getTileDimensions();
    const seats = getSeats(scene);
    const onTile = seats.find(
        (seat) =>
            seat.reach === undefined &&
            Math.abs(seat.feet.x - feet.x) < width / 2 &&
            Math.abs(seat.feet.y - feet.y) < height / 2,
    );
    if (onTile) return onTile;
    let nearest: { seat: Seat; distance: number } | undefined;
    for (const seat of seats) {
        const reach = seat.reach;
        if (
            !reach ||
            feet.x < reach.x ||
            feet.x > reach.x + reach.width ||
            feet.y < reach.y ||
            feet.y > reach.y + reach.height
        ) {
            continue;
        }
        const distance = Math.hypot(seat.feet.x - feet.x, seat.feet.y - feet.y);
        if (!nearest || distance < nearest.distance) nearest = { seat, distance };
    }
    return nearest?.seat;
}

/**
 * The seat a character sits on, i.e. the seat whose center the character stands exactly on.
 * Other players learn about a seated character from its position alone: a character that does not move
 * and stands on the center of a seat is seated.
 */
export function findSeatOfCharacter(scene: GameScene, character: Character): Seat | undefined {
    return getSeats(scene).find((seat) => {
        const position = character.getPositionForFeet(seat.feet);
        return (
            Math.abs(position.x - character.x) <= SEAT_POSITION_TOLERANCE &&
            Math.abs(position.y - character.y) <= SEAT_POSITION_TOLERANCE
        );
    });
}

/**
 * Whether another player is seated on the given seat.
 */
export function isSeatTaken(scene: GameScene, seat: Seat): boolean {
    for (const player of scene.MapPlayersByKey.values()) {
        if (player.isSeated() && findSeatOfCharacter(scene, player)?.id === seat.id) {
            return true;
        }
    }
    return false;
}
