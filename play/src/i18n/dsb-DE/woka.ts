import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const woka: DeepPartial<Translation["woka"]> = {
    customWoka: {
        color: "Barwa",
        defaultColor: "Standardna barwa",
        rotate: "Awatar wobwjertnuś",
        parts: {
            body: "Śěło",
            eyes: "Wócy",
            hair: "Włose",
            clothes: "Drasty",
            hat: "Kłobuk",
            accessory: "Pśidanki",
        },
        bath: "Kupanje",
        bathHint: "Kupanske drasty se we wóźe a až k jadnej kachli wót basena nosy.",
        title: "Swój WOKA wobźěłaś",
        navigation: {
            finish: "Wuzwóliś",
            backToDefaultWoka: "Do WOKA za pśepokład",
        },
        randomize: "Losowo",
    },
    selectWoka: {
        title: "Swój WOKA wuzwóliś",
        continue: "Wuzwóliś",
        customize: "Wobźěłaj swój WOKA",
        randomize: "Losowo",
    },
    menu: {
        changeOutfit: "Drasty změniś",
        swimwear: "Kupanje",
        actions: "Akcije mójogo awatara",
        closeActions: "Akcije zacyniś",
        profile: "Profil pokazaś",
        businessCard: "Wizitna kórtka",
    },
    swimwear: {
        auto: "Pó awatarje",
        shorts: "Kupanske cholowy",
        twoPiece: "Dwóźělny kupanski woblek",
    },
    actions: {
        idle: "Zastajiś",
        dance: "Rejowaś",
        coffee: "Kafej piś",
        sleep: "Spaś",
        toilet: "Na toaletu hyś",
    },
    picker: {
        title: "Kogo cośo wubraś?",
        self: "{name} (ty)",
    },
};

export default woka;
