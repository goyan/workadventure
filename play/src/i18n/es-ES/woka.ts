import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const woka: DeepPartial<Translation["woka"]> = {
    customWoka: {
        rotate: "Girar avatar",
        parts: {
            body: "Cuerpo",
            eyes: "Ojos",
            hair: "Pelo",
            clothes: "Ropa",
            hat: "Sombrero",
            accessory: "Accesorios",
        },
        bath: "Baño",
        bathHint: "El bañador se lleva en el agua y a una casilla de la piscina.",
        title: "Personalice su WOKA",
        navigation: {
            finish: "Acabar",
            backToDefaultWoka: "Volver al WOKA por defecto",
        },
        randomize: "Aleatorio",
    },
    selectWoka: {
        title: "Seleccionar su WOKA",
        continue: "Continuar",
        customize: "Personalizar su WOKA",
        randomize: "Seleccionar aleatoriamente",
    },
    menu: {
        changeOutfit: "Cambiar de ropa",
        swimwear: "Baño",
        actions: "Acciones de mi avatar",
        closeActions: "Cerrar acciones",
        profile: "Ver perfil",
        businessCard: "Tarjeta de visita",
    },
    swimwear: {
        auto: "Según el avatar",
        shorts: "Pantalón de baño",
        twoPiece: "Bañador de dos piezas",
    },
    actions: {
        idle: "Parar",
        dance: "Bailar",
        coffee: "Beber café",
        sleep: "Dormir",
        toilet: "Ir al baño",
    },
    picker: {
        title: "¿A quién quieres seleccionar?",
        self: "{name} (tú)",
    },
};

export default woka;
