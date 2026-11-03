import { gameManager } from "../../Phaser/Game/GameManager";
import PrivateMessageModal from "./PrivateMessageModal.svelte";
import { modals } from "@wa-modals";

export function openPrivateMessage(userUuid: string, userName: string): void {
    const connection = gameManager.getCurrentGameScene().connection;
    modals.open(PrivateMessageModal, {
        userUuid,
        userName,
        send: async (text: string): Promise<void> => {
            if (!connection || connection.closed) throw new Error("Private message connection closed");
            await connection.emitPrivateMessage(userUuid, text);
        },
    });
}
