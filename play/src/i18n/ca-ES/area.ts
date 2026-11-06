import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const area: DeepPartial<Translation["area"]> = {
    noAccess: "Ho sentim, no tens accés a aquesta àrea.",
    blocked: {
        locked: "Aquesta àrea està bloquejada. No pots entrar.",
        maxUsers: "Aquesta àrea està plena. No pots entrar.",
        noAccess: "Ho sentim, no tens accés a aquesta àrea.",
        unlockWithTrigger: "{trigger} per desbloquejar aquesta àrea.",
    },
    knock: {
        prompt: "{trigger} to knock.",
        waiting: "You knocked, waiting…",
        waitingAdmin: "You knocked — {trigger} to force the door open.",
        later: "Not now.",
        noAnswer: "Nobody answers.",
        opened: "{name} opens the door for you.",
        request: "{name} is knocking at the door",
        enter: "Let in",
        notNow: "Not now",
    },
    personalArea: {
        claimDescription: "Aquesta és una àrea personal. Vols fer-la teva?",
        buttons: {
            yes: "Sí",
            no: "No",
            confirm: "Confirma",
        },
        personalSpaceWithNames: "Espai personal de {name}",
        alreadyHavePersonalArea: "Ja tens una àrea personal. S'eliminarà si reclames aquesta.",
    },
};

export default area;
