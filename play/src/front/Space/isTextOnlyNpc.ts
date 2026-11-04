import type { SpaceUser } from "@workadventure/messages";

/**
 * NPCs advertise their audio capability through microphoneState when joining a space.
 * Muted humans still need a peer to receive media.
 */
export function isTextOnlyNpc(
    user: Pick<SpaceUser, "uuid" | "microphoneState" | "cameraState" | "screenSharingState">,
): boolean {
    return user.uuid.startsWith("npc:") && !user.microphoneState && !user.cameraState && !user.screenSharingState;
}
