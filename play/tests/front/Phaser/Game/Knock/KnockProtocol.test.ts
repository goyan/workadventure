import { describe, expect, it } from "vitest";
import {
    decodeKnockMessage,
    encodeKnockMessage,
    type KnockMessage,
} from "../../../../../src/front/Phaser/Game/Knock/KnockProtocol";

const messages: KnockMessage[] = [
    { kind: "request", areaId: "a1", visitorUuid: "v1", visitorName: "Alice", at: 1000 },
    { kind: "answer", areaId: "a1", visitorUuid: "v1", answer: "enter", answeredBy: "Bob", at: 2000 },
    { kind: "cancel", areaId: "a1", visitorUuid: "v1", at: 3000 },
];

describe("KnockProtocol", () => {
    it.each(messages)("round-trips a $kind message with the expected event name", (message) => {
        const { name, data } = encodeKnockMessage(message);
        expect(name).toBe(`infogene.knock.${message.kind}`);
        expect(decodeKnockMessage(name, data)).toEqual(message);
    });

    it("ignores another prefix", () => {
        const { data } = encodeKnockMessage(messages[0]);
        expect(decodeKnockMessage("infogene.gobeur.start", data)).toBeUndefined();
    });

    it("ignores an answer other than enter|later", () => {
        expect(decodeKnockMessage("infogene.knock.answer", { ...messages[1], answer: "maybe" })).toBeUndefined();
    });

    it("ignores a missing field", () => {
        const incomplete: Record<string, unknown> = { ...messages[0] };
        delete incomplete.visitorName;
        expect(decodeKnockMessage("infogene.knock.request", incomplete)).toBeUndefined();
    });

    it("ignores a non-finite at", () => {
        expect(decodeKnockMessage("infogene.knock.request", { ...messages[0], at: Infinity })).toBeUndefined();
        expect(decodeKnockMessage("infogene.knock.request", { ...messages[0], at: NaN })).toBeUndefined();
    });

    it("ignores an event name that does not match the payload kind", () => {
        expect(decodeKnockMessage("infogene.knock.cancel", messages[0])).toBeUndefined();
    });
});
