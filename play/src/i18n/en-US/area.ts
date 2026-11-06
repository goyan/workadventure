import type { BaseTranslation } from "../i18n-types";

const area: BaseTranslation = {
    noAccess: "Sorry, you don't have access to this area.",
    blocked: {
        locked: "This area is locked. You cannot enter.",
        maxUsers: "This area is full. You cannot enter.",
        noAccess: "Sorry, you don't have access to this area.",
        unlockWithTrigger: "{trigger} to unlock this area.",
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
        claimDescription: "This is a personal area. Do you want to make it yours ?",
        buttons: {
            yes: "Yes",
            no: "No",
            confirm: "Confirm",
        },
        personalSpaceWithNames: "{name}'s personal space",
        alreadyHavePersonalArea: "You already have a personal area. Will be deleted if you claim this one.",
    },
};

export default area;
