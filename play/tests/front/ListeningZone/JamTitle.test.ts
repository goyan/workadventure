import { describe, expect, it } from "vitest";
import type { SpotifyListening } from "@workadventure/messages";
import { jamLabelOf } from "../../../src/front/ListeningZone/JamTitle";
import type { JamRoom } from "../../../src/front/ListeningZone/ListeningZoneController";

function room(areaId: string, hostUuid: string, title?: string): JamRoom {
    return {
        zone: { areaId, propertyId: "prop", areaName: "JAM" },
        jam: { hostUuid, hostName: "Hervé", title },
    } as unknown as JamRoom;
}

function listening(jamAreaId: string, jamHostUuid: string, jamAreaName = "JAM"): SpotifyListening {
    return { jamAreaId, jamHostUuid, jamAreaName } as unknown as SpotifyListening;
}

describe("jamLabelOf", () => {
    it("names the Jam by its title, then its zone", () => {
        expect(jamLabelOf([room("a", "h", "zik")], listening("a", "h"))).toBe("zik · JAM");
    });

    it("names the zone alone when the room has no title", () => {
        expect(jamLabelOf([room("a", "h")], listening("a", "h"))).toBe("JAM");
    });

    it("does not take the title of another host's room in the same zone", () => {
        expect(jamLabelOf([room("a", "other", "zik")], listening("a", "h"))).toBe("JAM");
    });

    it("does not take the title of a room in another zone", () => {
        expect(jamLabelOf([room("b", "h", "zik")], listening("a", "h"))).toBe("JAM");
    });

    it("names the zone alone when the room is gone", () => {
        expect(jamLabelOf([], listening("a", "h"))).toBe("JAM");
    });

    it("never guesses a title for an older client that sends no host", () => {
        expect(jamLabelOf([room("a", "h", "zik")], listening("a", ""))).toBe("JAM");
    });

    it("is empty when neither a title nor a zone name is known", () => {
        expect(jamLabelOf([], listening("a", "h", ""))).toBe("");
    });
});
