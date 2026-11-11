import { asError } from "catch-unknown";
import type { z } from "zod";
import { CompanionTokenList, CreatedCompanionToken } from "../../../common/MacCompanion";
import { localUserStore } from "../../Connection/LocalUserStore";
import { ABSOLUTE_PUSHER_URL } from "../../Enum/ComputedConst";

/** Where the Mac companion is published: the public fork, branch infogene (no secret in it). */
const INSTALL_SCRIPT_URL =
    "https://raw.githubusercontent.com/goyan/workadventure/infogene/tools/infogene-companion/install.sh";

export class CompanionApiError extends Error {
    constructor(public readonly status: number) {
        super(`Mac companion request failed: ${status}`);
        this.name = "CompanionApiError";
    }
}

async function request(path: string, init: { method: string; body?: unknown; signal?: AbortSignal }) {
    const hasBody = init.body !== undefined;
    try {
        return await fetch(`${ABSOLUTE_PUSHER_URL}${path}`, {
            method: init.method,
            headers: {
                Authorization: localUserStore.getAuthToken() || "",
                ...(hasBody ? { "Content-Type": "application/json" } : {}),
            },
            ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
            signal: init.signal,
        });
    } catch (e) {
        // An aborted request is not a failure: the caller is gone and ignores it.
        if (init.signal?.aborted) throw asError(e);
        throw new CompanionApiError(0);
    }
}

async function parse<T extends z.ZodTypeAny>(response: Response, schema: T): Promise<z.infer<T>> {
    if (!response.ok) throw new CompanionApiError(response.status);
    const parsed = schema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) throw new CompanionApiError(response.status);
    return parsed.data;
}

/** The tokens of the user, or "disabled" when the companion is off on this server (the section is then hidden). */
export async function listCompanionTokens(signal?: AbortSignal): Promise<CompanionTokenList | "disabled"> {
    const response = await request("/companion/tokens", { method: "GET", signal });
    if (response.status === 404) return "disabled";
    return parse(response, CompanionTokenList);
}

export async function createCompanionToken(label: string, signal?: AbortSignal): Promise<CreatedCompanionToken> {
    return parse(await request("/companion/tokens", { method: "POST", body: { label }, signal }), CreatedCompanionToken);
}

export async function deleteCompanionToken(id: string, signal?: AbortSignal): Promise<void> {
    const response = await request(`/companion/tokens/${encodeURIComponent(id)}`, { method: "DELETE", signal });
    if (!response.ok) throw new CompanionApiError(response.status);
}

/** The command a colleague runs in Terminal; the token is typed when the script asks, never in the command line. */
export function companionInstallCommand(origin: string): string {
    return `bash <(curl -fsSL ${INSTALL_SCRIPT_URL}) --url ${origin}`;
}
