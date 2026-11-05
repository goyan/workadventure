import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const woka: DeepPartial<Translation["woka"]> = {
    customWoka: {
        title: "Personnalisez votre Woka",
        navigation: {
            finish: "Terminer",
            backToDefaultWoka: "Retour au WOKA par défaut",
        },
        randomize: "Aléatoire",
    },
    selectWoka: {
        title: "Sélectionnez votre Woka",
        continue: "Continuer",
        customize: "Personnaliser",
        randomize: "Sélectionner aléatoirement",
    },
    menu: {
        businessCard: "Carte de visite",
    },
    picker: {
        title: "Qui voulez-vous sélectionner ?",
        self: "{name} (vous)",
    },
};

export default woka;
