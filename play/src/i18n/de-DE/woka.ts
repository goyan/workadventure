import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const woka: DeepPartial<Translation["woka"]> = {
    customWoka: {
        rotate: "Avatar drehen",
        parts: {
            body: "Körper",
            eyes: "Augen",
            hair: "Haare",
            clothes: "Kleidung",
            hat: "Hut",
            accessory: "Accessoires",
        },
        bath: "Baden",
        bathHint: "Die Badekleidung wird im Wasser und bis zu einer Kachel vom Pool entfernt getragen.",
        title: "Bearbeite deinen WOKA",
        navigation: {
            finish: "Fertig",
            backToDefaultWoka: "Zurück zum Standard-WOKA",
        },
        randomize: "Zufällig auswählen",
    },
    selectWoka: {
        title: "Deinen WOKA auswählen",
        continue: "Weiter",
        customize: "Bearbeite deinen WOKA",
        randomize: "Zufällig auswählen",
    },
    menu: {
        changeOutfit: "Kleidung wechseln",
        swimwear: "Baden",
        actions: "Aktionen meines Avatars",
        closeActions: "Aktionen schließen",
        profile: "Profil anzeigen",
        businessCard: "Visitenkarte",
    },
    swimwear: {
        auto: "Passend zum Avatar",
        shorts: "Badeshorts",
        twoPiece: "Zweiteiliger Badeanzug",
    },
    actions: {
        idle: "Stoppen",
        dance: "Tanzen",
        coffee: "Kaffee trinken",
        sleep: "Schlafen",
        toilet: "Auf die Toilette gehen",
    },
    picker: {
        title: "Wen möchtest du auswählen?",
        self: "{name} (du)",
    },
};

export default woka;
