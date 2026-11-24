import { writable } from "svelte/store";
import type { FishingContestShown, FishingRecordShown } from "../Phaser/Game/Fishing/FishingContestView";

/** Session equipment, kept through a reconnect but reset when leaving the scene (like the torch and the Nerf). */
export const rodEquippedStore = writable(false);

/** What just happened at the end of a line, shown a few seconds. */
export interface FishingCard {
    id: number;
    kind: "caught" | "missed" | "lost" | "refused" | "contestRefused" | "iceShack";
    /** The local player's own line. */
    own: boolean;
    /** The name of the angler, for another player's catch. */
    name?: string;
    /** A catch: its weight, and whether it is a female (pink) or a male (blue). */
    grams?: number;
    female?: boolean;
    /** What happened to an ice fishing shack, already in the language of the player. */
    text?: string;
}

/** How long a card stays. */
export const FISHING_CARD_MS = 4000;
/** No more cards than this at once: the oldest goes. */
const MAX_CARDS = 3;

export const fishingCardsStore = writable<FishingCard[]>([]);

let nextCardId = 1;

/** Shows a card for a few seconds. */
export function showFishingCard(card: Omit<FishingCard, "id">): void {
    const id = nextCardId++;
    fishingCardsStore.update((cards) => [...cards, { ...card, id }].slice(-MAX_CARDS));
    setTimeout(() => fishingCardsStore.update((cards) => cards.filter((shown) => shown.id !== id)), FISHING_CARD_MS);
}

/**
 * The fish caught (and let go) in the room: since the life of its map began, as the server counts them, and during
 * the last minute, as this browser saw them. Undefined while nobody ever fished there.
 */
export const fishingCaughtStore = writable<{ total: number; lastMinute: number } | undefined>(undefined);

/** The fishing contest of the room: running, or just ended (its podium); undefined when there is none. */
export const fishingContestStore = writable<FishingContestShown | undefined>(undefined);

/** The local player is choosing how long the contest they start will last. */
export const fishingContestSetupStore = writable(false);

/** The heaviest fish ever caught on the map; undefined while nobody caught one. */
export const fishingRecordStore = writable<FishingRecordShown | undefined>(undefined);
