import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "Herlaad",
    newVersion: "Er is een nieuwe versie beschikbaar. Vernieuw de pagina.",
    later: "Later",
    whatsNew: "Wat is er nieuw",
    feature: "Functie",
    fix: "Oplossing",
    noChanges: "Geen details over de update beschikbaar.",
};

export default refreshPrompt;
