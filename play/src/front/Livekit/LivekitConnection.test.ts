import { Subject } from "rxjs";
import { get, writable } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildJamSpaceName } from "@workadventure/map-editor";
import type { SpaceInterface } from "../Space/SpaceInterface";
import type { StreamableSubjects } from "../Space/SpacePeerManager/SpacePeerManager";
import { CommunicationMessageType } from "../Space/SpacePeerManager/CommunicationMessageType";
import { getJamMusicPublisher } from "../ListeningZone/JamMusicStore";
import { LivekitConnection } from "./LivekitConnection";

const { rooms, FakeRoom } = vi.hoisted(() => {
    const rooms: InstanceType<typeof FakeRoom>[] = [];
    class FakeRoom {
        prepareConnection = vi.fn().mockResolvedValue(undefined);
        joinRoom = vi.fn().mockResolvedValue(undefined);
        publishJamMusic = vi.fn().mockResolvedValue(undefined);
        dispatchStream = vi.fn().mockResolvedValue(undefined);
        destroy = vi.fn();
        constructor() {
            rooms.push(this);
        }
    }
    return { rooms, FakeRoom };
});

vi.mock("./LiveKitRoom", () => ({ LiveKitRoom: FakeRoom }));
vi.mock("../Stores/MediaStore", async () => {
    const { writable } = await import("svelte/store");
    return { streamingMegaphoneStore: writable(false) };
});

const JAM_SPACE = `jam:${buildJamSpaceName({ roomUrl: "http://room", areaId: "a", propertyId: "p", hostUuid: "host" }).slice(4)}`;

describe("LivekitConnection", () => {
    let invitation: Subject<unknown>;
    let disconnect: Subject<unknown>;

    beforeEach(() => {
        rooms.length = 0;
        invitation = new Subject();
        disconnect = new Subject();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function createConnection(spaceName: string, megaphone = writable(false)) {
        const space = {
            getName: () => spaceName,
            observePrivateEvent: (type: CommunicationMessageType) =>
                type === CommunicationMessageType.LIVEKIT_INVITATION_MESSAGE ? invitation : disconnect,
        } as unknown as SpaceInterface;
        const connection = new LivekitConnection(
            space,
            {} as StreamableSubjects,
            writable(new Set<string>()),
            writable(undefined),
            megaphone,
        );
        return { connection, megaphone };
    }

    function invite() {
        invitation.next({ livekitInvitationMessage: { serverUrl: "wss://livekit.local", token: "token" } });
    }

    it("flags the megaphone while an ordinary space streams, as before", () => {
        const { megaphone } = createConnection("world.bubble");

        invite();

        expect(get(megaphone)).toBe(true);
    });

    it("leaves the megaphone alone in the space of a Jam", () => {
        const { megaphone } = createConnection(JAM_SPACE);

        invite();

        expect(get(megaphone)).toBe(false);
    });

    it("makes the Jam publisher reachable by space name and takes it away on destroy", () => {
        const { connection } = createConnection(JAM_SPACE);
        expect(getJamMusicPublisher(JAM_SPACE)).toBeDefined();

        connection.destroy();

        expect(getJamMusicPublisher(JAM_SPACE)).toBeUndefined();
    });

    it("offers no music publisher for an ordinary space", () => {
        createConnection("world.bubble");

        expect(getJamMusicPublisher("world.bubble")).toBeUndefined();
    });

    it("publishes the music to the room, and again to the room that replaces it", async () => {
        const { connection } = createConnection(JAM_SPACE);
        const stream = {} as MediaStream;
        invite();
        await vi.waitFor(() => expect(rooms[0].joinRoom).toHaveBeenCalled());

        await connection.publishJamMusic(stream);
        expect(rooms[0].publishJamMusic).toHaveBeenCalledWith(stream);

        invite();
        await vi.waitFor(() => expect(rooms[1]?.publishJamMusic).toHaveBeenCalledWith(stream));
    });

    it("keeps the music for the room that comes after, when it is shared before the invitation", async () => {
        const { connection } = createConnection(JAM_SPACE);
        const stream = {} as MediaStream;

        await connection.publishJamMusic(stream);
        invite();

        await vi.waitFor(() => expect(rooms[0].publishJamMusic).toHaveBeenCalledWith(stream));
    });

    it("stops remembering the music once it is stopped", async () => {
        const { connection } = createConnection(JAM_SPACE);

        await connection.publishJamMusic({} as MediaStream);
        await connection.publishJamMusic(undefined);
        invite();
        await vi.waitFor(() => expect(rooms[0].joinRoom).toHaveBeenCalled());

        expect(rooms[0].publishJamMusic).not.toHaveBeenCalledWith(expect.anything());
    });
});
