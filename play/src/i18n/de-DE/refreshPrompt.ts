import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "Aktualisieren",
    newVersion: "Eine neue Version ist verfügbar. Aktualisiere die Seite.",
    later: "Später",
};

export default refreshPrompt;
