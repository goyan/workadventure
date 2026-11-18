import { get, type Writable } from "svelte/store";
import { LL } from "../../../i18n/i18n-svelte";
import type { TranslationFunctions } from "../../../i18n/i18n-types";
import type { DesktopLightControl } from "../../Interfaces/DesktopAppInterfaces";
import { NIGHT_DARKNESS_MAX, NIGHT_DARKNESS_MIN } from "../../Phaser/Game/Night/NightClock";
import { readLightSettings, setLightSetting } from "../../Stores/LightSettings";
import type { LightSettingValue } from "../../Stores/LightSettingsCode";
import { nightInEditorStore } from "../../Stores/NightStore";
import { perfShownStore } from "../../Stores/PerfStore";

type Labels = TranslationFunctions["menu"]["settings"];

interface ControlMeta {
    group: DesktopLightControl["group"];
    label: (labels: Labels, value: LightSettingValue) => string;
    min?: number;
    max?: number;
    step?: number;
    choices?: (labels: Labels) => { value: string; label: string }[];
    dependsOn?: string;
}

const percent = (value: LightSettingValue): number => Math.round(Number(value) * 100);
const shapes = (labels: Labels) => [
    { value: "oval", label: labels.skyLight.casters.shape.oval() },
    { value: "realistic", label: labels.skyLight.casters.shape.realistic() },
];
const shape = (caster: (labels: Labels) => string, dependsOn: string): ControlMeta => ({
    group: "shadows",
    label: (labels) => `${caster(labels)} : ${labels.skyLight.casters.shape.label()}`,
    choices: shapes,
    dependsOn,
});

/**
 * The light settings shown in the desktop app, in the order and with the words of the settings of WorkAdventure.
 * The names are those of the light settings code (LightSettings.ts); a setting missing here stays in WorkAdventure.
 */
const CONTROLS: Readonly<Record<string, ControlMeta>> = {
    nightDarkness: {
        group: "night",
        label: (labels, value) => labels.night.darkness({ percent: percent(value) }),
        min: NIGHT_DARKNESS_MIN,
        max: NIGHT_DARKNESS_MAX,
        step: 0.05,
    },
    ambienceOn: { group: "night", label: (labels) => labels.night.ambienceOn() },
    ambienceStrength: {
        group: "night",
        label: (labels, value) => labels.night.ambienceStrength({ percent: percent(value) }),
        min: 0,
        max: 1,
        step: 0.05,
        dependsOn: "ambienceOn",
    },
    ambienceFullShare: {
        group: "night",
        label: (labels, value) => labels.night.ambienceFullShare({ percent: percent(value) }),
        min: 0.05,
        max: 1,
        step: 0.05,
        dependsOn: "ambienceOn",
    },
    lightSoftEdgeOn: { group: "night", label: (labels) => labels.night.softEdgeOn() },
    lightSoftEdge: {
        group: "night",
        label: (labels, value) => labels.night.softEdge({ pixels: Math.round(Number(value)) }),
        min: 0,
        max: 32,
        step: 2,
        dependsOn: "lightSoftEdgeOn",
    },
    lightBounceOn: { group: "night", label: (labels) => labels.night.bounceOn() },
    lightBounce: {
        group: "night",
        label: (labels, value) => labels.night.bounce({ percent: percent(value) }),
        min: 0,
        max: 1,
        step: 0.05,
        dependsOn: "lightBounceOn",
    },
    lightSecondBounceOn: {
        group: "night",
        label: (labels) => labels.night.secondBounceOn(),
        dependsOn: "lightBounceOn",
    },
    nightRealistic: { group: "night", label: (labels) => labels.night.realistic() },
    nightKeptInEditor: { group: "night", label: (labels) => labels.night.keptInEditor() },
    sunShown: { group: "sky", label: (labels) => labels.skyLight.sun() },
    moonShown: { group: "sky", label: (labels) => labels.skyLight.moon() },
    moonPhaseCurve: {
        group: "sky",
        label: (labels) => labels.skyLight.phaseCurve.label(),
        choices: (labels) => [
            { value: "linear", label: labels.skyLight.phaseCurve.linear() },
            { value: "realistic", label: labels.skyLight.phaseCurve.realistic() },
        ],
        dependsOn: "moonShown",
    },
    shadowWalls: { group: "shadows", label: (labels) => labels.skyLight.casters.walls() },
    shadowObjects: { group: "shadows", label: (labels) => labels.skyLight.casters.objects() },
    shadowTrees: { group: "shadows", label: (labels) => labels.skyLight.casters.trees() },
    shadowTreeShape: shape((labels) => labels.skyLight.casters.trees(), "shadowTrees"),
    shadowTreeSway: {
        group: "shadows",
        label: (labels) => labels.skyLight.casters.treeSway(),
        dependsOn: "shadowTrees",
    },
    shadowDetails: { group: "shadows", label: (labels) => labels.skyLight.casters.details() },
    shadowDetailShape: shape((labels) => labels.skyLight.casters.details(), "shadowDetails"),
    shadowAvatars: { group: "shadows", label: (labels) => labels.skyLight.casters.avatars() },
    shadowAvatarShape: shape((labels) => labels.skyLight.casters.avatars(), "shadowAvatars"),
    shadowAnimals: { group: "shadows", label: (labels) => labels.skyLight.casters.animals() },
    shadowAnimalShape: shape((labels) => labels.skyLight.casters.animals(), "shadowAnimals"),
    perfCounter: { group: "other", label: (labels) => labels.perfCounter() },
};

/** Personal switches next to the light settings, not part of their code. */
const EXTRA_SWITCHES: Readonly<Record<string, Writable<boolean>>> = {
    nightKeptInEditor: nightInEditorStore,
    perfCounter: perfShownStore,
};

/** The light settings of this player, with their words and bounds, for the desktop app. */
export function readDesktopLightControls(): DesktopLightControl[] {
    const labels = get(LL).menu.settings;
    const values: Record<string, LightSettingValue> = {
        ...readLightSettings(),
        ...Object.fromEntries(Object.entries(EXTRA_SWITCHES).map(([name, store]) => [name, get(store)])),
    };
    return Object.entries(CONTROLS).flatMap(([name, meta]) => {
        const value = values[name];
        if (value === undefined) return [];
        const kind = meta.choices ? "choice" : typeof value === "boolean" ? "switch" : "number";
        return [
            {
                name,
                group: meta.group,
                label: meta.label(labels, value),
                kind,
                value,
                ...(meta.min !== undefined ? { min: meta.min } : {}),
                ...(meta.max !== undefined ? { max: meta.max } : {}),
                ...(meta.step !== undefined ? { step: meta.step } : {}),
                ...(meta.choices ? { choices: meta.choices(labels) } : {}),
                ...(meta.dependsOn ? { dependsOn: meta.dependsOn } : {}),
            },
        ];
    });
}

/** Changes a light setting from the desktop app; an unknown name or a value of another kind is refused. */
export function applyDesktopLightControl(name: string, value: LightSettingValue): void {
    const extra = EXTRA_SWITCHES[name];
    if (extra) {
        if (typeof value !== "boolean") throw new Error(`Light setting ${name} expects a switch`);
        extra.set(value);
        return;
    }
    if (!(name in CONTROLS) || !setLightSetting(name, value)) throw new Error(`Unknown light setting ${name}`);
}
