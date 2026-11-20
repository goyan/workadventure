import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const woka: DeepPartial<Translation["woka"]> = {
    vehicle: {
        myVehicle: "Mes véhicules",
        airHint: "Air : appuyez sur {key} pour activer ou désactiver votre avion.",
        landingBlocked: "Atterrissage impossible ici. Déplacez-vous vers un endroit dégagé.",
        airplane: "Avion",
        media: { air: "Air", land: "Terre", water: "Eau" },
        quickHint:
            "Le canoë s’équipe automatiquement dans l’eau profonde du relief. Équipez votre véhicule terrestre depuis la roue d’actions.",
        centerColor: "Centre",
        edgeColor: "Bordure",
        wheelsColor: "Roues",
        title: "Véhicule",
        none: "Aucun",
        skateboard: "Skateboard",
        electricUnicycle: "Gyroroue",
        hint: "Trois pressions rapides sur une direction pour sprinter avec votre véhicule, ou équipez-le depuis la roue d’actions.",
        mount: "Monter sur le skateboard",
        mountElectricUnicycle: "Monter sur la gyroroue",
        shellColor: "Coque",
        sideColor: "Côtés",
        pedalsColor: "Pédales",
        dismount: "Descendre",
        canoe: "Canoë",
        hullColor: "Coque",
        fuselageColor: "Fuselage",
        wingsColor: "Ailes",
        canopyColor: "Verrière",
        rimColor: "Bord",
        paddleColor: "Pagaie",
        canoeHint:
            "Le canoë se met à l’eau tout seul : là où vous nageriez dans l’eau du relief, vous pagayez, à la vitesse de la marche, et le courant vous emporte moitié moins. À terre, votre choix de véhicule terrestre s’applique.",
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
        swimwear: "Maillot",
        swimwearDetail: "(visible près d’une piscine)",
        actions: "Actions de mon avatar",
        closeActions: "Fermer les actions",
        profile: "Afficher le profil",
        businessCard: "Carte de visite",
        releaseAnimals: "Relâcher mes animaux ({count})",
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
