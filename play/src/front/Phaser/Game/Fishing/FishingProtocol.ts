import type { FishingDirection } from "@workadventure/map-editor";
import { PositionMessage_Direction } from "@workadventure/messages";

/** Whether the player holds a fishing rod: public and not saved, like the torch's and the Nerf's. */
export const ROD_EQUIPPED_VARIABLE = "_rodEquipped";

/** Another player's rod, from their player variable: only `true` shows one. */
export function decodeRodEquipped(value: unknown): boolean {
    return value === true;
}

/** The states of a line, as FishingLineMessage.state carries them. */
export const FISHING_LINE = { waiting: 0, bite: 1, reeling: 2 } as const;
/** What happens to a line, as FishingEventMessage.type carries it. */
export const FISHING_EVENT = { bite: 0, missed: 1, lost: 2, retrieved: 3, refused: 4, caught: 5 } as const;

/** The way the avatar faces, for the rules of the cast. */
export function fishingDirection(direction: PositionMessage_Direction): FishingDirection {
    switch (direction) {
        case PositionMessage_Direction.UP:
            return "up";
        case PositionMessage_Direction.LEFT:
            return "left";
        case PositionMessage_Direction.RIGHT:
            return "right";
        default:
            return "down";
    }
}

/** A weight in kilograms with two decimals, written as the language of the player does ("1,24"). */
export function formatKilograms(grams: number, locale: string): string {
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(grams / 1000);
}
