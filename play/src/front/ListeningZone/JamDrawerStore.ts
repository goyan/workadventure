import { get, type Readable, writable } from "svelte/store";
import { currentListeningZoneStore } from "./ListeningZoneStore";

/** "open" or "closed": the last choice the user made with the drawer's icon, kept in this browser. */
export const JAM_DRAWER_STORAGE_KEY = "jamDrawer";

export interface JamDrawer {
    readonly open: Readable<boolean>;
    toggle(): void;
}

/**
 * The Jam drawer, pulled from the right edge of the screen. It opens by itself on entering a listening zone, so that
 * zones get noticed, unless the user closed it; and closes again on leaving it, unless the user opened it.
 */
export function createJamDrawer(storage: Pick<Storage, "getItem" | "setItem">, zone: Readable<unknown>): JamDrawer {
    const savedChoice = (): string | null => storage.getItem(JAM_DRAWER_STORAGE_KEY);
    const open = writable(savedChoice() === "open");
    let inZone = false;

    // Lives as long as the page: the drawer is one per game.
    // eslint-disable-next-line svelte/no-ignored-unsubscribe
    zone.subscribe((current) => {
        const entering = current !== undefined && !inZone;
        const leaving = current === undefined && inZone;
        inZone = current !== undefined;
        if (entering && savedChoice() !== "closed") open.set(true);
        if (leaving && savedChoice() !== "open") open.set(false);
    });

    return {
        open: { subscribe: open.subscribe },
        toggle(): void {
            const next = !get(open);
            storage.setItem(JAM_DRAWER_STORAGE_KEY, next ? "open" : "closed");
            open.set(next);
        },
    };
}

export const jamDrawer = createJamDrawer(localStorage, currentListeningZoneStore);
