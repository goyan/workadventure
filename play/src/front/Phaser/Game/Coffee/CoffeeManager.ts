import type { Subscription } from "rxjs";
import { get } from "svelte/store";
import { LL } from "../../../../i18n/i18n-svelte";
import { localUserStore } from "../../../Connection/LocalUserStore";
import { isLocalDoNotDisturb } from "../../../Notification/SystemNotifier";
import { coffeeCardsStore } from "../../../Stores/CoffeeStore";
import { AvatarAction } from "../../Entity/AvatarAction";
import type { GameScene } from "../GameScene";
import { resolveRoomSender, resolveRoomSenderSoon } from "../RoomSender";
import { decodeCoffee, encodeCoffee } from "./CoffeeProtocol";
import { CoffeeState } from "./CoffeeState";

/** How often expired cards are swept (their lifetime is ten minutes: a minute late is fine). */
const SWEEP_INTERVAL_MS = 60_000;
/** How long a sender unknown on reception (just joined the room) is waited for. */
const SENDER_WAIT_MS = 5_000;

/**
 * "Je prends un café": when the local player takes a coffee, the room receives `infogene.coffee` start, then end when
 * the coffee stops (move, other action, scene closed). Colleagues see a discreet card with "Join" until the end, or
 * at most ten minutes. No sound, no system notification, nothing recorded; nothing shown in "do not disturb".
 */
export class CoffeeManager {
    private readonly state = new CoffeeState();
    private readonly localUuid: string;
    private readonly eventSubscription: Subscription | undefined;
    private readonly sweepTimer: ReturnType<typeof setInterval>;
    /** True between an announced start and its end: a private coffee (within the cooldown) announces nothing. */
    private announced = false;
    /** A sender waited for may arrive after the scene closed: nothing is published then. */
    private destroyed = false;

    constructor(private readonly scene: GameScene) {
        this.localUuid = localUserStore.getLocalUser()?.uuid ?? "";
        this.eventSubscription = scene.connection?.receivedEventMessageStream.subscribe(({ name, data, senderId }) =>
            this.onEvent(name, data, senderId),
        );
        this.sweepTimer = setInterval(() => this.publish(), SWEEP_INTERVAL_MS);
    }

    /** Called by the local Player each time its avatar action changes. */
    public onLocalAction(action: AvatarAction): void {
        if (action === AvatarAction.Coffee) {
            const now = Date.now();
            if (!this.announced && this.state.canInvite(now)) {
                this.state.recordInvite(now);
                this.announced = this.send("start");
            }
            return;
        }
        this.endAnnounced();
    }

    /** Walks the local avatar to the colleague. */
    public join(senderUuid: string): void {
        if (senderUuid !== "") {
            this.scene.connection?.emitAskPosition(senderUuid, this.scene.roomUrl);
        }
        this.dismiss(senderUuid);
    }

    public dismiss(senderUuid: string): void {
        this.state.dismiss(senderUuid);
        this.publish();
    }

    public destroy(): void {
        this.destroyed = true;
        this.endAnnounced();
        clearInterval(this.sweepTimer);
        this.eventSubscription?.unsubscribe();
        coffeeCardsStore.set([]);
    }

    private endAnnounced(): void {
        if (this.announced) {
            this.announced = false;
            this.send("end");
        }
    }

    private send(state: "start" | "end"): boolean {
        const connection = this.scene.connection;
        if (!connection || this.localUuid === "") {
            return false;
        }
        const { name, data } = encodeCoffee({ state, at: Date.now() });
        connection.emitScriptableEvent(name, data, undefined).catch((error) => {
            console.warn("Could not send a coffee event", error);
        });
        return true;
    }

    private onEvent(name: string, data: unknown, senderId: number | undefined): void {
        const message = decodeCoffee(name, data);
        const connection = this.scene.connection;
        // Our own echo, or no way to know who sent it.
        if (!message || senderId === undefined || !connection || senderId === connection.getUserId()) {
            return;
        }
        const sender = resolveRoomSender(this.scene, senderId);
        if (sender.uuid !== "") {
            this.apply(message.state, sender);
            return;
        }
        // Joined the room a moment ago: the world space does not know them yet.
        resolveRoomSenderSoon(this.scene, senderId, SENDER_WAIT_MS)
            .then((late) => this.apply(message.state, late))
            .catch((error) => console.warn("Could not resolve a coffee sender", error));
    }

    private apply(state: "start" | "end", sender: { uuid: string; name: string }): void {
        if (this.destroyed || sender.uuid === "" || sender.uuid === this.localUuid) {
            return;
        }
        if (state === "end") {
            this.state.receiveEnd(sender.uuid);
        } else if (!isLocalDoNotDisturb()) {
            this.state.receiveStart(sender.uuid, sender.name || get(LL).coffee.someone(), Date.now());
        }
        this.publish();
    }

    private publish(): void {
        coffeeCardsStore.set(this.state.cards(Date.now()));
    }
}
