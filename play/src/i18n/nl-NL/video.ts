import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const video: DeepPartial<Translation["video"]> = {
    connection_issue: "Verbindingsprobleem!",
    no_video_stream_received: "Geen videostream ontvangen.",
    user_is_muted: "{name} is gedempt.",
    reduce: "Verminderen",
    connecting: "Verbinden...",
    reconnecting: "Opnieuw verbinden...",
    persistent_connection_issue: "Opnieuw verbinden... Onstabiele verbinding...",
    click_to_unblock: "Klik om te deblokkeren",
    bubble_listening: {
        heard_by_one: "{name} kan je horen",
        heard_by_two: "{first} en {second} kunnen je horen",
        heard_by_many: "{count} mensen in de buurt kunnen je horen",
        overhearing: "Je hoort {names}",
    },
    click_and_drag_to_resize: "Klikken en slepen om te vergroten/verkleinen",
};

export default video;
