import { describe, expect, it } from "vitest";
import {
    GOBEUR_EVENT_PREFIX,
    decodeGobeurMessage,
    encodeGobeurMessage,
    olderStart,
    type GobeurMessage,
    type GobeurStartMessage,
} from "../../../../../src/front/Phaser/Game/Gobeur/GobeurProtocol";

const start: GobeurStartMessage = {
    kind: "start",
    gameId: "g1",
    entityId: "e1",
    masterUuid: "m",
    startedAt: 1000,
    endsAt: 2000,
    level: "hard",
    prisonAreaId: "prison",
    fallbackSafeAreaId: "safe",
    players: ["a", "b"],
};

const messages: GobeurMessage[] = [
    start,
    { kind: "pos", gameId: "g1", x: 1.5, y: 2, direction: "left", at: 1234 },
    { kind: "state", gameId: "g1", survivors: ["a"], caught: ["b"], left: [], endsAt: 2000 },
    { kind: "caught", gameId: "g1", uuid: "b" },
    {
        kind: "end",
        gameId: "g1",
        reason: "timeUp",
        ranking: [
            { uuid: "a", status: "survivor" },
            { uuid: "b", status: "caught" },
        ],
    },
];

describe("GobeurProtocol", () => {
    it.each(messages)("round-trips $kind", (m) => {
        const { name, data } = encodeGobeurMessage(m);
        expect(name).toBe(GOBEUR_EVENT_PREFIX + m.kind);
        expect(decodeGobeurMessage(name, JSON.parse(JSON.stringify(data)))).toEqual(m);
    });

    it("names pos events", () => {
        expect(encodeGobeurMessage(messages[1]).name).toBe("infogene.gobeur.pos");
    });

    it("accepts start without fallbackSafeAreaId", () => {
        const rest: Partial<GobeurStartMessage> = { ...start };
        delete rest.fallbackSafeAreaId;
        expect(decodeGobeurMessage("infogene.gobeur.start", rest)).toEqual(rest);
    });

    it("rejects other prefixes, malformed data, kind mismatch and non finite numbers", () => {
        expect(decodeGobeurMessage("other.event", messages[1])).toBeUndefined();
        expect(decodeGobeurMessage("infogene.gobeur.pos", { ...messages[1], x: "a" })).toBeUndefined();
        expect(decodeGobeurMessage("infogene.gobeur.pos", { ...messages[1], x: NaN })).toBeUndefined();
        expect(decodeGobeurMessage("infogene.gobeur.pos", { ...messages[1], y: Infinity })).toBeUndefined();
        expect(decodeGobeurMessage("infogene.gobeur.caught", messages[1])).toBeUndefined();
        expect(decodeGobeurMessage("infogene.gobeur.pos", undefined)).toBeUndefined();
    });

    it("olderStart picks smallest startedAt then gameId", () => {
        const later = { ...start, gameId: "a", startedAt: 2000 };
        expect(olderStart(start, later)).toBe(start);
        expect(olderStart(later, start)).toBe(start);
        const tie = { ...start, gameId: "g0" };
        expect(olderStart(start, tie)).toBe(tie);
        expect(olderStart(tie, start)).toBe(tie);
    });
});
