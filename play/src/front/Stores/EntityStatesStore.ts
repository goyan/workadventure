import { writable } from "svelte/store";
import type { EntityStatesManager } from "../Phaser/Game/EntityStates/EntityStatesManager";

/** The states of the objects of the current map (see EntityStatesManager). Set when the GameScene joins its room. */
export const entityStatesManagerStore = writable<EntityStatesManager | undefined>(undefined);
