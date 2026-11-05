/* eslint-disable @typescript-eslint/unbound-method -- expect() on vi.fn() members of module mocks */
import * as Phaser from "phaser";
globalThis.Phaser = Phaser;

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import { Subject } from "rxjs";
import { get, writable } from "svelte/store";
import type { ProximityPoll, SpaceState } from "@workadventure/shared-utils";
import { emptySpaceState } from "@workadventure/shared-utils";
import { AbortError } from "@workadventure/shared-utils/src/Abort/AbortError";
import { AvailabilityStatus, FilterType } from "@workadventure/messages";
import { loadLocaleAsync } from "../../../../../i18n/i18n-util.async";
import { setLocale } from "../../../../../i18n/i18n-svelte";
import type { PublicEventsObservables, SpaceInterface, SpaceUserExtended } from "../../../../Space/SpaceInterface";
import type { SpaceRegistryInterface } from "../../../../Space/SpaceRegistry/SpaceRegistryInterface";
import type { MessageUserJoined } from "../../../../Connection/ConnexionModels";
import { RemotePlayersRepository } from "../../../../Phaser/Game/RemotePlayersRepository";
import { iframeListener } from "../../../../Api/IframeListener";
import { ProximityChatRoom } from "../ProximityChatRoom";
import { DEFAULT_PROXIMITY_SPACE_NAME, type ProximityChatRoomKind } from "../ProximityChatRoomManager";
import { selectedRoomStore } from "../../../Stores/SelectRoomStore";
import { chatVisibilityStore } from "../../../../Stores/ChatStore";
import { navChat, shouldRestoreChatStateStore } from "../../../Stores/ChatStore";
import type { ChatConversation } from "../../ChatConnection";
import { localUserStore } from "../../../../Connection/LocalUserStore";

const { playSound } = vi.hoisted(() => ({ playSound: vi.fn() }));

vi.mock("../../../../Api/IframeListener", () => {
    // Anything the room (or a module it pulls in) calls is a spy; anything it subscribes to is a stream.
    const members = new Map<string, unknown>();
    const iframeListener = new Proxy(
        {},
        {
            get(_target, name: string) {
                if (!members.has(name)) {
                    members.set(name, name.endsWith("Stream") ? new Subject() : vi.fn());
                }
                return members.get(name);
            },
        },
    );
    return { iframeListener };
});
vi.mock("../../../../Phaser/Game/GameScene", () => ({ GameScene: class {} }));
vi.mock("../../../../Notification/NotificationManager", () => ({
    notificationManager: { createNotification: vi.fn() },
}));
vi.mock("../../../../WebRtc/FaviconManager", () => ({
    faviconManager: { pushNotificationFavicon: vi.fn(), pushOriginalFavicon: vi.fn() },
}));
vi.mock("../../../../Components/ActionBar/AvailabilityStatus/statusChanger", () => ({
    statusChanger: { setUserNameInteraction: vi.fn(), applyInteractionRules: vi.fn(), changeStatusTo: vi.fn() },
}));
vi.mock("../../../../Utils/ScreenWakeLock", () => ({
    screenWakeLock: { requestWakeLock: () => Promise.resolve(undefined) },
}));
vi.mock("../../../../Utils/BreakpointsUtils", () => ({ isMediaBreakpointUp: () => false }));
vi.mock("../../../../Phaser/Entity/CharacterLayerManager", () => ({
    CharacterLayerManager: { wokaBase64: () => Promise.resolve("") },
    wokaBase64: () => Promise.resolve(""),
}));
vi.mock("../../../../Phaser/Game/GameManager", () => ({
    gameManager: { getCurrentGameScene: () => ({ roomUrl: "room", playSound }) },
}));
vi.mock("../../../../Connection/ConnectionManager", () => ({
    connectionManager: { roomConnectionStream: new Subject() },
}));
vi.mock("../../../../WebRtc/SimplePeer", () => ({ SimplePeer: vi.fn() }));
vi.mock("../../../../WebRtc/MediaManager", () => ({ MediaManager: vi.fn(), mediaManager: {} }));
vi.mock(
    "../../../../Enum/EnvironmentVariable.ts",
    () => import("../../../../../../tests/front/mocks/frontEnvironmentVariableMock"),
);

