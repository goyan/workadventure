import { describe, expect, it } from "vitest";
import {
    COFFEE_EVENT_NAME,
    decodeCoffee,
    encodeCoffee,
} from "../../../../../src/front/Phaser/Game/Coffee/CoffeeProtocol";

describe("CoffeeProtocol", () => {
    it("round-trips a start and an end", () => {
        for (const state of ["start", "end"] as const) {
            const { name, data } = encodeCoffee({ state, at: 1000 });
            expect(name).toBe(COFFEE_EVENT_NAME);
            expect(decodeCoffee(name, data)).toEqual({ state, at: 1000 });
        }
    });

    it("ignores another event and an invalid payload", () => {
        expect(decodeCoffee("infogene.wave", { state: "start", at: 1 })).toBeUndefined();
        expect(decodeCoffee(COFFEE_EVENT_NAME, { state: "brew", at: 1 })).toBeUndefined();
        expect(decodeCoffee(COFFEE_EVENT_NAME, { state: "start" })).toBeUndefined();
    });
});
