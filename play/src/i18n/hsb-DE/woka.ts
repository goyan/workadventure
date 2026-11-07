import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const woka: DeepPartial<Translation["woka"]> = {
    vehicle: {
        centerColor: "Srjedź",
        edgeColor: "Kroma",
        wheelsColor: "Koleska",
        title: "Jězdźidło",
        none: "Žane",
        skateboard: "Skateboard",
        hint: "Tłóč směr trójce spěšnje za skateboard abo wuzbrój jón w akciskim kole.",
        mount: "Na skateboard stupić",
        dismount: "Wotstupić",
    },
    customWoka: {
        color: "Barba",
        defaultColor: "Standardna barba",
        rotate: "Awatar wobwjertnyć",
        parts: {
            body: "Ćěło",
            eyes: "Woči",
            hair: "Włosy",
            clothes: "Drasta",
            hat: "Kłobuk",
            accessory: "Přidatki",
        },
        bath: "Kupanje",
        bathHint: "Kupanska drasta so we wodźe a hač k jednej kachli wot basena nosy.",
        title: "twój WOKA wobdźěłać",
        navigation: {
            finish: "wubrać",
            backToDefaultWoka: "wróćo k WOKA za pśepokład",
        },
        randomize: "Losowo",
    },
    selectWoka: {
        title: "twój WOKA wuzwolić",
        continue: "wubrać",
        customize: "wobdźěłaj swój WOKA",
        randomize: "Losowo",
    },
    menu: {
        changeOutfit: "Drastu změnić",
        swimwear: "Kupanje",
        actions: "Akcije mojeho awatara",
        closeActions: "Akcije začinić",
        profile: "Profil pokazać",
        businessCard: "wizitka",
    },
    swimwear: {
        auto: "Podle awatara",
        shorts: "Kupanske cholowy",
        twoPiece: "Dwudźělny kupanski woblek",
    },
    actions: {
        idle: "Zastajić",
        dance: "Rejować",
        coffee: "Kofej pić",
        sleep: "Spać",
        toilet: "Na toaletę hić",
    },
    picker: {
        title: "Koho chceš wubrać?",
        self: "{name} (ty)",
    },
};

export default woka;
