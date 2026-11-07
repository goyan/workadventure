import Debug from "debug";
import { z } from "zod";
import { abortAny } from "@workadventure/shared-utils/src/Abort/AbortAny";
import { abortTimeout } from "@workadventure/shared-utils/src/Abort/AbortTimeout";
import { PUSHER_URL } from "../../../Enum/EnvironmentVariable";

const debug = Debug("front:night-clock");
const serverTime = z.object({ now: z.number().int().nonnegative().max(8_640_000_000_000_000) });
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

/** Paris time must come from the server, even when a player's computer clock is wrong. */
export class ServerNightClock {
    private readonly controller = new AbortController();
    private readonly interval: ReturnType<typeof setInterval>;
    private sample: { epoch: number; receivedAt: number } | undefined;
    private pending = false;

    constructor() {
        this.interval = setInterval(this.requestSync, SYNC_INTERVAL_MS);
        window.addEventListener("focus", this.requestSync);
        this.requestSync();
    }

    public now(): Date | undefined {
        return this.sample ? new Date(this.sample.epoch + performance.now() - this.sample.receivedAt) : undefined;
    }

    public destroy(): void {
        this.controller.abort();
        clearInterval(this.interval);
        window.removeEventListener("focus", this.requestSync);
    }

    private readonly requestSync = (): void => {
        if (this.pending || this.controller.signal.aborted) return;
        this.pending = true;
        this.sync()
            .finally(() => {
                this.pending = false;
            })
            .catch((error: unknown) => debug("Clock sync failed: %O", error));
    };

    private async sync(): Promise<void> {
        try {
            const startedAt = performance.now();
            const response = await fetch(new URL("/server-time", PUSHER_URL), {
                cache: "no-store",
                signal: abortAny([this.controller.signal, abortTimeout(10000)]),
            });
            if (!response.ok || this.controller.signal.aborted) return;
            const body: unknown = await response.json();
            const parsed = serverTime.safeParse(body);
            if (!parsed.success || this.controller.signal.aborted) return;
            const receivedAt = performance.now();
            // Approximate the response transit time with half the round trip.
            this.sample = { epoch: parsed.data.now + (receivedAt - startedAt) / 2, receivedAt };
        } catch (error) {
            // During a restart or offline period, keep advancing the last server sample.
            if (!this.controller.signal.aborted) debug("Clock sync failed: %O", error);
        }
    }
}
