import { PositionMessage_Direction } from "@workadventure/messages";
import type { GameScene } from "../Game/GameScene";
import type { Character } from "../Entity/Character";
import type { GameMapFrontWrapper } from "../Game/GameMap/GameMapFrontWrapper";
import type { EntitiesManager } from "../Game/GameMap/EntitiesManager";

// Below this distance (in pixels), a character is considered to be exactly on its seat.
const SEAT_POSITION_TOLERANCE = 1.5;

export interface Seat {
    /** Unique among the seats of the map: a couch has one seat per place. */
    id: string;
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
        prefab.seat?.forEach((tile, index) => {
            seats.push({
                id: `${entityId}:${index}`,
                direction,
                depth: entity.depth + (direction === PositionMessage_Direction.UP ? -1 : 1),
                feet: { x: entity.x + tile.x * width, y: entity.y + tile.y * height },
            });
        });
    }
    return seats;
}

/**
 * The seat whose tile contains the given feet position, if any.
 */
export function findSeatUnderFeet(scene: GameScene, feet: { x: number; y: number }): Seat | undefined {
    const { width, height } = scene.getGameMapFrontWrapper().getTileDimensions();
    return getSeats(scene).find(
        (seat) => Math.abs(seat.feet.x - feet.x) < width / 2 && Math.abs(seat.feet.y - feet.y) < height / 2,
    );
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
