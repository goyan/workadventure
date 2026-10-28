import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "Herlaad",
    newVersion: "Er is een nieuwe versie beschikbaar. Vernieuw de pagina.",
    later: "Later",
};

export default refreshPrompt;
