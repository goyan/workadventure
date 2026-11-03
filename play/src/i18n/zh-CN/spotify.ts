import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const spotify: DeepPartial<Translation["spotify"]> = {
    settings: {
        title: "Spotify",
        description: "关联你的 Spotify 账号，向同事展示你正在听的音乐。",
        link: "关联 Spotify",
        linking: "正在等待 Spotify…",
        unlink: "取消关联",
        linked: "你的 Spotify 账号已关联。",
        share: "分享我正在听的音乐",
        desktopDetected: "从本机的 Spotify 应用读取：无需关联账号，免费账号即可。",
        desktopAppHint: "使用 WorkAdventure 桌面应用，无需关联账号或 Premium：它直接读取你 Mac 上的 Spotify 应用。",
        desktopAppLink: "下载桌面应用",
        serverAppNotice:
            "没有自己的客户端 ID 时，将通过此服务器的 Spotify 应用关联：请先请管理员把你的 Spotify 账号加入该应用（最多 5 人）。",
        accessDenied:
            "Spotify 拒绝分享你正在听的音乐：你的账号未加入此服务器的 Spotify 应用。请让管理员添加（最多 5 人），或使用你自己的 Spotify 应用。",
        errors: {
            popupBlocked: "浏览器拦截了 Spotify 窗口。请允许此网站的弹出窗口后重试。",
            cancelled: "Spotify 窗口在关联完成前被关闭。",
            denied: "你在 Spotify 上拒绝了访问。",
            failed: "无法关联 Spotify。请检查 Spotify 应用的客户端 ID 和重定向 URI。",
            noClientId: "此服务器未配置 Spotify 应用：请在下方输入你自己应用的客户端 ID。",
        },
        personalApp: {
            title: "使用我自己的 Spotify 应用",
            explanation: "一个 Spotify 应用只接受五个人。如果此服务器的应用已满，几分钟即可创建你自己的应用：",
            step1: "打开 developer.spotify.com/dashboard 并创建应用（需要 Spotify Premium 账号）。",
            step2: "添加此重定向 URI：{redirectUri}",
            step3: "勾选“Web API”，保存后将应用的客户端 ID 粘贴到这里。",
            clientIdLabel: "我的应用的客户端 ID",
            clientIdPlaceholder: "留空则使用此服务器的应用",
        },
    },
    userList: {
        jam: "Jam · {area}",
        listenOnSpotify: "在 Spotify 上收听",
    },
    listeningZone: {
        defaultName: "收听区",
        jamOf: "{name} 的 Jam",
        participants: "Jam 中有 {count} 人",
        join: "加入",
        joined: "已在 Jam 中",
        share: "分享我的 Jam",
        sharePlaceholder: "粘贴你的 Jam 邀请链接",
        invalidLink: "这不是 Spotify Jam 邀请链接。",
        submit: "分享",
        cancel: "取消",
        stop: "停止分享",
        noJam: "这里还没有分享 Jam。",
        linkInvite: "关联 Spotify 以分享你正在听的音乐",
    },
};

export default spotify;
