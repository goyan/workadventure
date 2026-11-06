import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const area: DeepPartial<Translation["area"]> = {
    noAccess: "Entschuldigung, Sie haben keinen Zugang zu diesem Bereich.",
    blocked: {
        locked: "Dieser Bereich ist gesperrt. Sie können nicht eintreten.",
        maxUsers: "Dieser Bereich ist voll. Sie können nicht eintreten.",
        noAccess: "Entschuldigung, Sie haben keinen Zugang zu diesem Bereich.",
        unlockWithTrigger: "{trigger} um diesen Bereich zu entsperren.",
    },
    knock: {
        prompt: "{trigger} to knock.",
        waiting: "You knocked, waiting…",
        later: "Not now.",
        noAnswer: "Nobody answers.",
        opened: "{name} opens the door for you.",
        request: "{name} is knocking at the door",
        enter: "Let in",
        notNow: "Not now",
    },
    personalArea: {
        claimDescription: "Dies ist ein persönlicher Bereich. Möchten Sie ihn übernehmen?",
        buttons: {
            yes: "Ja",
            no: "Nein",
            confirm: "Bestätigen",
        },
        personalSpaceWithNames: "Persönlicher Bereich von {name}",
        alreadyHavePersonalArea:
            "Sie haben bereits einen persönlichen Bereich. Er wird gelöscht, wenn Sie diesen übernehmen.",
    },
};

export default area;
