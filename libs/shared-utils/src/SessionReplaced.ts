import { z } from "zod";

/**
 * Error screen type (and code) sent by the back to a session replaced by a newer session of the same logged
 * user in the same room. The front shows it without reconnecting automatically.
 */
export const SESSION_REPLACED_ERROR_TYPE = "sessionReplaced";

/**
 * Who took the place, sent as JSON in the error screen details: the back has no translations, the front formats it.
 * Enough to tell a forgotten tab from another device or an unexpected reconnection.
 */
export const SessionReplacedDetails = z.object({
    // Milliseconds since the epoch, back clock.
    replacedAt: z.number(),
    ipAddress: z.string(),
    userAgent: z.string(),
    replacedTabId: z.string(),
    newTabId: z.string(),
});
export type SessionReplacedDetails = z.infer<typeof SessionReplacedDetails>;

/** The details of a session replacement; undefined for an older back (no details) or anything unexpected. */
export function parseSessionReplacedDetails(details: string | undefined): SessionReplacedDetails | undefined {
    if (!details) {
        return undefined;
    }
    try {
        const result = SessionReplacedDetails.safeParse(JSON.parse(details));
        return result.success ? result.data : undefined;
    } catch {
        return undefined;
    }
}
