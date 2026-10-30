import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "Aktualisieren",
    newVersion: "Eine neue Version ist verfügbar. Aktualisiere die Seite.",
    later: "Später",
    whatsNew: "Neuigkeiten",
    feature: "Funktion",
    fix: "Fehlerbehebung",
    noChanges: "Keine Details zur Aktualisierung verfügbar.",
};

export default refreshPrompt;
