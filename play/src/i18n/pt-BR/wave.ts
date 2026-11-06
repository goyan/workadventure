import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const wave: DeepPartial<Translation["wave"]> = {
    button: "👋 Wave",
    received: "{name} waves at you 👋",
    goTo: "Go there",
    reply: "Reply",
    doNotDisturb: "{name} does not want to be disturbed: your wave will wait for them.",
    someone: "Someone",
};

export default wave;
