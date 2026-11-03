// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import { get } from "svelte/store";
import {
    FrontToPusherWebSocketMessage,
    PusherToFrontWebSocketMessage,
    type ServerToClientMessage,
} from "@workadventure/messages";
import { privateMessageEventName } from "@workadventure/shared-utils";

vi.mock("../../../src/front/Enum/EnvironmentVariable.ts", () => import("../mocks/frontEnvironmentVariableMock"));
vi.mock("../../../src/front/Administration/AnalyticsClient", () => ({
    analyticsClient: { trackAdminEvent: vi.fn() },
}));
vi.mock("../../../src/front/Phaser/Game/GameManager", () => ({
    gameManager: { currentStartedRoom: { roomName: "room" } },
}));
vi.mock("../../../src/front/Connection/ConnectionManager", () => ({
    connectionManager: { tabId: "tab", unloading: false },
}));
vi.mock("../../../src/front/Stores/MediaStore", async () => {
    const { writable } = await import("svelte/store");
    return { requestedCameraState: writable(false), requestedMicrophoneState: writable(false) };
});
vi.mock("../../../src/front/Stores/ScreenSharingStore", async () => {
    const { writable } = await import("svelte/store");
    return { requestedScreenSharingState: writable(false) };
});
vi.mock("../../../src/front/Phaser/Login/SelectCharacterScene", () => ({}));
vi.mock("../../../src/front/Phaser/Login/SelectCompanionScene", () => ({}));
vi.mock("../../../src/front/Stores/MenuStore", async () => {
    const { writable } = await import("svelte/store");
    return {
        inviteUserActivated: writable(true),
        mapEditorActivated: writable(false),
    };
});
vi.mock("../../../src/front/Stores/FollowStore", () => ({}));
vi.mock("../../../src/front/Stores/MegaphoneStore", () => ({}));
vi.mock("../../../src/front/Components/ActionBar/MenuIcons/megaphoneActions", () => ({}));

import { RoomConnection } from "../../../src/front/Connection/RoomConnection";
import { WorkAdventureWebSocket } from "../../../src/front/Connection/WorkAdventureWebSocket";
import {
    clearPrivateMessages,
    privateMessageHistoryStore,
    privateMessageNotificationStore,
} from "../../../src/front/Stores/PrivateMessageStore";

const roomConnectedMessage: ServerToClientMessage = {
    message: {
        $case: "roomConnectedMessage",
        roomConnectedMessage: { editMapCommandsArrayMessage: undefined, tag: [], canEdit: false },
    },
};

const roomJoinedMessage: ServerToClientMessage = {
    message: {
        $case: "roomJoinedMessage",
        roomJoinedMessage: {
            item: [],
            currentUserId: 1,
            variable: [],
            userRoomToken: "room-token",
            characterTextures: [],
            activatedInviteUser: false,
            playerVariable: [],
            applications: [],
            canEdit: false,
            companionTexture: undefined,
            areaPropertyVariable: [],
        },
    },
};

let connection: RoomConnection | undefined;
let socketEvents: EventTarget | undefined;
let socket = mock<WebSocket>();

function sendServerFrame(message: ServerToClientMessage, nonce: number): void {
    if (!socketEvents) throw new Error("Room connection socket was not initialized");
    const data = PusherToFrontWebSocketMessage.encode({ nonce, message }).finish();
    socketEvents.dispatchEvent(new MessageEvent("message", { data }));
}

function createJoinedConnection(): RoomConnection {
    socketEvents = new EventTarget();
    socket = mock<WebSocket>({
        readyState: WebSocket.OPEN,
        addEventListener: socketEvents.addEventListener.bind(socketEvents),
        removeEventListener: socketEvents.removeEventListener.bind(socketEvents),
    });
    WorkAdventureWebSocket.setWebsocketFactory(() => socket);
    connection = new RoomConnection(null, "http://play.test/_/global/map.json", [], null);
    sendServerFrame(roomConnectedMessage, 1);
    sendServerFrame(roomJoinedMessage, 2);
    return connection;
}

afterEach(() => {
    connection?.closeConnection();
    connection = undefined;
    socketEvents = undefined;
    WorkAdventureWebSocket.setWebsocketFactory(null);
    clearPrivateMessages();
    vi.clearAllTimers();
    vi.useRealTimers();
});

describe("RoomConnection private messages", () => {
    it("uses the dedicated private query and resolves only after its matching ACK", async () => {
        vi.useFakeTimers();
        const roomConnection = createJoinedConnection();

        const sent = roomConnection.emitPrivateMessage("peer-ada", "  Hello Ada  ").then(
            () => "resolved",
            () => "rejected",
        );
        const output = socket.send.mock.calls[0]?.[0];
        if (!(output instanceof Uint8Array)) throw new Error("Private message query was not sent as a protobuf frame");
        const request = FrontToPusherWebSocketMessage.decode(output);

        expect(request.message?.message?.$case).toBe("queryMessage");
        if (request.message?.message?.$case !== "queryMessage") throw new Error("Expected a room query frame");
        expect(request.message.message.queryMessage.query?.$case).toBe("sendPrivateMessageQuery");
        if (request.message.message.queryMessage.query?.$case !== "sendPrivateMessageQuery")
            throw new Error("Expected the dedicated private message query");
        expect(request.message.message.queryMessage.query.sendPrivateMessageQuery).toEqual({
            recipientUuid: "peer-ada",
            text: "Hello Ada",
        });

        sendServerFrame(
            {
                message: {
                    $case: "answerMessage",
                    answerMessage: {
                        id: request.message.message.queryMessage.id,
                        answer: { $case: "sendPrivateMessageAnswer", sendPrivateMessageAnswer: {} },
                    },
                },
            },
            3,
        );

        await expect(sent).resolves.toBe("resolved");
    });

    it("keeps private events out of the script event stream and clears their history on disconnect", () => {
        const roomConnection = createJoinedConnection();
        const receivedEvents = vi.fn();
        const subscription = roomConnection.receivedEventMessageStream.subscribe(receivedEvents);

        sendServerFrame(
            {
                message: {
                    $case: "batchMessage",
                    batchMessage: {
                        event: "",
                        payload: [
                            {
                                message: {
                                    $case: "receivedEventMessage",
                                    receivedEventMessage: {
                                        name: privateMessageEventName,
                                        data: {
                                            recipientUuid: "current-user",
                                            text: "Only for Ada",
                                            sender: { uuid: "peer-ada", name: "Ada" },
                                        },
                                        senderId: 2,
                                    },
                                },
                            },
                            {
                                message: {
                                    $case: "receivedEventMessage",
                                    receivedEventMessage: {
                                        name: "map.event",
                                        data: { message: "public script event" },
                                        senderId: 3,
                                    },
                                },
                            },
                        ],
                    },
                },
            },
            3,
        );

        expect(get(privateMessageHistoryStore)).toMatchObject([
            { peerUuid: "peer-ada", peerName: "Ada", text: "Only for Ada", incoming: true },
        ]);
        expect(get(privateMessageNotificationStore)?.peerName).toBe("Ada");
        expect(receivedEvents).toHaveBeenCalledTimes(1);
        expect(receivedEvents).toHaveBeenCalledWith({
            name: "map.event",
            data: { message: "public script event" },
            senderId: 3,
        });

        socketEvents?.dispatchEvent(new CloseEvent("close", { code: 1008, reason: "test", wasClean: true }));
        expect(get(privateMessageHistoryStore)).toEqual([]);
        expect(get(privateMessageNotificationStore)).toBeUndefined();
        subscription.unsubscribe();
    });
});
