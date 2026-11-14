import { get, writable, type Writable } from "svelte/store";
import { decodeTorchIntensity } from "../Phaser/Game/Torch/TorchProtocol";
import type { RgbLampLight } from "./RgbLampStore";

/** Session equipment, kept through a reconnect but reset when leaving the scene (like the Nerf). */
export const torchEquippedStore = writable(false);

/**
 * The lights of the torches, as they are drawn: the night veil is pierced with the same shapes, next to those of the
 * RGB lamps (each has its own writer).
 */
export const torchLightsStore = writable<readonly RgbLampLight[]>([]);

const TORCH_INTENSITY_KEY = "torchIntensity";

/**
 * How bright the player wants their torch, in percent (see decodeTorchIntensity): kept in the browser, like a personal
 * switch (see createPersistedSwitchStore). When the browser refuses the storage, it lasts until the page is closed.
 */
function createTorchIntensityStore(): Writable<number> {
    let stored: string | null = null;
    try {
        stored = localStorage.getItem(TORCH_INTENSITY_KEY);
    } catch {
        // Storage refused: the full intensity is used.
    }
    const store = writable(decodeTorchIntensity(stored === null ? undefined : Number(stored)));
    const set = (value: number): void => {
        const percent = decodeTorchIntensity(value);
        try {
            localStorage.setItem(TORCH_INTENSITY_KEY, String(percent));
        } catch {
            // Storage refused: kept in memory only.
        }
        store.set(percent);
    };
    return {
        subscribe: store.subscribe,
        set,
        update: (updater): void => set(updater(get(store))),
    };
}

export const torchIntensityStore = createTorchIntensityStore();
