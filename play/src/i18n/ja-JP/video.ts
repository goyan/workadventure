import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const video: DeepPartial<Translation["video"]> = {
    connection_issue: "接続に問題があります。",
    no_video_stream_received: "ビデオストリームが受信できません。",
    user_is_muted: "{name}はミュートされています。",
    reduce: "縮小",
    connecting: "接続中...",
    reconnecting: "再接続中...",
    persistent_connection_issue: "再接続中... 接続が不安定です...",
    click_to_unblock: "クリックしてブロックを解除",
    bubble_listening: {
        heard_by_one: "{name}さんに聞こえています",
        heard_by_two: "{first}さんと{second}さんに聞こえています",
        heard_by_many: "近くの{count}人に聞こえています",
        overhearing: "{names}の会話が聞こえます",
    },
    click_and_drag_to_resize: "クリックしてドラッグしてサイズを変更",
};

export default video;
