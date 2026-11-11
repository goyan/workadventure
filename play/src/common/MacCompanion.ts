import { z } from "zod";

/**
 * Mac companion: a small program on each user's Mac reads their Exchange meetings from the macOS Calendar and uploads
 * them with a personal token created in the game. The token itself is shown once, at its creation.
 */
export const CompanionToken = z.object({
    id: z.string(),
    label: z.string(),
    createdAt: z.string(),
    lastUsedAt: z.string().nullable(),
});
export type CompanionToken = z.infer<typeof CompanionToken>;

export const CompanionTokenList = z.object({ tokens: z.array(CompanionToken) });
export type CompanionTokenList = z.infer<typeof CompanionTokenList>;

export const CompanionTokenInput = z.object({ label: z.string().trim().min(1).max(40) });
export type CompanionTokenInput = z.infer<typeof CompanionTokenInput>;

export const CreatedCompanionToken = CompanionToken.extend({ token: z.string() });
export type CreatedCompanionToken = z.infer<typeof CreatedCompanionToken>;

export const MeetingKey = z.string().regex(/^[0-9a-f]{64}$/);

/** A Teams meeting room of the map asked for one of the user's meetings: rooms are listed in the order of the map. */
export const MeetingRoomClaimInput = z.object({
    mapUrl: z.string().min(1).max(512),
    meetingKey: MeetingKey,
    roomAreaIds: z.array(z.string().min(1).max(128)).min(1).max(20),
});
export type MeetingRoomClaimInput = z.infer<typeof MeetingRoomClaimInput>;

/** `null`: every room of the map is taken by another meeting. */
export const MeetingRoomClaim = z.object({ areaId: z.string().nullable() });
export type MeetingRoomClaim = z.infer<typeof MeetingRoomClaim>;

interface SharedMeetingRoom {
    areaId: string;
    title: string;
    endsAt: string;
    mine: boolean;
    meetingKey?: string;
}

/**
 * What every player of the map sees of a taken room: never the meeting link. Only the room's guests get `mine` and
 * the meeting key, to recognize their room when they walk in.
 */
export const MeetingRoom = z
    .object({
        areaId: z.string(),
        title: z.string(),
        endsAt: z.string(),
        mine: z.boolean().default(false),
        meetingKey: MeetingKey.optional(),
    })
    // The key of a room that is not the player's never reaches them, whatever the server sends.
    .transform(
        ({ meetingKey, ...room }): SharedMeetingRoom => (room.mine && meetingKey ? { ...room, meetingKey } : room),
    );
export type MeetingRoom = z.infer<typeof MeetingRoom>;

export const MeetingRoomList = z.object({ rooms: z.array(MeetingRoom) });
export type MeetingRoomList = z.infer<typeof MeetingRoomList>;
