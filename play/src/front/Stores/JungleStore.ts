import { createPersistedSwitchStore } from "./PersistedSwitchStore";

/**
 * Personal switch for the jungle: off, this user sees no jungle animal and hears none of their calls. On until turned
 * off, and kept in the browser. It changes nothing for the other players.
 */
export const jungleEnabledStore = createPersistedSwitchStore("jungleEnabled", true);
