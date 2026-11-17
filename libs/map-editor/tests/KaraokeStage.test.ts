import { describe, expect, it } from "vitest";
import {
    buildKaraokeStageSpaceName,
    parseKaraokeStageSpaceName,
    KaraokeStageStateSchema,
} from "../src/ListeningZone/KaraokeStage";

const parts = {
    roomUrl: "https://play.example.org/office.wam",
    areaId: "zone.1:arabe عربي",
    propertyId: "prop/1",
    hostUuid: "host.uuid",
    turnId: "00000000-0000-4000-8000-000000000001",
    singerUuid: "singer.uuid",
};

describe("karaoke stage identity", () => {
    it("round-trips encoded room and user identities with a world prefix", () => {
        expect(parseKaraokeStageSpaceName(`world.${buildKaraokeStageSpaceName(parts)}`)).toEqual(parts);
    });
    it("does not reuse a media room when a singer returns for another turn", () => {
        expect(buildKaraokeStageSpaceName(parts)).not.toBe(
            buildKaraokeStageSpaceName({ ...parts, turnId: "00000000-0000-4000-8000-000000000002" }),
        );
    });
    it("rejects invalid encoding and invalid turns", () => {
        expect(parseKaraokeStageSpaceName("karaoke:%ZZ:a:p:h:bad:s")).toBeUndefined();
        expect(parseKaraokeStageSpaceName(buildKaraokeStageSpaceName({ ...parts, turnId: "bad" }))).toBeUndefined();
    });
    it("bounds the public queue and applause", () => {
        const state = { ...parts, enabled: true, queue: [], applause: 0 };
        expect(KaraokeStageStateSchema.safeParse(state).success).toBe(true);
        expect(
            KaraokeStageStateSchema.safeParse({ ...state, queue: Array.from({ length: 21 }, () => "guest") }).success,
        ).toBe(false);
        expect(KaraokeStageStateSchema.safeParse({ ...state, applause: -1 }).success).toBe(false);
    });
});
