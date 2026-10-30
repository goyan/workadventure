import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "刷新",
    newVersion: "有新版本可用。请刷新页面。",
    later: "稍后",
    whatsNew: "更新内容",
    feature: "功能",
    fix: "修复",
    noChanges: "暂无更新详情。",
};

export default refreshPrompt;
