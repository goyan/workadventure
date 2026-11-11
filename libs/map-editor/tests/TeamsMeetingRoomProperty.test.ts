import { describe, expect, it } from "vitest";
import { AreaData, AreaDataProperty } from "../src";

describe("teamsMeetingRoomPropertyData", () => {
    it("marks an area as a Teams meeting room, without any setting", () => {
        expect(AreaDataProperty.parse({ id: "teams", type: "teamsMeetingRoomPropertyData" })).toEqual({
            id: "teams",
            type: "teamsMeetingRoomPropertyData",
        });
    });

    it("is kept on an area of a WAM file", () => {
        const area = AreaData.parse({
            id: "room-1",
            name: "Salle Teams 1",
            x: 0,
            y: 0,
            width: 96,
            height: 96,
            visible: true,
            properties: [{ id: "teams", type: "teamsMeetingRoomPropertyData" }],
        });

        expect(area.properties.map((property) => property.type)).toEqual(["teamsMeetingRoomPropertyData"]);
    });
});
