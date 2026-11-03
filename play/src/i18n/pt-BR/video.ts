import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const video: DeepPartial<Translation["video"]> = {
    connection_issue: "Problema de conectividade de rede",
    no_video_stream_received: "Nenhum stream de vídeo recebido.",
    user_is_muted: "{name} está silenciado.",
    reduce: "Reduzir",
    connecting: "Conectando...",
    reconnecting: "Reconectando...",
    persistent_connection_issue: "Reconectando... Conexão instável...",
    click_to_unblock: "Clique para desbloquear",
    bubble_listening: {
        heard_by_one: "{name} pode ouvir você",
        heard_by_two: "{first} e {second} podem ouvir você",
        heard_by_many: "{count} pessoas por perto podem ouvir você",
        overhearing: "Você ouve {names}",
    },
    click_and_drag_to_resize: "Clique e arraste para redimensionar",
};

export default video;
