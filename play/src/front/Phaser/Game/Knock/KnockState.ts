import type { KnockAnswer, KnockMessage } from "./KnockProtocol";

/** A request nobody answered within this delay is dropped ("noAnswer"). */
export const KNOCK_REPLY_TIMEOUT_MS = 30_000;
/** Anti-spam: a visitor cannot knock again on the same area before this delay, counted from the request. */
export const KNOCK_COOLDOWN_MS = 30_000;
/** How long a visitor may cross a locked area after an "enter" answer. */
export const KNOCK_PASS_MS = 60_000;
/**
 * Each client counts the delays from its own reception: the clients differ by the latency. A receiver applies the
 * cooldown minus this margin (a re-knock sent right at 30 s is not lost), and the visitor waits this much longer
 * than the occupants before "noAnswer" (a late answer still reaches it).
 */
export const KNOCK_CLOCK_MARGIN_MS = 2_000;

export interface KnockRequest {
    areaId: string;
    visitorUuid: string;
    visitorName: string;
    /** Local reception time: every deadline is computed from it, never from the message's `at`. */
    receivedAt: number;
}

export type KnockEffect =
    | { kind: "requested"; request: KnockRequest }
    | { kind: "answered"; areaId: string; visitorUuid: string; answer: KnockAnswer; answeredBy: string }
    | { kind: "withdrawn"; areaId: string; visitorUuid: string }
    | { kind: "noAnswer"; areaId: string; visitorUuid: string }
    | { kind: "passExpired"; areaId: string; visitorUuid: string };

function keyOf(areaId: string, visitorUuid: string): string {
    return JSON.stringify([areaId, visitorUuid]);
}

/**
 * Pure state of the knocks seen by this client. No timers: the caller feeds the clock
 * through `now` and calls `expire` periodically.
 */
export class KnockState {
    private readonly pendingRequests = new Map<string, KnockRequest>();
    /** Time after which each pending request gets "noAnswer". */
    private readonly replyDeadlines = new Map<string, number>();
    /** Reception time of the last request per (area, visitor), kept after resolution for the cooldown. */
    private readonly lastRequestAt = new Map<string, number>();
    /** Pass expiry time per (area, visitor). */
    private readonly passes = new Map<string, { areaId: string; visitorUuid: string; expiresAt: number }>();

    /** @param replyTimeoutMs for a request: how long it waits for an answer here (the visitor waits longer). */
    receive(message: KnockMessage, now: number, replyTimeoutMs = KNOCK_REPLY_TIMEOUT_MS): KnockEffect[] {
        const key = keyOf(message.areaId, message.visitorUuid);
        switch (message.kind) {
            case "request": {
                // The sender applies its own request, then gets the echo: ignore it (and any
                // request inside the cooldown) so that nothing is reset.
                if (this.pendingRequests.has(key) || !this.cooldownElapsed(key, now, KNOCK_CLOCK_MARGIN_MS)) {
                    return [];
                }
                const request: KnockRequest = {
                    areaId: message.areaId,
                    visitorUuid: message.visitorUuid,
                    visitorName: message.visitorName,
                    receivedAt: now,
                };
                this.pendingRequests.set(key, request);
                this.replyDeadlines.set(key, now + replyTimeoutMs);
                this.lastRequestAt.set(key, now);
                return [{ kind: "requested", request }];
            }
            case "answer": {
                // First answer wins: once the request left `pending`, later answers are ignored.
                if (!this.removePending(key)) {
                    return [];
                }
                if (message.answer === "enter") {
                    this.passes.set(key, {
                        areaId: message.areaId,
                        visitorUuid: message.visitorUuid,
                        expiresAt: now + KNOCK_PASS_MS,
                    });
                }
                return [
                    {
                        kind: "answered",
                        areaId: message.areaId,
                        visitorUuid: message.visitorUuid,
                        answer: message.answer,
                        answeredBy: message.answeredBy,
                    },
                ];
            }
            case "cancel": {
                if (!this.removePending(key)) {
                    return [];
                }
                return [{ kind: "withdrawn", areaId: message.areaId, visitorUuid: message.visitorUuid }];
            }
        }
    }

    /** Emits each `noAnswer` / `passExpired` exactly once. */
    expire(now: number): KnockEffect[] {
        const effects: KnockEffect[] = [];
        for (const [key, request] of this.pendingRequests) {
            if (now >= (this.replyDeadlines.get(key) ?? request.receivedAt + KNOCK_REPLY_TIMEOUT_MS)) {
                this.removePending(key);
                effects.push({ kind: "noAnswer", areaId: request.areaId, visitorUuid: request.visitorUuid });
            }
        }
        for (const [key, pass] of this.passes) {
            if (now >= pass.expiresAt) {
                this.passes.delete(key);
                effects.push({ kind: "passExpired", areaId: pass.areaId, visitorUuid: pass.visitorUuid });
            }
        }
        for (const [key, at] of this.lastRequestAt) {
            if (now >= at + KNOCK_COOLDOWN_MS && !this.pendingRequests.has(key)) {
                this.lastRequestAt.delete(key);
            }
        }
        return effects;
    }

    canKnock(visitorUuid: string, areaId: string, now: number): boolean {
        return this.cooldownElapsed(keyOf(areaId, visitorUuid), now);
    }

    pending(): readonly KnockRequest[] {
        return [...this.pendingRequests.values()];
    }

    hasPass(visitorUuid: string, areaId: string, now: number): boolean {
        const pass = this.passes.get(keyOf(areaId, visitorUuid));
        return pass !== undefined && now < pass.expiresAt;
    }

    /** The area was unlocked: its pending requests become "withdrawn". */
    dropArea(areaId: string): KnockEffect[] {
        const effects: KnockEffect[] = [];
        for (const [key, request] of this.pendingRequests) {
            if (request.areaId === areaId) {
                this.removePending(key);
                effects.push({ kind: "withdrawn", areaId, visitorUuid: request.visitorUuid });
            }
        }
        return effects;
    }

    /** @param marginMs shortens the cooldown: used on reception, where the clocks of the clients differ. */
    private cooldownElapsed(key: string, now: number, marginMs = 0): boolean {
        const at = this.lastRequestAt.get(key);
        return at === undefined || now >= at + KNOCK_COOLDOWN_MS - marginMs;
    }

    /** @returns whether the request was pending. */
    private removePending(key: string): boolean {
        this.replyDeadlines.delete(key);
        return this.pendingRequests.delete(key);
    }
}
