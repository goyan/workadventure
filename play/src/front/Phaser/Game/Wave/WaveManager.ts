import type { Subscription } from "rxjs";
import { get } from "svelte/store";
import { AvailabilityStatus } from "@workadventure/messages";
import { LL } from "../../../../i18n/i18n-svelte";
import { openPrivateMessage } from "../../../Components/PrivateMessage/openPrivateMessage";
import { localUserStore } from "../../../Connection/LocalUserStore";
import { notifySystem } from "../../../Notification/SystemNotifier";
import { playersStore } from "../../../Stores/PlayersStore";
import { waveCardsStore } from "../../../Stores/WaveStore";
import type { GameScene } from "../GameScene";
import { decodeWave, encodeWave } from "./WaveProtocol";
import { WaveState } from "./WaveState";

export const WAVE_EMOJI = "👋";
/** How long the "do not disturb" notice stays above the sender's head. */
const DND_TEXT_DURATION_MS = 5000;

/**
 * Waving at a colleague. The sender broadcasts `infogene.wave` to the room with the target's uuid; only the target's
 * browser reacts, with a card, a discreet sound and a system notification. The sender is identified by the
 * `senderId` the server sets, so it cannot be forged.
 */
export class WaveManager {
    private readonly state = new WaveState();
    /** Empty when the local user has no uuid: such a player can neither wave nor be waved at. */
    private readonly localUuid: string;
    private readonly eventSubscription: Subscription | undefined;

    constructor(private readonly scene: GameScene) {
        this.localUuid = localUserStore.getLocalUser()?.uuid ?? "";
        this.eventSubscription = scene.connection?.receivedEventMessageStream.subscribe(({ name, data, senderId }) =>
            this.onEvent(name, data, senderId),
        );
    }

    public canWave(targetUuid: string): boolean {
        return (
            this.localUuid !== "" &&
            targetUuid !== "" &&
            targetUuid !== this.localUuid &&
            this.state.canWave(targetUuid, Date.now())
        );
    }

    /** Does nothing while a wave at the same colleague is too recent. */
    public wave(targetUuid: string, targetName: string): void {
        const connection = this.scene.connection;
        if (!connection || !this.canWave(targetUuid)) {
            return;
        }
        const now = Date.now();
        this.state.recordSent(targetUuid, now);
        const { name, data } = encodeWave({ targetUuid, at: now });
        connection.emitScriptableEvent(name, data, undefined).catch((error) => {
            console.warn("Could not send a wave event", error);
        });
        // The server does not echo an emote to its sender: played locally, like the emote menu does.
        this.scene.CurrentPlayer.playEmote(WAVE_EMOJI);
        connection.emitEmoteEvent(WAVE_EMOJI);

        if (this.statusOf(targetUuid) === AvailabilityStatus.DO_NOT_DISTURB) {
            const id = `wave-dnd-${targetUuid}`;
            this.scene.CurrentPlayer.playText(
                id,
                get(LL).wave.doNotDisturb({ name: escapeMarkdown(targetName) }),
                DND_TEXT_DURATION_MS,
                () => this.scene.CurrentPlayer.destroyText(id),
                true,
                "message",
            );
        }
    }

    /** Walks the local avatar to the sender. */
    public goTo(senderUuid: string): void {
        if (senderUuid !== "") {
            this.scene.connection?.emitAskPosition(senderUuid, this.scene.roomUrl);
        }
        this.dismiss(senderUuid);
    }

    /** Opens the private message to the sender. */
    public reply(senderUuid: string): void {
        const card = this.state.cards().find((candidate) => candidate.senderUuid === senderUuid);
        if (senderUuid !== "") {
            openPrivateMessage(senderUuid, card?.senderName ?? "");
        }
        this.dismiss(senderUuid);
    }

    public dismiss(senderUuid: string): void {
        this.state.dismiss(senderUuid);
        this.publish();
    }

    public destroy(): void {
        this.eventSubscription?.unsubscribe();
        waveCardsStore.set([]);
    }

    private onEvent(name: string, data: unknown, senderId: number | undefined): void {
        const message = decodeWave(name, data);
        if (!message || this.localUuid === "" || message.targetUuid !== this.localUuid) {
            return;
        }
        const connection = this.scene.connection;
        // The echo of our own wave.
        if (senderId === undefined || !connection || senderId === connection.getUserId()) {
            return;
        }
        const sender = this.resolveSender(senderId);
        if (sender.uuid === this.localUuid) {
            return;
        }
        const senderName = sender.name || get(LL).wave.someone();
        const now = Date.now();
        const alert = this.state.shouldAlert(sender.uuid, now);
        this.state.receive(sender.uuid, senderName, now);
        this.publish();
        // A burst of waves from the same colleague only updates the card: no sound, no system notification.
        if (!alert) {
            return;
        }
        // Through GameScene.playSound: muted when the local status forbids notification sounds ("do not disturb").
        this.scene.playBubbleInSound();
        notifySystem({
            kind: "wave",
            title: get(LL).wave.received({ name: senderName }),
            body: "",
            tag: `wave:${sender.uuid}`,
            // The card is already in the page: bringing the tab to the front is enough.
            onClick: () => {},
        });
    }

    /**
     * The players near the local one first (sprites, then the players store), then the world space, which knows
     * every connected user, even far away on the map. The uuid is empty when nobody knows the sender.
     */
    private resolveSender(senderId: number): { uuid: string; name: string } {
        const remotePlayer = this.scene.MapPlayersByKey.get(senderId);
        if (remotePlayer) {
            return { uuid: remotePlayer.userUuid, name: remotePlayer.playerName };
        }
        const player = playersStore.getPlayerById(senderId);
        if (player?.userUuid) {
            return { uuid: player.userUuid, name: player.name };
        }
        const spaceUser = this.scene.worldSpace?.getSpaceUserBySpaceUserId(this.spaceUserIdOf(senderId));
        if (spaceUser) {
            return { uuid: spaceUser.uuid, name: spaceUser.name };
        }
        return { uuid: "", name: "" };
    }

    /** A space user id is `<room url>_<user id>`: the sender is in the same room as the local player. */
    private spaceUserIdOf(senderId: number): string {
        const localSpaceUserId = this.scene.connection?.getSpaceUserId() ?? "";
        return `${localSpaceUserId.slice(0, localSpaceUserId.lastIndexOf("_"))}_${senderId}`;
    }

    /** The live status of the world space first: the players store keeps the status a player joined with. */
    private statusOf(uuid: string): AvailabilityStatus | undefined {
        const spaceUser = this.scene.worldSpace?.getSpaceUserByUuid(uuid);
        if (spaceUser) {
            return get(spaceUser.reactiveUser.availabilityStatus);
        }
        return playersStore.getPlayerByUuid(uuid)?.availabilityStatus;
    }

    private publish(): void {
        waveCardsStore.set(this.state.cards());
    }
}

/** The bubble texts are Markdown: a name is shown literally, never as emphasis, a link or HTML. */
function escapeMarkdown(text: string): string {
    return text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, "\\$&");
}
