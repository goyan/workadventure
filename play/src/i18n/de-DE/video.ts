import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const video: DeepPartial<Translation["video"]> = {
    connection_issue: "Verbindungsproblem!",
    no_video_stream_received: "Kein Videostream empfangen.",
    user_is_muted: "{name} ist stummgeschaltet.",
    reduce: "Reduzieren",
    connecting: "Verbinden...",
    reconnecting: "Wiederverbinden...",
    persistent_connection_issue: "Wiederverbinden... Instabile Verbindung...",
    click_to_unblock: "Klicken zum Entsperren",
    bubble_listening: {
        heard_by_one: "{name} kann Sie hören",
        heard_by_two: "{first} und {second} können Sie hören",
        heard_by_many: "{count} Personen in der Nähe können Sie hören",
        overhearing: "Sie hören {names} zu",
    },
    click_and_drag_to_resize: "Klicken und ziehen zum Größenändern",
};

export default video;
