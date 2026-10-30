import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "Aktualizować",
    newVersion: "A new version is available. Refresh the page to update.",
    later: "Later",
    whatsNew: "What's new",
    feature: "Feature",
    fix: "Fix",
    noChanges: "No update details are available.",
};

export default refreshPrompt;
