import { get, type Writable } from "svelte/store";
import { nerfEquippedStore } from "./NerfStore";
import { torchEquippedStore } from "./TorchStore";

/** What the avatar can hold in its hand: one at a time. */
export type HandTool = "nerf" | "torch";

const stores: Record<HandTool, Writable<boolean>> = { nerf: nerfEquippedStore, torch: torchEquippedStore };

/**
 * Equips a tool, putting the other one away (the avatar has one hand for them), or puts it away. Done here rather
 * than in subscribers of the stores: each store is set once, and published once.
 */
export function toggleHandTool(tool: HandTool, options: { refuseEquip?: boolean } = {}): void {
    const store = stores[tool];
    if (get(store)) {
        store.set(false);
        return;
    }
    if (options.refuseEquip) {
        return;
    }
    for (const [other, otherStore] of Object.entries(stores)) {
        if (other !== tool && get(otherStore)) otherStore.set(false);
    }
    store.set(true);
}
