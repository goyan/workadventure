import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const video: DeepPartial<Translation["video"]> = {
    connection_issue: "¡Problema de conexión!",
    no_video_stream_received: "No se ha recibido ningún flujo de video.",
    user_is_muted: "{name} está silenciado.",
    reduce: "Reducir",
    connecting: "Conectando...",
    reconnecting: "Reconectando...",
    persistent_connection_issue: "Reconectando... Conexión inestable...",
    click_to_unblock: "Haz clic para desbloquear",
    bubble_listening: {
        heard_by_one: "{name} puede oírte",
        heard_by_two: "{first} y {second} pueden oírte",
        heard_by_many: "{count} personas cerca pueden oírte",
        overhearing: "Escuchas a {names}",
    },
    click_and_drag_to_resize: "Haz clic y arrastra para cambiar el tamaño",
};

export default video;
