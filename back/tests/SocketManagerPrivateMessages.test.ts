import {
    JoinRoomMessage as JoinRoomMessageCodec,
    PositionMessage_Direction,
    QueryMessage as QueryMessageCodec,
    RoomJoinedMessage,
} from "@workadventure/messages";
import type { JoinRoomMessage as JoinRoomMessageData, QueryMessage } from "@workadventure/messages";
import { privateMessageEventName } from "@workadventure/shared-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import { GameRoom } from "../src/Model/GameRoom";
import type { EventSocket } from "../src/RoomManager";
import { socketManager } from "../src/Services/SocketManager";
import type { User, UserSocket } from "../src/Model/User";

const captureExceptionMock = vi.hoisted(() => vi.fn());

vi.mock("@sentry/node", () => ({ captureException: captureExceptionMock }));

const ROOM_URL = "https://play.workadventu.re/_/global/localhost/private-messages.json";

function createMockUserSocket() {
    const write = vi.fn().mockReturnValue(true);

    return {
        socket: mock<UserSocket>({ write }),
        write,
    };
}

function createJoinRoomMessage(uuid: string, name: string, x: number, y: number): JoinRoomMessageData {
    return JoinRoomMessageCodec.fromPartial({
        userUuid: uuid,
        IPAddress: "10.0.0.2",
        name,
        positionMessage: {
            x,
            y,
            direction: PositionMessage_Direction.DOWN,
            moving: false,
            running: false,
        },
    });
}

async function createWorld(): Promise<GameRoom> {
    return GameRoom.create(
        ROOM_URL,
        () => {},
        () => {},
        160,
        160,
        () => {},
        () => {},
        () => {},
        () => {},
        () => {},
        () => {},
        () => {},
        () => {},
    );
}

function nativeQuery(message: QueryMessage): QueryMessage {
    return QueryMessageCodec.decode(QueryMessageCodec.encode(message).finish());
}

function flushPendingMessages(user: User): void {
    user.write({
        $case: "roomJoinedMessage",
        roomJoinedMessage: RoomJoinedMessage.fromPartial({ currentUserId: user.id }),
    });
}

afterEach(() => {
    vi.restoreAllMocks();
    captureExceptionMock.mockClear();
});

