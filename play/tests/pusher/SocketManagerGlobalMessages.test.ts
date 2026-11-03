import { afterEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import type { AdminRoomMessage } from "@workadventure/messages";

vi.mock("../../src/pusher/enums/EnvironmentVariable", () => import("./mocks/pusherEnvironmentVariableMock"));

const forwarded = vi.hoisted(() => ({
    rooms: [] as string[],
    messages: [] as AdminRoomMessage[],
}));
vi.mock("../../src/pusher/services/ApiClientRepository", () => ({
    apiClientRepository: {
        getClient: (roomUrl: string) => {
            forwarded.rooms.push(roomUrl);
            return Promise.resolve({
                sendAdminMessageToRoom: (message: AdminRoomMessage, callback: () => void) => {
                    forwarded.messages.push(message);
                    callback();
                },
            });
        },
    },
}));
const sameWorld = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("../../src/pusher/services/AdminService", () => ({
    adminService: { getUrlRoomsFromSameWorld: sameWorld },
}));

import { SocketManager } from "../../src/pusher/services/SocketManager";
import type { PusherWebSocket } from "../../src/pusher/services/PusherWebSocket";

const ROOM = "https://play.test/@/org/world/room";

function sender(userUuid: string, tags: string[]): PusherWebSocket {
    return mock<PusherWebSocket>({
        getUserData: () => mock<ReturnType<PusherWebSocket["getUserData"]>>({ userUuid, tags, roomId: ROOM }),
    });
}

describe("SocketManager global messages", () => {
    afterEach(() => {
        forwarded.rooms = [];
        forwarded.messages = [];
        vi.clearAllMocks();
    });

    it.each(["message", "audio"])("forwards an authorised NPC %s to its whole room", async (type) => {
        const content = type === "message" ? '{"ops":[{"insert":"Annonce\\n"}]}' : "/download-audio-message/file";

        await new SocketManager().emitPlayGlobalMessage(sender("npc:ada", ["npc-global-message"]), {
            type,
            content,
            broadcastToWorld: false,
        });

        expect(forwarded.rooms).toEqual([ROOM]);
        expect(forwarded.messages).toEqual([{ roomId: ROOM, type, message: content }]);
        expect(sameWorld).not.toHaveBeenCalled();
    });

    it.each([
        { userUuid: "npc:ada", tags: [], broadcastToWorld: false, type: "message" },
        { userUuid: "human", tags: ["npc-global-message"], broadcastToWorld: false, type: "message" },
        { userUuid: "npc:ada", tags: ["npc-global-message"], broadcastToWorld: true, type: "message" },
        { userUuid: "npc:ada", tags: ["npc-global-message"], broadcastToWorld: false, type: "ban" },
    ])("rejects unauthorised or wider NPC broadcasts: $userUuid/$type/$broadcastToWorld", async (data) => {
        await expect(
            new SocketManager().emitPlayGlobalMessage(sender(data.userUuid, data.tags), {
                type: data.type,
                content: "Annonce",
                broadcastToWorld: data.broadcastToWorld,
            }),
        ).rejects.toThrow();
        expect(forwarded.messages).toEqual([]);
        expect(sameWorld).not.toHaveBeenCalled();
    });

    it("preserves the existing admin room broadcast", async () => {
        await new SocketManager().emitPlayGlobalMessage(sender("human-admin", ["admin"]), {
            type: "message",
            content: "Announcement",
            broadcastToWorld: false,
        });
        expect(forwarded.messages).toEqual([{ roomId: ROOM, type: "message", message: "Announcement" }]);
    });

    it("preserves the admin world lookup and its empty result", async () => {
        await new SocketManager().emitPlayGlobalMessage(sender("human-admin", ["admin"]), {
            type: "audio",
            content: "/download-audio-message/file",
            broadcastToWorld: true,
        });
        expect(sameWorld).toHaveBeenCalledWith(ROOM, "en", [], true);
        expect(forwarded.messages).toEqual([]);
    });
});
