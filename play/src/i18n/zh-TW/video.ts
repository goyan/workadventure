import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const video: DeepPartial<Translation["video"]> = {
    connection_issue: "網路連線問題！",
    no_video_stream_received: "未收到視訊串流。",
    user_is_muted: "{name} 已靜音。",
    reduce: "縮小",
    connecting: "連線中...",
    reconnecting: "重新連線中...",
    persistent_connection_issue: "重新連線中... 連線不穩定...",
    click_to_unblock: "點選解除封鎖",
    bubble_listening: {
        heard_by_one: "{name} 聽得到你",
        heard_by_two: "{first} 和 {second} 聽得到你",
        heard_by_many: "附近有 {count} 人聽得到你",
        overhearing: "你聽到了 {names}",
    },
    click_and_drag_to_resize: "點選並拖曳以調整大小",
};

export default video;