describe("SocketManager private messages", () => {
    it("acknowledges a native query and delivers only to distant recipient sessions", async () => {
        const world = await createWorld();
        const senderSocket = createMockUserSocket();
        const recipientSocket = createMockUserSocket();
        const recipientTabSocket = createMockUserSocket();
        const bystanderSocket = createMockUserSocket();
        const sender = await world.join(senderSocket.socket, createJoinRoomMessage("human", "Sender", 100, 100));
        const recipient = await world.join(recipientSocket.socket, createJoinRoomMessage("npc:ada", "Ada", 900, 900));
        const recipientTab = await world.join(
            recipientTabSocket.socket,
            createJoinRoomMessage("npc:ada", "Ada", 1200, 1200),
        );
        const bystander = await world.join(
            bystanderSocket.socket,
            createJoinRoomMessage("other-human", "Bystander", 500, 500),
        );
        flushPendingMessages(sender);
        flushPendingMessages(recipient);
        flushPendingMessages(recipientTab);
        flushPendingMessages(bystander);
        senderSocket.write.mockClear();

        const emitSender = vi.spyOn(sender, "emitInBatch");
        const emitRecipient = vi.spyOn(recipient, "emitInBatch");
        const emitRecipientTab = vi.spyOn(recipientTab, "emitInBatch");
        const emitBystander = vi.spyOn(bystander, "emitInBatch");
        const writeListener = vi.fn();
        const listener = mock<EventSocket>({
            request: { name: privateMessageEventName },
            write: writeListener,
        });
        world.addEventListener(listener);
        const query = nativeQuery({
            id: 41,
            query: {
                $case: "sendPrivateMessageQuery",
                sendPrivateMessageQuery: { recipientUuid: "npc:ada", text: "Hello from far away" },
            },
        });

        await socketManager.handleQueryMessage(world, sender, query);

        expect(senderSocket.write).toHaveBeenCalledExactlyOnceWith(
            {
                message: {
                    $case: "answerMessage",
                    answerMessage: {
                        id: 41,
                        answer: {
                            $case: "sendPrivateMessageAnswer",
                            sendPrivateMessageAnswer: {},
                        },
                    },
                },
            },
            undefined,
        );
        const delivered = {
            message: {
                $case: "receivedEventMessage",
                receivedEventMessage: {
                    name: privateMessageEventName,
                    senderId: sender.id,
                    data: {
                        recipientUuid: "npc:ada",
                        text: "Hello from far away",
                        sender: { uuid: "human", name: "Sender" },
                    },
                },
            },
        };
        expect(emitRecipient).toHaveBeenCalledExactlyOnceWith(delivered);
        expect(emitRecipientTab).toHaveBeenCalledExactlyOnceWith(delivered);
        expect(emitSender).not.toHaveBeenCalled();
        expect(emitBystander).not.toHaveBeenCalled();
        expect(writeListener).not.toHaveBeenCalled();
        world.removeEventListener(listener);
    });

    it("returns expected refusal errors without logging or reporting private text", async () => {
        const world = await createWorld();
        const senderSocket = createMockUserSocket();
        const recipientSocket = createMockUserSocket();
        const sender = await world.join(senderSocket.socket, createJoinRoomMessage("human", "Sender", 100, 100));
        const recipient = await world.join(recipientSocket.socket, createJoinRoomMessage("npc:ada", "Ada", 900, 900));
        flushPendingMessages(sender);
        flushPendingMessages(recipient);
        senderSocket.write.mockClear();
        const emitRecipient = vi.spyOn(recipient, "emitInBatch");
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        const privateText = "confidential-refusal-payload";

        await socketManager.handleQueryMessage(
            world,
            sender,
            nativeQuery({
                id: 42,
                query: {
                    $case: "sendPrivateMessageQuery",
                    sendPrivateMessageQuery: { recipientUuid: "offline-user", text: privateText },
                },
            }),
        );
        const invalidText = `${privateText}${"x".repeat(500)}`;
        await socketManager.handleQueryMessage(
            world,
            sender,
            nativeQuery({
                id: 45,
                query: {
                    $case: "sendPrivateMessageQuery",
                    sendPrivateMessageQuery: { recipientUuid: "npc:ada", text: invalidText },
                },
            }),
        );

        expect(senderSocket.write).toHaveBeenCalledWith(
            {
                message: {
                    $case: "answerMessage",
                    answerMessage: {
                        id: 42,
                        answer: {
                            $case: "error",
                            error: { message: "Private message recipient is no longer in this map" },
                        },
                    },
                },
            },
            undefined,
        );
        expect(senderSocket.write).toHaveBeenCalledTimes(2);
        expect(senderSocket.write.mock.calls[1]?.[0]).toMatchObject({
            message: {
                $case: "answerMessage",
                answerMessage: {
                    id: 45,
                    answer: { $case: "error" },
                },
            },
        });
        expect(emitRecipient).not.toHaveBeenCalled();
        expect(consoleError).not.toHaveBeenCalled();
        expect(captureExceptionMock).not.toHaveBeenCalled();
        expect(JSON.stringify(consoleError.mock.calls)).not.toContain(privateText);
        expect(JSON.stringify(captureExceptionMock.mock.calls)).not.toContain(privateText);
        expect(JSON.stringify(senderSocket.write.mock.calls)).not.toContain(invalidText);
    });

    it("rejects reserved generic events without broadcasting or notifying Room API listeners", async () => {
        const world = await createWorld();
        const senderSocket = createMockUserSocket();
        const bystanderSocket = createMockUserSocket();
        const sender = await world.join(senderSocket.socket, createJoinRoomMessage("human", "Sender", 100, 100));
        const bystander = await world.join(
            bystanderSocket.socket,
            createJoinRoomMessage("other-human", "Bystander", 500, 500),
        );
        flushPendingMessages(sender);
        flushPendingMessages(bystander);
        senderSocket.write.mockClear();
        const emitBystander = vi.spyOn(bystander, "emitInBatch");
        const writeListener = vi.fn();
        const listener = mock<EventSocket>({
            request: { name: privateMessageEventName },
            write: writeListener,
        });
        const captureException = captureExceptionMock;
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        world.addEventListener(listener);
        const privateText = "reserved-event-private-payload";

        await socketManager.handleQueryMessage(
            world,
            sender,
            nativeQuery({
                id: 43,
                query: {
                    $case: "sendEventQuery",
                    sendEventQuery: {
                        name: privateMessageEventName,
                        data: privateText,
                        targetUserIds: [],
                    },
                },
            }),
        );

        expect(senderSocket.write).toHaveBeenCalledWith(
            {
                message: {
                    $case: "answerMessage",
                    answerMessage: {
                        id: 43,
                        answer: {
                            $case: "error",
                            error: { message: "Private messages require a dedicated query" },
                        },
                    },
                },
            },
            undefined,
        );
        expect(emitBystander).not.toHaveBeenCalled();
        expect(writeListener).not.toHaveBeenCalled();
        expect(consoleError).not.toHaveBeenCalled();
        expect(captureException).not.toHaveBeenCalled();
        expect(JSON.stringify(consoleError.mock.calls)).not.toContain(privateText);
        expect(JSON.stringify(captureException.mock.calls)).not.toContain(privateText);
        world.removeEventListener(listener);
    });

    it("returns a generic error and reports only operation context for unexpected failures", async () => {
        const world = await createWorld();
        const senderSocket = createMockUserSocket();
        const sender = await world.join(senderSocket.socket, createJoinRoomMessage("human", "Sender", 100, 100));
        flushPendingMessages(sender);
        senderSocket.write.mockClear();
        const privateText = "private-payload-that-must-not-leak";
        const failure = new Error("delivery infrastructure unavailable");
        const sendPrivateMessage = vi.spyOn(world, "sendPrivateMessage").mockImplementation(() => {
            throw failure;
        });
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

        await socketManager.handleQueryMessage(
            world,
            sender,
            nativeQuery({
                id: 44,
                query: {
                    $case: "sendPrivateMessageQuery",
                    sendPrivateMessageQuery: { recipientUuid: "npc:ada", text: privateText },
                },
            }),
        );

        expect(senderSocket.write).toHaveBeenCalledWith(
            {
                message: {
                    $case: "answerMessage",
                    answerMessage: {
                        id: 44,
                        answer: {
                            $case: "error",
                            error: { message: "Private message could not be sent" },
                        },
                    },
                },
            },
            undefined,
        );
        expect(sendPrivateMessage).toHaveBeenCalledOnce();
        expect(consoleError).toHaveBeenCalledWith(
            "Failed to send a private message",
            { queryCase: "sendPrivateMessageQuery", userId: sender.id, roomId: ROOM_URL },
            failure,
        );
        expect(captureExceptionMock).toHaveBeenCalledWith(failure, {
            extra: { queryCase: "sendPrivateMessageQuery", userId: sender.id, roomId: ROOM_URL },
        });
        expect(JSON.stringify(consoleError.mock.calls)).not.toContain(privateText);
        expect(JSON.stringify(captureExceptionMock.mock.calls)).not.toContain(privateText);
    });
});
