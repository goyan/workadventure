import type { z } from "zod";
import { CompanionTokenList, CreatedCompanionToken, MeetingRoomClaim, MeetingRoomList } from "../../../common/MacCompanion";
import type { MeetingRoomClaimInput } from "../../../common/MacCompanion";
import { PusherUnreachableError, pusherFetch } from "./pusherRequest";

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
    try {
        return await pusherFetch(path, init);
    } catch (e) {
        // A request cancelled by its caller keeps its abort error: the caller is gone and ignores it.
        if (e instanceof PusherUnreachableError) throw new CompanionApiError(0);
        throw e;
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

/** The room of one of the user's meetings on this map (`areaId: null`: every room is taken). */
export async function claimMeetingRoom(input: MeetingRoomClaimInput, signal?: AbortSignal): Promise<MeetingRoomClaim> {
    return parse(await request("/meeting-rooms/claim", { method: "POST", body: input, signal }), MeetingRoomClaim);
}

/** The taken rooms of a map, as every player sees them: room, title, end. */
export async function listMeetingRooms(mapUrl: string, signal?: AbortSignal): Promise<MeetingRoomList> {
    const response = await request(`/meeting-rooms?mapUrl=${encodeURIComponent(mapUrl)}`, { method: "GET", signal });
    return parse(response, MeetingRoomList);
}
