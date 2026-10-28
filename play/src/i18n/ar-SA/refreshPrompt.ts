import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "تحديث", // Refresh
    newVersion: "يتوفر إصدار جديد. حدّث الصفحة للحصول عليه.",
    later: "لاحقًا",
};

export default refreshPrompt;
