import { describe, expect, it } from "vitest";
import { findExternalModuleFactory } from "../../../../src/front/Phaser/Game/ExternalModuleFactories";

describe("findExternalModuleFactory", () => {
    it("should find a bundled external module by its folder name", () => {
        expect(findExternalModuleFactory("infogene-calendar")).toBeTypeOf("function");
    });

    it("should return undefined for a module that is not bundled", () => {
        expect(findExternalModuleFactory("missing-module")).toBeUndefined();
    });

    it("should not match a module whose folder name only ends with the requested name", () => {
        const factory = () => Promise.resolve({});
        const factories = { "/src/front/external-modules/other-calendar/index.ts": factory };

        expect(findExternalModuleFactory("calendar", factories)).toBeUndefined();
    });
});
