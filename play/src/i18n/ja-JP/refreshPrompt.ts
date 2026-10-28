import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "更新",
    newVersion: "新しいバージョンが利用できます。ページを更新してください。",
    later: "後で",
};

export default refreshPrompt;
