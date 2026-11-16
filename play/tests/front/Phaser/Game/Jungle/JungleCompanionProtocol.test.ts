import { describe, expect, it } from "vitest";
import {
    JUNGLE_COMPANION_EVENT,
    JUNGLE_COMPANION_EXPIRY_MS,
    JUNGLE_MAX_COMPANIONS,
    JungleCompanionClaims,
    decodeJungleCompanion,
    encodeJungleCompanion,
    jungleCompanionOwners,
} from "../../../../../src/front/Phaser/Game/Jungle/JungleCompanionProtocol";

const companion = (animal: string, since: number) => ({ animal, since });

describe("JungleCompanionProtocol", () => {
    it("encodes and decodes a list of companions, and an empty one", () => {
        expect(JUNGLE_MAX_COMPANIONS).toBe(5);
        const claim = encodeJungleCompanion({
            companions: [companion("jungle:tree-1", 1000), companion("jungle:b", 9)],
        });
        expect(claim.name).toBe(JUNGLE_COMPANION_EVENT);
        expect(decodeJungleCompanion(claim.name, claim.data)).toEqual({
            companions: [companion("jungle:tree-1", 1000), companion("jungle:b", 9)],
        });
        const release = encodeJungleCompanion({ companions: [] });
        expect(decodeJungleCompanion(release.name, release.data)).toEqual({ companions: [] });
    });

    it("reads the format of a client with one companion", () => {
        expect(decodeJungleCompanion(JUNGLE_COMPANION_EVENT, { animal: "jungle:a", since: 3 })).toEqual({
            companions: [companion("jungle:a", 3)],
        });
        expect(decodeJungleCompanion(JUNGLE_COMPANION_EVENT, { animal: null, since: 0 })).toEqual({ companions: [] });
    });

    it("ignores other events and invalid payloads, and more than five companions", () => {
        expect(decodeJungleCompanion("infogene.wave", { companions: [] })).toBeUndefined();
        expect(decodeJungleCompanion(JUNGLE_COMPANION_EVENT, { companions: [companion("duck", 1)] })).toBeUndefined();
        expect(decodeJungleCompanion(JUNGLE_COMPANION_EVENT, { companions: [{ animal: "jungle:a" }] })).toBeUndefined();
        expect(decodeJungleCompanion(JUNGLE_COMPANION_EVENT, { companions: "jungle:a" })).toBeUndefined();
        expect(decodeJungleCompanion(JUNGLE_COMPANION_EVENT, "jungle:a")).toBeUndefined();
        expect(
            decodeJungleCompanion(JUNGLE_COMPANION_EVENT, {
                companions: [companion(`jungle:${"x".repeat(300)}`, 1)],
            }),
        ).toBeUndefined();
        const six = Array.from({ length: 6 }, (_, i) => companion(`jungle:${i}`, i));
        expect(decodeJungleCompanion(JUNGLE_COMPANION_EVENT, { companions: six })).toBeUndefined();
    });

    it("the first claim of an animal wins, then the smaller user id", () => {
        const owners = jungleCompanionOwners([
            { owner: 7, animal: "jungle:a", since: 200 },
            { owner: 9, animal: "jungle:a", since: 100 },
            { owner: 3, animal: "jungle:b", since: 50 },
            { owner: 2, animal: "jungle:b", since: 50 },
        ]);
        expect(owners).toEqual(
            new Map([
                ["jungle:a", { owner: 9, animal: "jungle:a", since: 100 }],
                ["jungle:b", { owner: 2, animal: "jungle:b", since: 50 }],
            ]),
        );
    });

    it("five companions per player at most: their first five", () => {
        const claims = Array.from({ length: 6 }, (_, i) => ({ owner: 7, animal: `jungle:${i}`, since: 100 - i }));
        const owners = jungleCompanionOwners(claims);
        expect([...owners.keys()].sort()).toEqual(["jungle:1", "jungle:2", "jungle:3", "jungle:4", "jungle:5"]);
    });

    it("keeps the last list of each sender, forgets an empty one and an expired one", () => {
        const claims = new JungleCompanionClaims();
        claims.receive(7, { companions: [companion("jungle:a", 100)] }, 1000);
        claims.receive(9, { companions: [companion("jungle:b", 150)] }, 1000);
        claims.receive(7, { companions: [companion("jungle:c", 300), companion("jungle:d", 400)] }, 2000);
        expect(claims.claims(2000)).toEqual([
            { owner: 7, animal: "jungle:c", since: 300 },
            { owner: 7, animal: "jungle:d", since: 400 },
            { owner: 9, animal: "jungle:b", since: 150 },
        ]);
        claims.receive(9, { companions: [] }, 2500);
        expect(claims.claims(2500)).toHaveLength(2);
        expect(claims.claims(2000 + JUNGLE_COMPANION_EXPIRY_MS)).toHaveLength(2);
        expect(claims.claims(2001 + JUNGLE_COMPANION_EXPIRY_MS)).toEqual([]);
    });
});
