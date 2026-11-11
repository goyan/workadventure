import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "Rafraîchir",
    newVersion: "Une nouvelle version est disponible. Cliquez sur « Rafraîchir » pour la charger.",
    updated: "Le jeu a été mis à jour pendant la reconnexion.",
    close: "OK",
    later: "Plus tard",
    whatsNew: "Nouveautés",
    feature: "Fonctionnalité",
    fix: "Correctif",
    noChanges: "Aucun détail de mise à jour disponible.",
};

export default refreshPrompt;
