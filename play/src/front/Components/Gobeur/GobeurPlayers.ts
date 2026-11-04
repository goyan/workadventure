import type { GobeurPropertyData } from "@workadventure/map-editor";
import { localUserStore } from "../../Connection/LocalUserStore";
import { gameManager } from "../../Phaser/Game/GameManager";
import type { GameScene } from "../../Phaser/Game/GameScene";

export interface GobeurPlayer {
    uuid: string;
    name: string;
}

/** The players of the scene, the local one first, once per uuid (a user may have several tabs). */
export function presentGobeurPlayers(
    remotePlayers: Iterable<{ userUuid: string; playerName: string }>,
): GobeurPlayer[] {
    const players: GobeurPlayer[] = [];
    const seen = new Set<string>();
    const localUuid = localUserStore.getLocalUser()?.uuid;
    if (localUuid) {
        players.push({ uuid: localUuid, name: gameManager.getPlayerName() ?? "" });
        seen.add(localUuid);
    }
    for (const player of remotePlayers) {
        if (!seen.has(player.userUuid)) {
            players.push({ uuid: player.userUuid, name: player.playerName });
            seen.add(player.userUuid);
        }
    }
    return players;
}

/** The players once per uuid, the first occurrence kept: older stored data may hold duplicates. */
export function uniqueGobeurPlayers(players: GobeurPlayer[]): GobeurPlayer[] {
    const seen = new Set<string>();
    return players.filter((player) => {
        if (seen.has(player.uuid)) {
            return false;
        }
        seen.add(player.uuid);
        return true;
    });
}

/** The players chosen in the Gobeur property of the entity, if any. */
export function chosenGobeurPlayers(scene: GameScene, entityId: string): GobeurPlayer[] {
    const property = scene
        .getGameMapFrontWrapper()
        .getEntitiesManager()
        .getEntities()
        .get(entityId)
        ?.getProperties()
        .find((candidate): candidate is GobeurPropertyData => candidate.type === "gobeurPropertyData");
    return uniqueGobeurPlayers(property?.players ?? []);
}

/** A name to show for a uuid: from the given players, else the start of the uuid. */
export function gobeurPlayerName(uuid: string, players: GobeurPlayer[]): string {
    const name = players.find((player) => player.uuid === uuid)?.name;
    return name ? name : uuid.slice(0, 8);
}

/** "m:ss", never negative. */
export function formatGobeurRemaining(milliseconds: number): string {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
