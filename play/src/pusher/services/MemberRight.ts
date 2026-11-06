import type { Request } from "express";
import { adminService } from "./AdminService";
import { jwtTokenManager } from "./JWTTokenManager";

/** Edit right and tags of a member in a room, as the Admin API reports them. */
export interface MemberRight {
    canEdit: boolean;
    tags: string[];
}

/**
 * Checks the request's token, then returns how to read the authenticated user's right in a room from the Admin API
 * (undefined when the Admin API refuses the member). Throws when the token is invalid.
 */
export async function fetchMemberRight(
    req: Request,
    userIdentifier: string,
): Promise<(trustedRoomUrl: string) => Promise<MemberRight | undefined>> {
    const jwtData = await jwtTokenManager.verifyJWTToken(req.header("authorization") ?? "");
    return async (trustedRoomUrl) => {
        const member = await adminService.fetchMemberDataByUuid(
            userIdentifier,
            jwtData.accessToken,
            trustedRoomUrl,
            req.ip ?? "",
            [],
            undefined,
            req.header("accept-language"),
            jwtData.tags,
        );
        return member.status === "error" ? undefined : { canEdit: member.canEdit ?? false, tags: member.tags };
    };
}
