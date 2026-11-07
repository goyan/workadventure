import { playersStore } from "../../Stores/PlayersStore";
import type { GameScene } from "./GameScene";

/**
 * Who sent a room event, from the `senderId` the server sets. The players near the local one first (sprites, then the
 * players store), then the world space, which knows every connected user, even far away on the map. The uuid is empty
 * when nobody knows the sender.
 */
export function resolveRoomSender(scene: GameScene, senderId: number): { uuid: string; name: string } {
    const remotePlayer = scene.MapPlayersByKey.get(senderId);
    if (remotePlayer) {
        return { uuid: remotePlayer.userUuid, name: remotePlayer.playerName };
    }
    const player = playersStore.getPlayerById(senderId);
    if (player?.userUuid) {
        return { uuid: player.userUuid, name: player.name };
    }
    const spaceUser = scene.worldSpace?.getSpaceUserBySpaceUserId(spaceUserIdOf(scene, senderId));
    if (spaceUser) {
        return { uuid: spaceUser.uuid, name: spaceUser.name };
    }
    return { uuid: "", name: "" };
}

/**
 * Same as resolveRoomSender, but a sender nobody knows yet (they joined the room a moment ago, the world space has
 * not received them) is waited for, at most `timeoutMs`.
 */
export async function resolveRoomSenderSoon(
    scene: GameScene,
    senderId: number,
    timeoutMs: number,
): Promise<{ uuid: string; name: string }> {
    const known = resolveRoomSender(scene, senderId);
    if (known.uuid !== "" || !scene.worldSpace) {
        return known;
    }
    try {
        const spaceUser = await scene.worldSpace.waitForSpaceUser(spaceUserIdOf(scene, senderId), timeoutMs);
        return { uuid: spaceUser.uuid, name: spaceUser.name };
    } catch {
        return known;
    }
}

/** A space user id is `<room url>_<user id>`: the sender is in the same room as the local player. */
function spaceUserIdOf(scene: GameScene, senderId: number): string {
    const localSpaceUserId = scene.connection?.getSpaceUserId() ?? "";
    return `${localSpaceUserId.slice(0, localSpaceUserId.lastIndexOf("_"))}_${senderId}`;
}
