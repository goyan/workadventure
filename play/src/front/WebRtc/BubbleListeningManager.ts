import type { Subscription } from "rxjs";
import { filter } from "rxjs";
import * as Sentry from "@sentry/svelte";
import { FilterType } from "@workadventure/messages";
import { AbortError } from "@workadventure/shared-utils/src/Abort/AbortError";
import type { RoomConnection } from "../Connection/RoomConnection";
import type { SpaceRegistryInterface } from "../Space/SpaceRegistry/SpaceRegistryInterface";
import type { SpaceInterface } from "../Space/SpaceInterface";

/** A bubble heard from its edge plays this much quieter than for its members: overheard, not talked to. */
export const LISTENED_BUBBLE_VOLUME = 0.15;

/**
 * Hears the bubble the local user stands at the edge of, like a conversation overheard in a corridor: the back
 * picks the bubble (BubbleListeners) and asks us to join it as a listener, then to leave it when we walk away,
 * join a bubble or the bubble gets locked. The voices are played low (LISTENED_BUBBLE_VOLUME), nothing is published.
 */
export class BubbleListeningManager {
    private readonly subscriptions: Subscription[];
    private readonly listened = new Map<string, { abortController: AbortController; space: Promise<SpaceInterface> }>();

    constructor(
        roomConnection: RoomConnection,
        private readonly spaceRegistry: SpaceRegistryInterface,
    ) {
        this.subscriptions = [
            roomConnection.joinSpaceRequestMessage
                .pipe(filter((message) => message.listener))
                .subscribe(({ spaceName }) => this.startListening(spaceName)),
            roomConnection.leaveSpaceRequestMessage
                .pipe(filter((message) => message.listener))
                .subscribe(({ spaceName }) => this.stopListening(spaceName)),
        ];
    }

    public destroy(): void {
        for (const subscription of this.subscriptions) subscription.unsubscribe();
        for (const spaceName of [...this.listened.keys()]) this.stopListening(spaceName);
    }

    private startListening(spaceName: string): void {
        const abortController = new AbortController();
        const space = this.spaceRegistry.joinSpace(spaceName, FilterType.ALL_USERS, [], abortController.signal, {
            listener: true,
        });
        this.listened.set(spaceName, { abortController, space });
        space.catch((error: unknown) => {
            if (this.listened.get(spaceName)?.space === space) this.listened.delete(spaceName);
            if (error instanceof AbortError || abortController.signal.aborted) return;
            console.error("Could not listen to the bubble", error);
            Sentry.captureException(error);
        });
    }

    private stopListening(spaceName: string): void {
        const listened = this.listened.get(spaceName);
        if (!listened) return;
        this.listened.delete(spaceName);
        listened.abortController.abort(new AbortError("Stopped listening to the bubble"));
        listened.space
            .then(
                (space) => this.spaceRegistry.leaveSpace(space),
                // The join was aborted or failed (reported by startListening): there is nothing to leave.
                () => undefined,
            )
            .catch((error: unknown) => {
                console.error("Could not stop listening to the bubble", error);
                Sentry.captureException(error);
            });
    }
}
