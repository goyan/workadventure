import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const area: DeepPartial<Translation["area"]> = {
    noAccess: "Lo siento, no tienes acceso a esta zona.",
    blocked: {
        locked: "Esta zona está bloqueada. No puedes entrar.",
        maxUsers: "Esta zona está llena. No puedes entrar.",
        noAccess: "Lo siento, no tienes acceso a esta zona.",
        unlockWithTrigger: "{trigger} para desbloquear esta zona.",
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
        claimDescription: "Esta es una zona personal. ¿Quieres hacerla tuya?",
        buttons: {
            yes: "Sí",
            no: "No",
            confirm: "Confirmar",
        },
        personalSpaceWithNames: "Espacio personal de {name}",
        alreadyHavePersonalArea: "Ya tienes una zona personal. Se eliminará si reclamas esta.",
    },
};

export default area;
