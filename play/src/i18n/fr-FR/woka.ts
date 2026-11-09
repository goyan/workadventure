import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const woka: DeepPartial<Translation["woka"]> = {
    vehicle: {
        centerColor: "Centre",
        edgeColor: "Bordure",
        wheelsColor: "Roues",
        title: "Véhicule",
        none: "Aucun",
        skateboard: "Skateboard",
        hint: "Trois pressions rapides sur une direction pour sprinter en skateboard, ou équipez-le depuis la roue d’actions.",
        mount: "Monter sur le skateboard",
        dismount: "Descendre",
    },
    customWoka: {
        color: "Couleur",
        defaultColor: "Couleur par défaut",
        rotate: "Faire pivoter l’avatar",
        parts: {
            body: "Corps",
            eyes: "Yeux",
            hair: "Cheveux",
            clothes: "Vêtements",
            hat: "Chapeau",
            accessory: "Accessoires",
        },
        bath: "Bain",
        bathHint: "Le maillot est porté dans l’eau et à un bloc de la piscine.",
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
        changeOutfit: "Changer de tenue",
        swimwear: "Maillot de bain",
        actions: "Actions de mon avatar",
        closeActions: "Fermer les actions",
        profile: "Afficher le profil",
        businessCard: "Carte de visite",
    },
    swimwear: {
        auto: "Selon l’avatar",
        shorts: "Short de bain",
        twoPiece: "Maillot deux pièces",
    },
    actions: {
        idle: "Arrêter",
        dance: "Danser",
        coffee: "Boire un café",
        sleep: "Dormir",
        toilet: "Aller aux toilettes",
        run: "Courir",
    },
    picker: {
        title: "Qui voulez-vous sélectionner ?",
        self: "{name} (vous)",
    },
};

export default woka;
