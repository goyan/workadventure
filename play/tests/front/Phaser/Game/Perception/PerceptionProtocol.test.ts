import { describe, expect, it } from "vitest";
import {
    decodePerception,
    perceptionOf,
    shownPerceptionMark,
} from "../../../../../src/front/Phaser/Game/Perception/PerceptionProtocol";

describe("PerceptionProtocol", () => {
    it("reads only the two known values, anything else (an older client) being the shared world", () => {
        expect(decodePerception("basic")).toBe("basic");
        expect(decodePerception("place")).toBe("place");
        for (const value of [undefined, null, "none", "BASIC", "Paris", 1, true, {}, ["basic"], " place"]) {
            expect(decodePerception(value)).toBe("none");
        }
    });

    it("lets Basique win over a city followed, which it hides too", () => {
        expect(perceptionOf({ basic: false, place: false })).toBe("none");
        expect(perceptionOf({ basic: true, place: false })).toBe("basic");
        expect(perceptionOf({ basic: false, place: true })).toBe("place");
        expect(perceptionOf({ basic: true, place: true })).toBe("basic");
    });

    it("shows the symbol of the bearer to a viewer who perceives the shared world only", () => {
        expect(shownPerceptionMark("none", "basic", false)).toBe("basic");
        expect(shownPerceptionMark("none", "place", false)).toBe("place");
        expect(shownPerceptionMark("none", "none", false)).toBeUndefined();
        expect(shownPerceptionMark("none", perceptionOf({ basic: true, place: true }), false)).toBe("basic");
    });

    it("shows nothing to a viewer in Basique or following another place, whoever the bearer", () => {
        for (const viewer of ["basic", "place"] as const) {
            for (const bearer of ["none", "basic", "place"] as const) {
                expect(shownPerceptionMark(viewer, bearer, false)).toBeUndefined();
            }
        }
    });

    it("never shows a symbol over one's own avatar", () => {
        for (const bearer of ["none", "basic", "place"] as const) {
            expect(shownPerceptionMark("none", bearer, true)).toBeUndefined();
        }
    });
});
