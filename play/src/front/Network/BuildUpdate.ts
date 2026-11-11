import Debug from "debug";
import { z } from "zod";
import { asError } from "catch-unknown";
import { abortAny } from "@workadventure/shared-utils/src/Abort/AbortAny";
import { abortTimeout } from "@workadventure/shared-utils/src/Abort/AbortTimeout";
import { ReleaseNotes, getNewReleaseNotes, releaseNotes } from "../../common/ReleaseNotes";
import type { ReleaseNote } from "../../common/ReleaseNotes";
import { PUSHER_URL } from "../Enum/EnvironmentVariable";

const debug = Debug("front:build-update");
const buildVersionResponse = z.object({
    version: z.string().regex(/^[a-f0-9]{64}$/),
    releaseNotes: z.unknown().optional(),
});

/** The build the server serves now, or `undefined` when it cannot be read (deployment downtime, offline). */
async function fetchServedBuild(signal: AbortSignal): Promise<z.infer<typeof buildVersionResponse> | undefined> {
    const response = await fetch(new URL("/build-version", PUSHER_URL), { cache: "no-store", signal });
    if (!response.ok) {
        return undefined;
    }
    const parsed = buildVersionResponse.safeParse(await response.json());
    return parsed.success ? parsed.data : undefined;
}

/** The build of the loaded page, written by the pusher in the page it serves. */
export function getLoadedBuildVersion(): string | undefined {
    return document.querySelector<HTMLMetaElement>('meta[name="wa-build-version"]')?.content;
}

/**
 * The release notes of the build the server serves, when it is another build than `currentVersion`; else
 * `undefined`. Asked once the server is back after a lost connection: a deployment then already interrupted the
 * user, so the new build is loaded at once instead of reconnecting the old page and asking for a refresh a minute
 * later. Any failure keeps the page.
 */
export async function findNewerBuild(currentVersion: string): Promise<ReleaseNote[] | undefined> {
    try {
        const served = await fetchServedBuild(abortTimeout(10000));
        if (served === undefined || served.version === currentVersion) {
            return undefined;
        }
        const notes = ReleaseNotes.safeParse(served.releaseNotes);
        return notes.success ? notes.data : [];
    } catch (error) {
        debug("Version check failed: %O", asError(error));
        return undefined;
    }
}

const RELOADED_NOTES_KEY = "wa-build-update-notes";

/** Keeps, for the page about to be reloaded in this tab, the changes it brings. */
export function rememberUpdateForReload(notes: ReleaseNote[]): void {
    try {
        sessionStorage.setItem(RELOADED_NOTES_KEY, JSON.stringify(notes));
    } catch (error) {
        // Storage disabled or full: the new build still loads, only without its list of changes.
        debug("Cannot keep the release notes for the reload: %O", asError(error));
    }
}

/** The changes of an update this tab was just reloaded for, once; `undefined` after an ordinary load. */
export function takeUpdateAfterReload(): ReleaseNote[] | undefined {
    try {
        const stored = sessionStorage.getItem(RELOADED_NOTES_KEY);
        if (stored === null) {
            return undefined;
        }
        sessionStorage.removeItem(RELOADED_NOTES_KEY);
        const notes = ReleaseNotes.safeParse(JSON.parse(stored));
        return notes.success ? notes.data : undefined;
    } catch (error) {
        debug("Cannot read the release notes of the reload: %O", asError(error));
        return undefined;
    }
}

/**
 * Compare against the version of the loaded page, never a fresh baseline from the server.
 * The caller decides when to reload; detecting an update must not interrupt a conversation.
 */
export function watchForBuildUpdate(currentVersion: string, onUpdate: (notes: ReleaseNote[]) => void): () => void {
    const controller = new AbortController();
    let pendingCheck: Promise<void> | undefined;

    async function check(): Promise<void> {
        try {
            const served = await fetchServedBuild(abortAny([controller.signal, abortTimeout(10000)]));
            if (!controller.signal.aborted && served !== undefined && served.version !== currentVersion) {
                stop();
                const notes = ReleaseNotes.safeParse(served.releaseNotes);
                const found = notes.success ? notes.data : [];
                // The page may reload before the user reads the prompt (a deployment cuts the connection): the
                // reloaded page still tells what changed.
                rememberUpdateForReload(getNewReleaseNotes(found, releaseNotes));
                onUpdate(found);
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
