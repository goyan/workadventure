import { asError } from "catch-unknown";
import { localUserStore } from "../../Connection/LocalUserStore";
import { ABSOLUTE_PUSHER_URL } from "../../Enum/ComputedConst";

/** Past this delay a request to the pusher is given up: the agenda keeps what it showed, the forms say so. */
export const PUSHER_REQUEST_TIMEOUT_MS = 15_000;

/** The pusher did not answer: network failure, or no answer within the delay. */
export class PusherUnreachableError extends Error {
    constructor(options?: ErrorOptions) {
        super("The pusher could not be reached", options);
        this.name = "PusherUnreachableError";
    }
}

/**
 * A request of the calendar module to the pusher, authenticated with the user's token. Bounded by
 * `PUSHER_REQUEST_TIMEOUT_MS`; a request cancelled by its caller ends with the caller's abort error, so that the caller
 * can ignore it, while a network failure or a timeout ends with `PusherUnreachableError`.
 */
export async function pusherFetch(
    path: string,
    init: { method: string; body?: unknown; signal?: AbortSignal; timeoutMs?: number },
): Promise<Response> {
    const hasBody = init.body !== undefined;
    const timeout = AbortSignal.timeout(init.timeoutMs ?? PUSHER_REQUEST_TIMEOUT_MS);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    try {
        return await fetch(`${ABSOLUTE_PUSHER_URL.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`, {
            method: init.method,
            headers: {
                Authorization: localUserStore.getAuthToken() || "",
                ...(hasBody ? { "Content-Type": "application/json" } : {}),
            },
            ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
            signal,
        });
    } catch (e) {
        if (init.signal?.aborted) throw asError(e);
        throw new PusherUnreachableError({ cause: asError(e) });
    }
}
