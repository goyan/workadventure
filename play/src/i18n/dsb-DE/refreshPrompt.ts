import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "Aktualizěrowanje",
    newVersion: "A new version is available. Refresh the page to update.",
    later: "Later",
    whatsNew: "What's new",
    feature: "Feature",
    fix: "Fix",
    noChanges: "No update details are available.",
};

export default refreshPrompt;
