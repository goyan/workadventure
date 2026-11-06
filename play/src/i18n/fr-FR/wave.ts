import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const wave: DeepPartial<Translation["wave"]> = {
    button: "👋 Coucou",
    received: "{name} te fait coucou 👋",
    goTo: "Y aller",
    reply: "Répondre",
    doNotDisturb: "{name} ne veut pas être dérangé : ton coucou l'attendra.",
    someone: "Quelqu'un",
};

export default wave;
