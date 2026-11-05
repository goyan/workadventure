import { writable } from "svelte/store";
import type { GobeurLevel } from "@workadventure/map-editor";
import type { GobeurEndReason, GobeurRanking } from "../Phaser/Game/Gobeur/GobeurGame";

export interface GobeurGameView {
    running: boolean;
    isMaster: boolean;
    /** The level the game was launched with. */
    level: GobeurLevel | undefined;
    /** Date.now() based: end of the countdown, start of the chase. */
    huntsAt: number;
    /** Date.now() based. */
    endsAt: number;
    survivors: string[];
    /** In order of capture. */
    caught: string[];
}

/** The Gobeur games known by this browser, by entity id. Written by the GobeurManager only. */
export const gobeurGamesStore = writable<Map<string, GobeurGameView>>(new Map());

/** The last ranking to show, until the UI clears it. */
export const gobeurRankingStore = writable<
    { entityId: string; ranking: GobeurRanking; reason: GobeurEndReason } | undefined
>(undefined);

/** Set when a game the local player takes part in starts, for the UI to announce it at `at` (end of the countdown). */
export const gobeurAnnounceStore = writable<{ entityId: string; at: number } | undefined>(undefined);
