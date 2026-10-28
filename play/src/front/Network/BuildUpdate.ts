import Debug from "debug";
import { z } from "zod";
import { asError } from "catch-unknown";
import { abortAny } from "@workadventure/shared-utils/src/Abort/AbortAny";
import { abortTimeout } from "@workadventure/shared-utils/src/Abort/AbortTimeout";
import { PUSHER_URL } from "../Enum/EnvironmentVariable";

const debug = Debug("front:build-update");
const buildVersionResponse = z.object({ version: z.string().regex(/^[a-f0-9]{64}$/) });

/**
 * Compare against the version of the loaded page, never a fresh baseline from the server.
 * The caller decides when to reload; detecting an update must not interrupt a conversation.
 */
export function watchForBuildUpdate(currentVersion: string, onUpdate: () => void): () => void {
    const controller = new AbortController();
    let pendingCheck: Promise<void> | undefined;

    async function check(): Promise<void> {
        try {
            const response = await fetch(new URL("/build-version", PUSHER_URL), {
                cache: "no-store",
                signal: abortAny([controller.signal, abortTimeout(10000)]),
            });
            if (!response.ok || controller.signal.aborted) {
                return;
            }
            const body: unknown = await response.json();
            const parsed = buildVersionResponse.safeParse(body);
            if (!controller.signal.aborted && parsed.success && parsed.data.version !== currentVersion) {
                stop();
                onUpdate();
            }
        } catch (error) {
            // Deployment downtime and offline clients should simply retry on the next check.
            if (!controller.signal.aborted) {
                debug("Version check failed: %O", asError(error));
            }
        }
    }

    function requestCheck(): void {
        if (pendingCheck || controller.signal.aborted || document.visibilityState === "hidden") {
            return;
        }
        pendingCheck = check()
            .catch((error: unknown) => debug("Version check failed: %O", asError(error)))
            .finally(() => {
                pendingCheck = undefined;
            });
    }

    const interval = setInterval(requestCheck, 60000);
    window.addEventListener("focus", requestCheck);
    document.addEventListener("visibilitychange", requestCheck);

    function stop(): void {
        controller.abort();
        clearInterval(interval);
        window.removeEventListener("focus", requestCheck);
        document.removeEventListener("visibilitychange", requestCheck);
    }

    requestCheck();
    return stop;
}
