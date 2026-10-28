import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "Rafraîchir",
    newVersion: "Une nouvelle version est disponible. Cliquez sur « Rafraîchir » pour la charger.",
    later: "Plus tard",
};

export default refreshPrompt;
