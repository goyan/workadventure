import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const coffee: DeepPartial<Translation["coffee"]> = {
    received: "☕ {name} prend une pause café",
    join: "Rejoindre",
    someone: "Quelqu'un",
};

export default coffee;
