import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const woka: DeepPartial<Translation["woka"]> = {
    vehicle: {
        centerColor: "Centro",
        edgeColor: "Bordo",
        wheelsColor: "Ruote",
        title: "Veicolo",
        none: "Nessuno",
        skateboard: "Skateboard",
        hint: "Premi una direzione tre volte rapidamente per usare lo skateboard, oppure equipaggialo dalla ruota delle azioni.",
        mount: "Sali sullo skateboard",
        dismount: "Scendi",
    },
    customWoka: {
        color: "Colore",
        defaultColor: "Colore predefinito",
        rotate: "Ruota l’avatar",
        parts: {
            body: "Corpo",
            eyes: "Occhi",
            hair: "Capelli",
            clothes: "Vestiti",
            hat: "Cappello",
            accessory: "Accessori",
        },
        bath: "Bagno",
        bathHint: "Il costume viene indossato in acqua e a una casella dalla piscina.",
        title: "Crea il tuo WOKA",
        navigation: {
            finish: "Finisci",
            backToDefaultWoka: "Torna al WOKA predefinito",
        },
        randomize: "Casuale",
    },
    selectWoka: {
        title: "Seleziona il tuo WOKA",
        continue: "Continua",
        customize: "Crea il tuo WOKA",
        randomize: "Seleziona casualmente",
    },
    menu: {
        changeOutfit: "Cambia abiti",
        swimwear: "Bagno",
        actions: "Azioni del mio avatar",
        closeActions: "Chiudi azioni",
        profile: "Mostra profilo",
        businessCard: "Biglietto da visita",
    },
    swimwear: {
        auto: "In base all’avatar",
        shorts: "Pantaloncini da bagno",
        twoPiece: "Costume a due pezzi",
    },
    actions: {
        idle: "Ferma",
        dance: "Ballare",
        coffee: "Bere un caffè",
        sleep: "Dormire",
        toilet: "Andare in bagno",
        run: "Correre",
    },
    picker: {
        title: "Chi vuoi selezionare?",
        self: "{name} (tu)",
    },
};

export default woka;
