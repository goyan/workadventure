import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "Aktualizěrowanje",
    newVersion: "A new version is available. Refresh the page to update.",
    later: "Later",
};

export default refreshPrompt;