const MY_SPACE_USER_ID = "room_1";

function spaceUser(userId: number): SpaceUserExtended {
    return {
        spaceUserId: `room_${userId}`,
        name: `User ${userId}`,
        availabilityStatus: AvailabilityStatus.ONLINE,
        characterTextures: [],
        tags: [],
        uuid: `uuid-${userId}`,
        roomName: "room",
        playUri: "room",
        isLogged: false,
        color: "#000000",
        pictureStore: writable(undefined),
        reactiveUser: { availabilityStatus: writable(AvailabilityStatus.ONLINE) },
    } as unknown as SpaceUserExtended;
}

function player(userId: number): MessageUserJoined {
    return {
        userId,
        name: `User ${userId}`,
        characterTextures: [],
        position: { x: 0, y: 0, direction: 0, moving: false, running: false },
        availabilityStatus: AvailabilityStatus.ONLINE,
        visitCardUrl: null,
        companionTexture: undefined,
        userUuid: `uuid-${userId}`,
        outlineColor: undefined,
        variables: new Map(),
    };
}

function createFakeSpace(users: Map<string, SpaceUserExtended>, spaceName = "bubble") {
    const spaceMessages: NonNullable<PublicEventsObservables["spaceMessage"]> = new Subject();
    const observeUserJoined = new Subject<SpaceUserExtended>();
    const observeUserLeft = new Subject<SpaceUserExtended>();
    const stateStore = writable<SpaceState>(emptySpaceState());
    let isStateInitialized = false;
    // What the pusher does right after the join: the whole state arrives, as one patch.
    const receiveState = (state: SpaceState) => {
        isStateInitialized = true;
        stateStore.set(state);
    };
    const space = {
        getName: () => spaceName,
        destroyed: false,
        usersStore: writable(users),
        getMetadata: () => new Map(),
        state: { store: stateStore, isInitialized: () => isStateInitialized },
        observePublicEvent: (key: string) => (key === "spaceMessage" ? spaceMessages : new Subject()),
        observePrivateEvent: () => new Subject(),
        observeUserJoined,
        observeUserLeft,
        getUsers: () => Promise.resolve(users),
        emitPublicMessage: vi.fn(),
    } as unknown as SpaceInterface;
    return { space, spaceMessages, observeUserJoined, observeUserLeft, users, stateStore, receiveState };
}

function createRoom(
    space: SpaceInterface,
    repository: RemotePlayersRepository,
    kind: ProximityChatRoomKind = "default",
): ProximityChatRoom {
    const spaceRegistry = mock<SpaceRegistryInterface>({
        joinSpace: () => Promise.resolve(space),
        leaveSpace: () => Promise.resolve(),
    });
    const soundManager = {
        playBubbleInSound: vi.fn(),
        playBubbleOutSound: vi.fn(),
        playMeetingInSound: vi.fn(),
        playMeetingOutSound: vi.fn(),
    } as unknown as ConstructorParameters<typeof ProximityChatRoom>[7];
    return new ProximityChatRoom(
        kind === "default" ? DEFAULT_PROXIMITY_SPACE_NAME : space.getName(),
        "Proximity",
        kind,
        MY_SPACE_USER_ID,
        spaceRegistry,
        iframeListener,
        repository,
        soundManager,
        undefined,
        [],
    );
}

const flush = () =>
    new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
const joinedUserIds = () =>
    vi
        .mocked(iframeListener.sendJoinProximityMeetingEvent)
        .mock.calls.map(([users]) => users.map((user) => user.userId));

