import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "重新整理",
    newVersion: "有新版本可用。請重新整理頁面。",
    later: "稍後",
    whatsNew: "更新內容",
    feature: "功能",
    fix: "修正",
    noChanges: "暫無更新詳情。",
};

export default refreshPrompt;
