import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const refreshPrompt: DeepPartial<Translation["refreshPrompt"]> = {
    refresh: "Tải lại",
    newVersion: "Đã có phiên bản mới. Nhấp Làm mới để tải.",
    later: "Để sau",
    whatsNew: "Có gì mới",
    feature: "Tính năng",
    fix: "Sửa lỗi",
    noChanges: "Không có chi tiết cập nhật.",
};

export default refreshPrompt;
