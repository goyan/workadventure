import { createPersistedSwitchStore } from "./PersistedSwitchStore";

/**
 * Whether this person shows the weather banner (now, in one hour, in four hours) next to the clock. Off until turned on
 * from the apps menu, and kept in the browser.
 */
export const weatherBannerStore = createPersistedSwitchStore("weatherBannerShown", false);