describe("ProximityChatRoom join events", () => {
    beforeAll(async () => {
        await loadLocaleAsync("en-US");
        setLocale("en-US");
    });

    afterEach(() => {
        selectedRoomStore.set(undefined);
        chatVisibilityStore.set(false);
        shouldRestoreChatStateStore.set(false);
        vi.clearAllMocks();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it.each(["default", "proximity"] as const)(
        "plays the existing sound for live human and NPC text in a displayed %s bubble",
        async (kind) => {
            vi.spyOn(localUserStore, "getChatSounds").mockReturnValue(true);
            const fake = createFakeSpace(new Map([1, 2].map((id) => [`room_${id}`, spaceUser(id)])));
            const repository = new RemotePlayersRepository();
            repository.addPlayer(player(2));
            const room = createRoom(fake.space, repository, kind);
            try {
                await room.joinSpace("bubble", [], false, FilterType.ALL_USERS, false);
                selectedRoomStore.set(room);
                chatVisibilityStore.set(true);
                playSound.mockClear();
                for (const sender of ["room_2", "npc_ada"]) {
                    fake.spaceMessages.next({
                        $case: "spaceMessage",
                        spaceName: "bubble",
                        sender,
                        spaceMessage: { message: "Hello", characterTextures: [], name: sender },
                    });
                }
                expect(playSound.mock.calls).toEqual([["new-message"], ["new-message"]]);
                playSound.mockClear();
                room.sendMessage("My message");
                room.sendMessage("Joined", "incoming", false);
                room.sendMessage("Left", "outcoming", false);
                fake.spaceMessages.next({
                    $case: "spaceMessage",
                    spaceName: "bubble",
                    sender: MY_SPACE_USER_ID,
                    spaceMessage: { message: "My echo", characterTextures: [] },
                });
                await room.loadMorePreviousMessages();
                get(room.messages);
                expect(playSound).not.toHaveBeenCalled();
                chatVisibilityStore.set(false);
                fake.spaceMessages.next({
                    $case: "spaceMessage",
                    spaceName: "bubble",
                    sender: "room_2",
                    spaceMessage: { message: "Hidden panel", characterTextures: [] },
                });
                expect(playSound.mock.calls).toEqual([["new-message"]]);
                playSound.mockClear();
            } finally {
                room.destroy();
            }
            fake.spaceMessages.next({
                $case: "spaceMessage",
                spaceName: "bubble",
                sender: "room_2",
                spaceMessage: { message: "After leaving", characterTextures: [] },
            });
            expect(playSound).not.toHaveBeenCalled();
        },
    );

    it.each([
        { kind: "default", sounds: false, muted: false },
        { kind: "default", sounds: true, muted: true },
        ...(["meeting", "speaker", "listener", "area"] as const).map((kind) => ({
            kind,
            sounds: true,
            muted: false,
        })),
    ] as const)(
        "keeps displayed messages silent for $kind, sounds=$sounds, muted=$muted",
        async ({ kind, sounds, muted }) => {
            vi.spyOn(localUserStore, "getChatSounds").mockReturnValue(sounds);
            const fake = createFakeSpace(new Map([1, 2].map((id) => [`room_${id}`, spaceUser(id)])));
            const repository = new RemotePlayersRepository();
            repository.addPlayer(player(2));
            const room = createRoom(fake.space, repository, kind);
            try {
                await room.joinSpace("bubble", [], false, FilterType.ALL_USERS, false);
                selectedRoomStore.set(room);
                chatVisibilityStore.set(true);
                room.areNotificationsMuted.set(muted);
                playSound.mockClear();
                fake.spaceMessages.next({
                    $case: "spaceMessage",
                    spaceName: "bubble",
                    sender: "room_2",
                    spaceMessage: { message: "Hello", characterTextures: [] },
                });
                expect(playSound).not.toHaveBeenCalled();
            } finally {
                room.destroy();
            }
        },
    );

    it("switches an open bubble chat to the meeting and sends to that meeting space", async () => {
        const users = new Map([1, 2].map((id) => [`room_${id}`, spaceUser(id)]));
        const repository = new RemotePlayersRepository();
        repository.addPlayer(player(2));
        const bubble = createRoom(createFakeSpace(users).space, repository);
        await bubble.joinSpace("bubble", [], false, FilterType.ALL_USERS, false);
        chatVisibilityStore.set(true);
        navChat.switchToChat();
        const meetingSpace = createFakeSpace(users, "meeting").space;
        const meeting = createRoom(meetingSpace, repository, "meeting");

        await meeting.joinSpace("meeting", [], true, FilterType.ALL_USERS, false);

        expect(get(selectedRoomStore)?.id).toBe(meeting.id);
        get(selectedRoomStore)?.sendMessage("Message dans la réunion");
        expect(meetingSpace.emitPublicMessage).toHaveBeenCalledWith({
            $case: "spaceMessage",
            spaceMessage: expect.objectContaining({ message: "Message dans la réunion" }),
        });
        // The server can remove the old bubble after the meeting has joined.
        await bubble.leaveSpace("bubble");
        expect(get(selectedRoomStore)?.id).toBe(meeting.id);
        expect(get(chatVisibilityStore)).toBe(true);
    });

    it("switches an open meeting chat to the newly joined bubble", async () => {
        const users = new Map([1, 2].map((id) => [`room_${id}`, spaceUser(id)]));
        const repository = new RemotePlayersRepository();
        repository.addPlayer(player(2));
        const meeting = createRoom(createFakeSpace(users, "meeting").space, repository, "meeting");
        await meeting.joinSpace("meeting", [], true, FilterType.ALL_USERS, false);
        chatVisibilityStore.set(true);
        navChat.switchToChat();
        const bubbleSpace = createFakeSpace(users).space;
        const bubble = createRoom(bubbleSpace, repository);

        await bubble.joinSpace("bubble", [], false, FilterType.ALL_USERS, false);

        expect(get(selectedRoomStore)?.id).toBe(bubble.id);
        get(selectedRoomStore)?.sendMessage("Message dehors");
        expect(bubbleSpace.emitPublicMessage).toHaveBeenCalledWith({
            $case: "spaceMessage",
            spaceMessage: expect.objectContaining({ message: "Message dehors" }),
        });
        await meeting.leaveSpace("meeting", true);
        expect(get(selectedRoomStore)?.id).toBe(bubble.id);
        expect(get(chatVisibilityStore)).toBe(true);
    });

    it("keeps an open private conversation selected while joining a meeting", async () => {
        const users = new Map([1, 2].map((id) => [`room_${id}`, spaceUser(id)]));
        const repository = new RemotePlayersRepository();
        repository.addPlayer(player(2));
        const privateRoom = mock<ChatConversation>({
            id: "private-conversation",
            conversationKind: "room",
            isEncrypted: writable(false),
            ensureTimelineInitialized: () => Promise.resolve(),
        });
        selectedRoomStore.set(privateRoom);
        chatVisibilityStore.set(true);
        navChat.switchToChat();
        const meeting = createRoom(createFakeSpace(users, "meeting").space, repository, "meeting");

        await meeting.joinSpace("meeting", [], true, FilterType.ALL_USERS, false);

        expect(get(selectedRoomStore)).toBe(privateRoom);
        expect(get(chatVisibilityStore)).toBe(true);
    });

    it("does not select a meeting whose admission is aborted while waiting for participant data", async () => {
        const users = new Map([1, 2].map((id) => [`room_${id}`, spaceUser(id)]));
        const repository = new RemotePlayersRepository();
        repository.addPlayer(player(2));
        const bubble = createRoom(createFakeSpace(users).space, repository);
        await bubble.joinSpace("bubble", [], false, FilterType.ALL_USERS, false);
        chatVisibilityStore.set(true);
        navChat.switchToChat();
        const meetingRepository = new RemotePlayersRepository();
        const meeting = createRoom(createFakeSpace(users, "meeting").space, meetingRepository, "meeting");
        const controller = new AbortController();
        const joining = meeting.joinSpace("meeting", [], true, FilterType.ALL_USERS, false, controller.signal);
        await flush();

        controller.abort();
        meetingRepository.addPlayer(player(2));

        await expect(joining).rejects.toThrow(AbortError);
        expect(get(selectedRoomStore)?.id).toBe(bubble.id);
        expect(get(chatVisibilityStore)).toBe(true);
    });

    it("keeps the chat open when the old bubble leaves before the meeting admission completes", async () => {
        const users = new Map([1, 2].map((id) => [`room_${id}`, spaceUser(id)]));
        const repository = new RemotePlayersRepository();
        repository.addPlayer(player(2));
        const bubble = createRoom(createFakeSpace(users).space, repository);
        await bubble.joinSpace("bubble", [], false, FilterType.ALL_USERS, false);
        chatVisibilityStore.set(true);
        navChat.switchToChat();
        const meetingRepository = new RemotePlayersRepository();
        const meeting = createRoom(createFakeSpace(users, "meeting").space, meetingRepository, "meeting");
        const joining = meeting.joinSpace("meeting", [], true, FilterType.ALL_USERS, false);
        await flush();

        await bubble.leaveSpace("bubble");
        meetingRepository.addPlayer(player(2));
        await joining;

        expect(get(selectedRoomStore)?.id).toBe(meeting.id);
        expect(get(chatVisibilityStore)).toBe(true);
    });

    it("preserves a private conversation opened while the meeting admission is pending", async () => {
        const users = new Map([1, 2].map((id) => [`room_${id}`, spaceUser(id)]));
        const repository = new RemotePlayersRepository();
        repository.addPlayer(player(2));
        const bubble = createRoom(createFakeSpace(users).space, repository);
        await bubble.joinSpace("bubble", [], false, FilterType.ALL_USERS, false);
        chatVisibilityStore.set(true);
        navChat.switchToChat();
        const meetingRepository = new RemotePlayersRepository();
        const meeting = createRoom(createFakeSpace(users, "meeting").space, meetingRepository, "meeting");
        const joining = meeting.joinSpace("meeting", [], true, FilterType.ALL_USERS, false);
        await flush();
        const privateRoom = mock<ChatConversation>({
            id: "private-conversation",
            conversationKind: "room",
            isEncrypted: writable(false),
            ensureTimelineInitialized: () => Promise.resolve(),
        });

        selectedRoomStore.set(privateRoom);
        meetingRepository.addPlayer(player(2));
        await joining;

        expect(get(selectedRoomStore)).toBe(privateRoom);
        expect(get(chatVisibilityStore)).toBe(true);
    });

    it("waits for the zone data of users already in the space and announces them all in one go", async () => {
        const users = new Map([1, 2, 3].map((id) => [`room_${id}`, spaceUser(id)]));
        const { space, observeUserJoined, observeUserLeft } = createFakeSpace(users);
        const repository = new RemotePlayersRepository();
        const room = createRoom(space, repository);

        const joinPromise = room.joinSpace("bubble", [], false, FilterType.ALL_USERS, false);
        await flush();
        // The peers are in the space but their userJoinedMessage has not reached us yet: nothing announced.
        expect(iframeListener.sendJoinProximityMeetingEvent).not.toHaveBeenCalled();

        repository.addPlayer(player(2));
        repository.addPlayer(player(3));
        await joinPromise;

        expect(joinedUserIds()).toEqual([[2, 3]]);
        expect(iframeListener.sendJoinMeetingEvent).toHaveBeenCalledTimes(1);
        expect(iframeListener.sendParticipantJoinProximityMeetingEvent).not.toHaveBeenCalled();

        // A later peer is a participant joining, not a new meeting.
        repository.addPlayer(player(4));
        users.set("room_4", spaceUser(4));
        observeUserJoined.next(spaceUser(4));
        await flush();
        expect(iframeListener.sendParticipantJoinProximityMeetingEvent).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 4 }),
        );
        expect(iframeListener.sendJoinProximityMeetingEvent).toHaveBeenCalledTimes(1);

        // A participant who leaves is announced leaving, and announced again when coming back.
        users.delete("room_4");
        observeUserLeft.next(spaceUser(4));
        expect(iframeListener.sendParticipantLeaveProximityMeetingEvent).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 4 }),
        );
        users.set("room_4", spaceUser(4));
        observeUserJoined.next(spaceUser(4));
        await flush();
        expect(iframeListener.sendParticipantJoinProximityMeetingEvent).toHaveBeenCalledTimes(2);
    });

    it("does not announce an empty bubble: the first peer to show up triggers the join event", async () => {
        vi.useFakeTimers();
        const users = new Map([["room_1", spaceUser(1)]]);
        const { space, observeUserJoined } = createFakeSpace(users);
        const repository = new RemotePlayersRepository();
        const room = createRoom(space, repository);

        const joinPromise = room.joinSpace("bubble", [], false, FilterType.ALL_USERS, false);
        // getFirstUsers backstop: nobody registered in the space.
        await vi.advanceTimersByTimeAsync(9_000);
        await joinPromise;
        expect(iframeListener.sendJoinProximityMeetingEvent).not.toHaveBeenCalled();
        expect(iframeListener.sendJoinMeetingEvent).not.toHaveBeenCalled();

        users.set("room_2", spaceUser(2));
        observeUserJoined.next(spaceUser(2));
        repository.addPlayer(player(2));
        await vi.advanceTimersByTimeAsync(0);
        expect(joinedUserIds()).toEqual([[2]]);
        expect(iframeListener.sendJoinMeetingEvent).toHaveBeenCalledTimes(1);
        expect(iframeListener.sendParticipantJoinProximityMeetingEvent).not.toHaveBeenCalled();

        repository.addPlayer(player(3));
        users.set("room_3", spaceUser(3));
        observeUserJoined.next(spaceUser(3));
        await vi.advanceTimersByTimeAsync(0);
        expect(iframeListener.sendParticipantJoinProximityMeetingEvent).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 3 }),
        );
        expect(iframeListener.sendJoinProximityMeetingEvent).toHaveBeenCalledTimes(1);
    });

    it("does not notify the polls already there when the state arrives after joining, only the new ones", async () => {
        const users = new Map([1, 2].map((id) => [`room_${id}`, spaceUser(id)]));
        const { space, stateStore, receiveState } = createFakeSpace(users);
        const repository = new RemotePlayersRepository();
        repository.addPlayer(player(2));
        const room = createRoom(space, repository);
        await room.joinSpace("bubble", [], false, FilterType.ALL_USERS, false);
        // Joining selects the room; the user looking at another one is what makes a poll count as unread.
        selectedRoomStore.set(undefined);

        // The store was still empty when the room subscribed; then the whole state arrives, with an older poll.
        receiveState({ ...emptySpaceState(), polls: { "poll-1": poll("poll-1") } });
        expect(get(room.unreadNotificationCount)).toBe(0);

        stateStore.update((state) => ({ ...state, polls: { ...state.polls, "poll-2": poll("poll-2") } }));
        expect(get(room.unreadNotificationCount)).toBe(1);
    });
});

function poll(id: string): ProximityPoll {
    return {
        id,
        question: "Lunch?",
        kind: "open",
        answers: [
            { id: "a", text: "Pizza" },
            { id: "b", text: "Sushi" },
        ],
        maxSelections: 1,
        senderId: "uuid-2",
        senderName: "User 2",
        createdAt: 10,
        votes: {},
    };
}
