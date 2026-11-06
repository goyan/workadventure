import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const woka: DeepPartial<Translation["woka"]> = {
    customWoka: {
        color: "اللون",
        defaultColor: "اللون الافتراضي",
        rotate: "تدوير الشخصية",
        parts: {
            body: "الجسم",
            eyes: "العينان",
            hair: "الشعر",
            clothes: "الملابس",
            hat: "القبعة",
            accessory: "الإكسسوارات",
        },
        bath: "السباحة",
        bathHint: "يُرتدى لباس السباحة في الماء وعلى بُعد مربع واحد من المسبح.",
        title: "قم بتحرير WOKA الخاص بك", // "Edit your WOKA"
        navigation: {
            finish: "تم", // "Finish"
            backToDefaultWoka: "العودة إلى WOKA الافتراضي", // "Back to default WOKA"
        },
        randomize: "عشوائي", // "Randomize"
    },
    selectWoka: {
        title: "اختر WOKA الخاص بك", // "Select your WOKA"
        continue: "متابعة", // "Continue"
        customize: "قم بتحرير WOKA الخاص بك", // "Customize your WOKA"
        randomize: "اختر عشوائيًا", // "Select Randomly"
    },
    menu: {
        changeOutfit: "تغيير الملابس",
        swimwear: "السباحة",
        actions: "إجراءات شخصيتي",
        closeActions: "إغلاق الإجراءات",
        profile: "عرض الملف الشخصي",
        businessCard: "بطاقة العمل", // "Business Card"
    },
    swimwear: {
        auto: "حسب الشخصية",
        shorts: "سروال سباحة",
        twoPiece: "لباس سباحة من قطعتين",
    },
    actions: {
        idle: "توقف",
        dance: "الرقص",
        coffee: "شرب القهوة",
        sleep: "النوم",
        toilet: "الذهاب إلى المرحاض",
    },
    picker: {
        title: "من تريد أن تختار؟",
        self: "{name} (أنت)",
    },
};

export default woka;
