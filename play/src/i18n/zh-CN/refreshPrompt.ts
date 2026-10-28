import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "刷新",
    newVersion: "有新版本可用。请刷新页面。",
    later: "稍后",
};

export default refreshPrompt;
