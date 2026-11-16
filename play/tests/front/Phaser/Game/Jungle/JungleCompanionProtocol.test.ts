import { describe, expect, it } from "vitest";
import {
    JUNGLE_COMPANION_EVENT,
    JUNGLE_COMPANION_EXPIRY_MS,
    JungleCompanionClaims,
    decodeJungleCompanion,
    encodeJungleCompanion,
    jungleCompanionOwners,
} from "../../../../../src/front/Phaser/Game/Jungle/JungleCompanionProtocol";

describe("JungleCompanionProtocol", () => {
    it("encodes and decodes a claim and a release", () => {
        const claim = encodeJungleCompanion({ animal: "jungle:tree-1", since: 1000 });
        expect(claim.name).toBe(JUNGLE_COMPANION_EVENT);
        expect(decodeJungleCompanion(claim.name, claim.data)).toEqual({ animal: "jungle:tree-1", since: 1000 });
        const release = encodeJungleCompanion({ animal: null, since: 0 });
        expect(decodeJungleCompanion(release.name, release.data)).toEqual({ animal: null, since: 0 });
    });

    it("ignores other events and invalid payloads", () => {
        expect(decodeJungleCompanion("infogene.wave", { animal: "jungle:a", since: 1 })).toBeUndefined();
        expect(decodeJungleCompanion(JUNGLE_COMPANION_EVENT, { animal: "duck", since: 1 })).toBeUndefined();
        expect(decodeJungleCompanion(JUNGLE_COMPANION_EVENT, { animal: "jungle:a" })).toBeUndefined();
        expect(decodeJungleCompanion(JUNGLE_COMPANION_EVENT, { animal: 3, since: 1 })).toBeUndefined();
        expect(decodeJungleCompanion(JUNGLE_COMPANION_EVENT, "jungle:a")).toBeUndefined();
        expect(
            decodeJungleCompanion(JUNGLE_COMPANION_EVENT, { animal: `jungle:${"x".repeat(300)}`, since: 1 }),
        ).toBeUndefined();
    });

    it("the first claim wins, then the smaller user id", () => {
        const owners = jungleCompanionOwners([
            { owner: 7, animal: "jungle:a", since: 200 },
            { owner: 9, animal: "jungle:a", since: 100 },
            { owner: 3, animal: "jungle:b", since: 50 },
            { owner: 2, animal: "jungle:b", since: 50 },
        ]);
        expect(owners).toEqual(
            new Map([
                ["jungle:a", 9],
                ["jungle:b", 2],
            ]),
        );
    });

    it("one companion per player: the first animal a player claims", () => {
        // A player who appears twice (never sent by a client, but a late event may cross a new one) keeps one.
        const owners = jungleCompanionOwners([
            { owner: 7, animal: "jungle:a", since: 100 },
            { owner: 7, animal: "jungle:b", since: 200 },
        ]);
        expect(owners).toEqual(new Map([["jungle:a", 7]]));
    });

    it("keeps the last message of each sender, forgets a release and an expired claim", () => {
        const claims = new JungleCompanionClaims();
        claims.receive(7, { animal: "jungle:a", since: 100 }, 1000);
        claims.receive(9, { animal: "jungle:b", since: 150 }, 1000);
        claims.receive(7, { animal: "jungle:c", since: 300 }, 2000);
        expect(claims.claims(2000)).toEqual([
            { owner: 7, animal: "jungle:c", since: 300 },
            { owner: 9, animal: "jungle:b", since: 150 },
        ]);
        claims.receive(9, { animal: null, since: 0 }, 2500);
        expect(claims.claims(2500)).toEqual([{ owner: 7, animal: "jungle:c", since: 300 }]);
        expect(claims.claims(2000 + JUNGLE_COMPANION_EXPIRY_MS)).toEqual([
            { owner: 7, animal: "jungle:c", since: 300 },
        ]);
        expect(claims.claims(2001 + JUNGLE_COMPANION_EXPIRY_MS)).toEqual([]);
    });
});
