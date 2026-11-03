import { describe, expect, it } from "vitest";
import { listenerNames } from "./BubbleListeningStore";

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
