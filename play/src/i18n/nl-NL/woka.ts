import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const woka: DeepPartial<Translation["woka"]> = {
    vehicle: {
        centerColor: "Midden",
        edgeColor: "Rand",
        wheelsColor: "Wielen",
        title: "Voertuig",
        none: "Geen",
        skateboard: "Skateboard",
        hint: "Druk drie keer snel op een richting om te skateboarden, of rust het uit via het actiewiel.",
        mount: "Skateboard rijden",
        dismount: "Afstappen",
    },
    customWoka: {
        color: "Kleur",
        defaultColor: "Standaardkleur",
        rotate: "Avatar draaien",
        parts: {
            body: "Lichaam",
            eyes: "Ogen",
            hair: "Haar",
            clothes: "Kleding",
            hat: "Hoed",
            accessory: "Accessoires",
        },
        bath: "Zwemmen",
        bathHint: "Je zwemkleding wordt in het water en binnen één tegel van het zwembad gedragen.",
        title: "Bouw je WOKA",
        navigation: {
            finish: "Voltooien",
            backToDefaultWoka: "Terug naar standaard WOKA",
        },
        randomize: "Willekeurig",
    },
    selectWoka: {
        title: "Selecteer je WOKA",
        continue: "Doorgaan",
        customize: "Bouw je WOKA",
        randomize: "Willekeurig",
    },
    menu: {
        changeOutfit: "Kleding veranderen",
        swimwear: "Zwemmen",
        swimwearHint: "Gedragen in het water",
        actions: "Acties van mijn avatar",
        closeActions: "Acties sluiten",
        profile: "Profiel bekijken",
        businessCard: "Visitekaartje",
    },
    swimwear: {
        auto: "Op basis van de avatar",
        shorts: "Zwembroek",
        twoPiece: "Tweedelig badpak",
    },
    actions: {
        idle: "Stoppen",
        dance: "Dansen",
        coffee: "Koffie drinken",
        sleep: "Slapen",
        toilet: "Naar het toilet gaan",
        run: "Hardlopen",
    },
    picker: {
        title: "Wie wil je selecteren?",
        self: "{name} (jij)",
    },
};

export default woka;
