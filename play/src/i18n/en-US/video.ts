import type { BaseTranslation } from "../i18n-types";

const video: BaseTranslation = {
    connection_issue: "Network connectivity issue",
    no_video_stream_received: "No video stream received.",
    user_is_muted: "{name} is muted.",
    reduce: "Reduce",
    connecting: "Connecting...",
    reconnecting: "Reconnecting...",
    persistent_connection_issue: "Reconnecting... Unstable connection...",
    click_and_drag_to_resize: "Click and drag to resize",
    click_to_unblock: "Click to unblock",
    bubble_listening: {
        heard_by_one: "{name} can hear you",
        heard_by_two: "{first} and {second} can hear you",
        heard_by_many: "{count} people nearby can hear you",
        overhearing: "You overhear {names}",
    },
};

export default video;
