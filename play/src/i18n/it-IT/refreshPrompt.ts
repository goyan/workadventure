import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "Aggiornare",
    newVersion: "È disponibile una nuova versione. Aggiorna la pagina.",
    later: "Più tardi",
    whatsNew: "Novità",
    feature: "Funzionalità",
    fix: "Correzione",
    noChanges: "Nessun dettaglio dell’aggiornamento disponibile.",
};

export default refreshPrompt;
