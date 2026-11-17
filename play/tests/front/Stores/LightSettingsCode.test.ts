import { describe, expect, it } from "vitest";
import {
    LIGHT_SETTINGS_CODE_PREFIX,
    acceptedLightSettings,
    decodeLightSettings,
    encodeLightSettings,
    type LightSettingKinds,
} from "../../../src/front/Stores/LightSettingsCode";

const kinds: LightSettingKinds = {
    darkness: { kind: "number" },
    realistic: { kind: "switch" },
    curve: { kind: "choice", choices: ["linear", "realistic"] },
};

describe("the code of the light settings", () => {
    it("carries every setting from one player to another", () => {
        const settings = { darkness: 0.9, realistic: true, curve: "linear" };

        const code = encodeLightSettings(settings);

        expect(code.startsWith(LIGHT_SETTINGS_CODE_PREFIX)).toBe(true);
        expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(decodeLightSettings(code)).toEqual(settings);
    });

    it("is read with the spaces and line breaks a message adds around or inside it", () => {
        const code = encodeLightSettings({ darkness: 0.9 });
        const pasted = `  ${code.slice(0, 8)}\n ${code.slice(8)}  `;

        expect(decodeLightSettings(pasted)).toEqual({ darkness: 0.9 });
    });

    it("refuses what is not such a code", () => {
        expect(decodeLightSettings("")).toBeUndefined();
        expect(decodeLightSettings("hello")).toBeUndefined();
        expect(decodeLightSettings(`${LIGHT_SETTINGS_CODE_PREFIX}%%%`)).toBeUndefined();
        expect(decodeLightSettings(`${LIGHT_SETTINGS_CODE_PREFIX}${btoa("[1,2]")}`)).toBeUndefined();
        expect(decodeLightSettings(`${LIGHT_SETTINGS_CODE_PREFIX}${btoa("not json")}`)).toBeUndefined();
    });
});

describe("acceptedLightSettings", () => {
    it("keeps the settings it knows, each of its own kind", () => {
        expect(acceptedLightSettings({ darkness: 0.9, realistic: false, curve: "realistic" }, kinds)).toEqual({
            darkness: 0.9,
            realistic: false,
            curve: "realistic",
        });
    });

    it("leaves out a setting it does not know, as a newer version may send", () => {
        expect(acceptedLightSettings({ darkness: 0.9, later: 3 }, kinds)).toEqual({ darkness: 0.9 });
    });

    it("leaves out a value of the wrong kind, or a choice that does not exist", () => {
        expect(
            acceptedLightSettings({ darkness: "dark", realistic: 1, curve: "cubic", other: Number.NaN }, {
                ...kinds,
                other: { kind: "number" },
            }),
        ).toEqual({});
    });
});
