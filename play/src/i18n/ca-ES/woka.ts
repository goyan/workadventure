import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const woka: DeepPartial<Translation["woka"]> = {
    vehicle: {
        centerColor: "Centre",
        edgeColor: "Vora",
        wheelsColor: "Rodes",
        title: "Vehicle",
        none: "Cap",
        skateboard: "Monopatí",
        hint: "Prem una direcció tres vegades ràpidament per anar en monopatí, o equipa’l des de la roda d’accions.",
        mount: "Pujar al monopatí",
        dismount: "Baixar",
    },
    customWoka: {
        color: "Color",
        defaultColor: "Color per defecte",
        rotate: "Gira l’avatar",
        parts: {
            body: "Cos",
            eyes: "Ulls",
            hair: "Cabells",
            clothes: "Roba",
            hat: "Barret",
            accessory: "Accessoris",
        },
        bath: "Bany",
        bathHint: "El banyador es porta a l’aigua i a una casella de la piscina.",
        title: "Personalitzar el vostre WOKA",
        navigation: {
            finish: "Acabar",
            backToDefaultWoka: "Tornar al WOKA per defecte",
        },
        randomize: "Aleatori",
    },
    selectWoka: {
        title: "Seleccionar el vostre WOKA",
        continue: "Continuar",
        customize: "Personalitzar el vostre WOKA",
        randomize: "Seleccionar aleatòriament",
    },
    menu: {
        changeOutfit: "Canvia la roba",
        swimwear: "Bany",
        swimwearDetail: "(visible a prop d’una piscina)",
        actions: "Accions del meu avatar",
        closeActions: "Tanca les accions",
        profile: "Mostra el perfil",
        businessCard: "Targeta de visita",
    },
    swimwear: {
        auto: "Segons l’avatar",
        shorts: "Pantalons de bany",
        twoPiece: "Banyador de dues peces",
    },
    actions: {
        idle: "Atura",
        dance: "Ballar",
        coffee: "Beure cafè",
        sleep: "Dormir",
        toilet: "Anar al lavabo",
        run: "Córrer",
    },
    picker: {
        title: "A qui vols seleccionar?",
        self: "{name} (tu)",
    },
};

export default woka;
