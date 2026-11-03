import { describe, expect, it } from "vitest";
import { listenerNames, overheardLoudness } from "./BubbleListeningStore";

describe("listenerNames", () => {
    const players = new Map([
        [12, { name: "Hervé" }],
        [7, { name: "Lina" }],
    ]);

    it("finds each listener among the players by the user id ending its spaceUserId", () => {
        expect(listenerNames(["https://play.example/_/office_map.wam_12", "room_7"], players)).toEqual([
            "Hervé",
            "Lina",
        ]);
    });

    it("leaves out a listener whose player is not known yet", () => {
        expect(listenerNames(["room_12", "room_99"], players)).toEqual(["Hervé"]);
    });
});

describe("overheardLoudness", () => {
    it("plays a close member at the full overheard volume", () => {
        expect(overheardLoudness(20)).toBe(1);
        expect(overheardLoudness(48)).toBe(1);
    });

    it("fades with the distance down to a murmur, never to silence", () => {
        const loudness = [60, 90, 120, 150, 400].map(overheardLoudness);
        loudness.slice(1).forEach((value, index) => expect(value).toBeLessThanOrEqual(loudness[index]));
        expect(overheardLoudness(90)).toBeLessThan(0.6);
        expect(overheardLoudness(400)).toBeCloseTo(0.1);
    });
});
