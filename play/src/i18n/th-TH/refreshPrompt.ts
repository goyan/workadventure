import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "รีเฟรช",
    newVersion: "มีเวอร์ชันใหม่ กด รีเฟรช เพื่อโหลด",
    later: "ภายหลัง",
    whatsNew: "มีอะไรใหม่",
    feature: "ฟีเจอร์",
    fix: "แก้ไข",
    noChanges: "ไม่มีรายละเอียดการอัปเดต",
};

export default refreshPrompt;
