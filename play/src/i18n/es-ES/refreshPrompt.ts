import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "Actualizar",
    newVersion: "Hay una nueva versión disponible. Actualiza la página.",
    later: "Más tarde",
    whatsNew: "Novedades",
    feature: "Funcionalidad",
    fix: "Corrección",
    noChanges: "No hay detalles de la actualización disponibles.",
};

export default refreshPrompt;
