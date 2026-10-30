import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "更新",
    newVersion: "新しいバージョンが利用できます。ページを更新してください。",
    later: "後で",
    whatsNew: "新着情報",
    feature: "機能",
    fix: "修正",
    noChanges: "更新の詳細はありません。",
};

export default refreshPrompt;
