import { describe, expect, it } from "vitest";
import { buildJamSpaceName, parseJamSpaceName } from "../src";

const ROOM = "https://play.example.org/_/global/maps.example.org/office.wam";
const parts = { roomUrl: ROOM, areaId: "area-1", propertyId: "prop-1", hostUuid: "uuid-host" };

describe("jam space names", () => {
    it("reads back what it built, even behind the world prefix the pusher adds", () => {
        expect(parseJamSpaceName(`world.${buildJamSpaceName(parts)}`)).toEqual(parts);
    });

    it("keeps a name without a dot or a colon inside its parts", () => {
        const name = buildJamSpaceName({ ...parts, areaId: "a:b.c" });

        expect(parseJamSpaceName(name)?.areaId).toBe("a:b.c");
        expect(name.split(".")).toHaveLength(1);
    });

    it("does not take an ordinary space for a Jam", () => {
        expect(parseJamSpaceName("world.some-bubble")).toBeUndefined();
        expect(parseJamSpaceName("world.jam:only:three:parts")).toBeUndefined();
    });

    it("refuses a malformed escape sequence", () => {
        expect(parseJamSpaceName("jam:%E0%A4%A:b:c:d")).toBeUndefined();
    });
});
