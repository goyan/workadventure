import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "Actualitzar",
    newVersion: "Hi ha una nova versió disponible. Actualitza la pàgina.",
    later: "Més tard",
    whatsNew: "Novetats",
    feature: "Funcionalitat",
    fix: "Correcció",
    noChanges: "No hi ha detalls de l’actualització disponibles.",
};

export default refreshPrompt;
