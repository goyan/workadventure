// @vitest-environment jsdom
//@ts-ignore Forcing environment variables in global object
window.env = {
    MAX_USERNAME_LENGTH: 10,
    DEBUG_MODE: true,
};

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/front/Enum/EnvironmentVariable.ts", () => {
    return {
        MAX_USERNAME_LENGTH: 10,
    };
});

import {
    areCharacterTexturesValid,
    isUserNameValid,
    maxUserNameLength,
} from "../../../../src/front/Connection/LocalUserUtils";
import { localUserStore } from "../../../../src/front/Connection/LocalUserStore";

describe("isUserNameValid()", () => {
    it("should validate name with letters", () => {
        expect(isUserNameValid("toto")).toBe(true);
    });

    it("should not validate empty name", () => {
        expect(isUserNameValid("")).toBe(false);
    });
    it("should not validate string with too many letters", () => {
        let testString = "";
        for (let i = 0; i < maxUserNameLength + 2; i++) {
            testString += "a";
        }
        expect(isUserNameValid(testString)).toBe(false);
    });
    it("should not validate spaces", () => {
        expect(isUserNameValid(" ")).toBe(false);
    });
    it("should reject special characters", () => {
        expect(isUserNameValid("%&-")).toBe(false);
    });
    it("should validate accents", () => {
        expect(isUserNameValid("éàëè")).toBe(true);
    });
    it("should validate chinese characters", () => {
        expect(isUserNameValid("中文鍵盤")).toBe(true);
    });
});

describe("avatar video preference", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("defaults to enabled and persists both disabling and re-enabling", () => {
        const values = new Map<string, string>();
        vi.stubGlobal("localStorage", {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
        });
        expect(localUserStore.getAvatarVideosEnabled()).toBe(true);
        localUserStore.setAvatarVideosEnabled(false);
        expect(localUserStore.getAvatarVideosEnabled()).toBe(false);
        expect(values.get("avatarVideosEnabled")).toBe("false");
        localUserStore.setAvatarVideosEnabled(true);
        expect(localUserStore.getAvatarVideosEnabled()).toBe(true);
        expect(values.get("avatarVideosEnabled")).toBe("true");
    });
});

describe("areCharacterTextureValid()", () => {
    it("should validate default textures array", () => {
        expect(areCharacterTexturesValid(["male1", "male2"])).toBe(true);
    });

    it("should not validate an empty array", () => {
        expect(areCharacterTexturesValid([])).toBe(false);
    });
    it("should not validate space only strings", () => {
        expect(areCharacterTexturesValid([" ", "male1"])).toBe(false);
    });

    it("should not validate empty strings", () => {
        expect(areCharacterTexturesValid(["", "male1"])).toBe(false);
    });
});

describe("localUserStore microphone noise suppression settings", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("turns advanced noise suppression and browser noise suppression on by default", () => {
        expect(localUserStore.getNoiseSuppressionEnabled()).toBe(true);
        expect(localUserStore.getNoiseSuppressionProvider()).toBe("workadventure");
        expect(localUserStore.getMicrophoneBrowserNoiseSuppression()).toBe(true);
    });

    it("keeps advanced noise suppression off when explicitly disabled", () => {
        localUserStore.setNoiseSuppressionEnabled(false);

        expect(localUserStore.getNoiseSuppressionEnabled()).toBe(false);
    });

    it("does not migrate the legacy browser provider to active WorkAdventure noise suppression", () => {
        localStorage.setItem("noiseSuppressionEnabled", "true");
        localStorage.setItem("noiseSuppressionProvider", "browser");

        expect(localUserStore.getNoiseSuppressionEnabled()).toBe(false);
        expect(localStorage.getItem("noiseSuppressionEnabled")).toBe("false");
        expect(localStorage.getItem("noiseSuppressionProvider")).toBe("workadventure");
        expect(localUserStore.getNoiseSuppressionProvider()).toBe("workadventure");
        expect(localUserStore.getMicrophoneBrowserNoiseSuppression()).toBe(true);
    });

    it("persists browser noise suppression when explicitly disabled", () => {
        localUserStore.setMicrophoneBrowserNoiseSuppression(false);

        expect(localUserStore.getMicrophoneBrowserNoiseSuppression()).toBe(false);
    });
});
