import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "Rafraîchir",
    newVersion: "Une nouvelle version est disponible. Rafraîchissez la page pour en profiter.",
    later: "Plus tard",
};

export default refreshPrompt;
