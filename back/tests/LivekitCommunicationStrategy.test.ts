import { describe, expect, it, vi } from "vitest";
import { FilterType, SpaceUser } from "@workadventure/messages";
import { emptySpaceState } from "@workadventure/shared-utils";
import { LivekitCommunicationStrategy } from "../src/Model/Strategies/LivekitCommunicationStrategy";
import type { ICommunicationSpace } from "../src/Model/Interfaces/ICommunicationSpace";
import type { JamSpaceAccess } from "../src/Model/AreaPropertyEvents/JamSpaceAccess";

function createUser(spaceUserId: string): SpaceUser {
    return SpaceUser.fromPartial({
        spaceUserId,
        uuid: `uuid-${spaceUserId}`,
        name: spaceUserId,
    });
}

describe("LivekitCommunicationStrategy", () => {
    it("stops recording through the server path when the last streaming user leaves", async () => {
        const dispatchPrivateEvent = vi.fn();
        const stopRecordingByServer = vi.fn().mockResolvedValue(undefined);

        const space: ICommunicationSpace = {
            getAllUsers: () => [],
            getUsersInFilter: () => [],
            getUsersToNotify: () => [],
            getRecordingState: () => ({ isRecording: true, recorder: "recorder-1", status: "recording" }),
            dispatchPrivateEvent,
            dispatchPublicEvent: vi.fn(),
            getSpaceName: () => "test-space",
            getPropertiesToSync: () => [],
            updateState: vi.fn(),
            stopRecordingByServer,
            getUser: vi.fn(),
            world: "world",
            getState: () => emptySpaceState(),
            filterType: FilterType.ALL_USERS,
        };

        const livekitService = {
            deleteRoom: vi.fn().mockResolvedValue(undefined),
        };

        const strategy = new LivekitCommunicationStrategy(space, livekitService as never);
        const streamer = createUser("streamer-1");
        const receiver = createUser("listener-1");

        (
            strategy as unknown as {
                streamingUsers: Map<string, SpaceUser>;
                receivingUsers: Map<string, SpaceUser>;
            }
        ).streamingUsers.set(streamer.spaceUserId, streamer);
        (
            strategy as unknown as {
                streamingUsers: Map<string, SpaceUser>;
                receivingUsers: Map<string, SpaceUser>;
            }
        ).receivingUsers.set(receiver.spaceUserId, receiver);

        strategy.deleteUser(streamer);

        await vi.waitFor(() => {
            expect(stopRecordingByServer).toHaveBeenCalled();
            expect(livekitService.deleteRoom).toHaveBeenCalledWith("test-space");
        });
    });

    it("keeps recording running while another streaming user remains", async () => {
        const space: ICommunicationSpace = {
            getAllUsers: () => [],
            getUsersInFilter: () => [],
            getUsersToNotify: () => [],
            getRecordingState: () => ({ isRecording: true, recorder: "recorder-1", status: "recording" }),
            dispatchPrivateEvent: vi.fn(),
            dispatchPublicEvent: vi.fn(),
            getSpaceName: () => "test-space",
            getPropertiesToSync: () => [],
            updateState: vi.fn(),
            stopRecordingByServer: vi.fn().mockResolvedValue(undefined),
            getUser: vi.fn(),
            world: "world",
            getState: () => emptySpaceState(),
            filterType: FilterType.ALL_USERS,
        };

        const livekitService = {
            deleteRoom: vi.fn().mockResolvedValue(undefined),
        };

        const strategy = new LivekitCommunicationStrategy(space, livekitService as never);
        const firstStreamer = createUser("streamer-1");
        const secondStreamer = createUser("streamer-2");

        (
            strategy as unknown as {
                streamingUsers: Map<string, SpaceUser>;
            }
        ).streamingUsers.set(firstStreamer.spaceUserId, firstStreamer);
        (
            strategy as unknown as {
                streamingUsers: Map<string, SpaceUser>;
            }
        ).streamingUsers.set(secondStreamer.spaceUserId, secondStreamer);

        strategy.deleteUser(firstStreamer);

        await vi.waitFor(() => {
            expect(
                (
                    strategy as unknown as {
                        streamingUsers: Map<string, SpaceUser>;
                    }
                ).streamingUsers.has(secondStreamer.spaceUserId),
            ).toBe(true);
        });

        expect(space.stopRecordingByServer).not.toHaveBeenCalled();
        expect(livekitService.deleteRoom).not.toHaveBeenCalled();
    });
});

describe("LivekitCommunicationStrategy invitations", () => {
    function createInvitationStrategy(access: JamSpaceAccess) {
        const user = createUser("user-1");
        const dispatchPrivateEvent = vi.fn();
        const space = {
            getSpaceName: () => "world.jam-space",
            getUser: () => user,
            dispatchPrivateEvent,
        } as unknown as ICommunicationSpace;
        const livekitService = {
            generateToken: vi.fn().mockResolvedValue("token"),
            getLivekitFrontendUrl: () => "wss://livekit.local",
        };
        const resolveJamAccess = vi.fn().mockResolvedValue(access);
        const strategy = new LivekitCommunicationStrategy(space, livekitService as never, resolveJamAccess);
        return { strategy, user, dispatchPrivateEvent, livekitService, resolveJamAccess };
    }

    async function invite(strategy: LivekitCommunicationStrategy, user: SpaceUser) {
        strategy.handleMeetingConnectionRestartMessage({}, user.spaceUserId);
        await vi.waitFor(() => undefined);
    }

    it("signs an ordinary space exactly as before", async () => {
        const { strategy, user, dispatchPrivateEvent, livekitService } = createInvitationStrategy({
            kind: "not-a-jam",
        });

        await invite(strategy, user);

        await vi.waitFor(() => expect(dispatchPrivateEvent).toHaveBeenCalledTimes(1));
        expect(livekitService.generateToken).toHaveBeenCalledWith("world.jam-space", user);
    });

    it("signs the host of a Jam with the music right", async () => {
        const { strategy, user, livekitService } = createInvitationStrategy({ kind: "jam", canPublishMusic: true });

        await invite(strategy, user);

        await vi.waitFor(() =>
            expect(livekitService.generateToken).toHaveBeenCalledWith("world.jam-space", user, {
                canPublishMusic: true,
            }),
        );
    });

    it("signs a guest of a Jam without the music right", async () => {
        const { strategy, user, livekitService } = createInvitationStrategy({ kind: "jam", canPublishMusic: false });

        await invite(strategy, user);

        await vi.waitFor(() =>
            expect(livekitService.generateToken).toHaveBeenCalledWith("world.jam-space", user, {
                canPublishMusic: false,
            }),
        );
    });

    it("sends no token to a user the Jam refuses", async () => {
        const { strategy, user, dispatchPrivateEvent, livekitService, resolveJamAccess } = createInvitationStrategy({
            kind: "refused",
        });

        await invite(strategy, user);

        await vi.waitFor(() => expect(resolveJamAccess).toHaveBeenCalled());
        expect(livekitService.generateToken).not.toHaveBeenCalled();
        expect(dispatchPrivateEvent).not.toHaveBeenCalled();
    });
});
