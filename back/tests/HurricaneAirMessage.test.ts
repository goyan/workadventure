import { RoomJoinedMessage, SubToPusherRoomMessage } from "@workadventure/messages";
import type { HurricaneAirMessage } from "@workadventure/messages";
import { describe, expect, it } from "vitest";

const signed = (values: number[]): Uint8Array => new Uint8Array(new Int8Array(values).buffer);

const air = (): HurricaneAirMessage => ({
    hurricaneId: 7,
    seq: 3,
    cellPx: 64,
    columns: 3,
    rows: 2,
    step: 0.5,
    east: signed([-127, -1, 0, 1, 127, 5]),
    north: signed([127, 1, 0, -1, -127, -5]),
    epoch: 1.7e12,
});

describe("HurricaneAirMessage", () => {
    it("survives the trip of a SubToPusherRoomMessage with its signed bytes", () => {
        const sent: SubToPusherRoomMessage = { message: { $case: "hurricaneAirMessage", hurricaneAirMessage: air() } };
        const read = SubToPusherRoomMessage.decode(SubToPusherRoomMessage.encode(sent).finish());

        expect(read).toEqual(sent);
        if (read.message?.$case !== "hurricaneAirMessage") throw new Error("wrong case");
        const message = read.message.hurricaneAirMessage;
        expect(message.east).toBeInstanceOf(Uint8Array);
        const east = new Int8Array(message.east.buffer, message.east.byteOffset, message.east.byteLength);
        expect(Array.from(east.subarray(0, 5))).toEqual([-127, -1, 0, 1, 127]);
        const north = new Int8Array(message.north.buffer, message.north.byteOffset, message.north.byteLength);
        expect(Array.from(north.subarray(0, 5))).toEqual([127, 1, 0, -1, -127]);
        expect(message.columns * message.rows).toBe(east.length);
        expect(message.epoch).toBe(1.7e12);
    });

    it("survives the trip of a RoomJoinedMessage", () => {
        const sent = RoomJoinedMessage.fromPartial({ hurricaneAir: air() });
        const read = RoomJoinedMessage.decode(RoomJoinedMessage.encode(sent).finish());

        expect(read.hurricaneAir).toEqual(air());
    });
});
