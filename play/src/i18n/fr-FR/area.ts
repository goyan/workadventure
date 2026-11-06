import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const area: DeepPartial<Translation["area"]> = {
    noAccess: "Désolé, vous n'avez pas accès à cette zone.",
    blocked: {
        locked: "Cette zone est verrouillée. Vous ne pouvez pas entrer.",
        maxUsers: "Cette zone est pleine. Vous ne pouvez pas entrer.",
        noAccess: "Désolé, vous n'avez pas accès à cette zone.",
        unlockWithTrigger: "{trigger} pour déverrouiller cette zone.",
    },
    knock: {
        prompt: "{trigger} pour toquer.",
        waiting: "Tu as toqué, en attente…",
        waitingAdmin: "Tu as toqué — {trigger} pour forcer l'ouverture.",
        later: "Pas maintenant.",
        noAnswer: "Personne ne répond.",
        opened: "{name} t'ouvre la porte.",
        request: "{name} toque à la porte",
        enter: "Entrer",
        notNow: "Pas maintenant",
    },
    personalArea: {
        claimDescription: "Il s'agit d'un espace personnel. Voulez-vous vous l'approprier ?",
        buttons: {
            yes: "Oui",
            no: "Non",
            confirm: "Confirmer",
        },
        personalSpaceWithNames: "Espace personnel de {name}",
        alreadyHavePersonalArea: "Vous avez déjà un espace personnel. Il sera supprimé si vous prenez celui-ci.",
    },
};

export default area;
