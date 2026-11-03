import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const video: DeepPartial<Translation["video"]> = {
    connection_issue: "ปัญหาการเชื่อมต่อเครือข่าย",
    no_video_stream_received: "ไม่ได้รับสตรีมวิดีโอ",
    user_is_muted: "{name} ถูกปิดเสียงอยู่",
    reduce: "ย่อ",
    connecting: "กำลังเชื่อมต่อ...",
    reconnecting: "กำลังเชื่อมต่อใหม่...",
    persistent_connection_issue: "กำลังเชื่อมต่อใหม่... การเชื่อมต่อไม่เสถียร...",
    click_and_drag_to_resize: "คลิกแล้วลากเพื่อปรับขนาด",
    click_to_unblock: "คลิกเพื่อเลิกบล็อก",
    bubble_listening: {
        heard_by_one: "{name} ได้ยินคุณ",
        heard_by_two: "{first} และ {second} ได้ยินคุณ",
        heard_by_many: "{count} คนใกล้ๆ ได้ยินคุณ",
        overhearing: "คุณได้ยิน {names}",
    },
};

export default video;
