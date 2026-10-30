import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "تحديث", // Refresh
    newVersion: "يتوفر إصدار جديد. حدّث الصفحة للحصول عليه.",
    later: "لاحقًا",
    whatsNew: "ما الجديد",
    feature: "ميزة",
    fix: "إصلاح",
    noChanges: "لا تتوفر تفاصيل التحديث.",
};

export default refreshPrompt;
