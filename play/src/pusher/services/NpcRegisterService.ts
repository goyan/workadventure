import type { AxiosInstance } from "axios";
import axios from "axios";
import { suppressTracing } from "@sentry/node";
import { z } from "zod";

export const NpcRegistrationRequest = z.object({
    organizationMemberToken: z.string().min(1).max(2048),
    playUri: z.literal("https://wa-beta.goyan.fr/~/carte-antoine-naria-ff0813/office.wam"),
});
export type NpcRegistrationRequest = z.infer<typeof NpcRegistrationRequest>;

const NpcRegistrationResponse = z.object({
    status: z.literal("ok").optional(),
    userUuid: z.string().regex(/^npc:[a-z0-9-]{1,40}$/),
    email: z.null(),
    roomUrl: NpcRegistrationRequest.shape.playUri,
    mapUrlStart: z.string().url(),
});

type RegistrationResult = { status: "ok"; userUuid: string; roomUrl: string } | { status: "forbidden" | "unavailable" };

export class NpcRegisterService {
    private readonly recentRequests = new Map<string, number[]>();

    public constructor(
        private readonly config: { adminApiUrl: string; authorization: string },
        // The default axios instance has a process-wide GET cache. An invitation must be checked on every call.
        private readonly http: AxiosInstance = axios.create(),
        private readonly now: () => number = Date.now,
    ) {}

    /** Ten attempts per IP in a sliding minute; bound the public route's memory too. */
    public acceptRequest(ip: string): boolean {
        const now = this.now();
        const since = now - 60_000;
        for (const [address, times] of this.recentRequests) {
            if (times[times.length - 1] <= since) this.recentRequests.delete(address);
        }
        if (!this.recentRequests.has(ip) && this.recentRequests.size >= 4096) return false;
        const recent = (this.recentRequests.get(ip) ?? []).filter((time) => time > since);
        if (recent.length >= 10) return false;
        recent.push(now);
        this.recentRequests.set(ip, recent);
        return true;
    }

    public async register(request: NpcRegistrationRequest): Promise<RegistrationResult> {
        try {
            const url = `${this.config.adminApiUrl.replace(/\/+$/, "")}/api/login-url/${encodeURIComponent(request.organizationMemberToken)}`;
            // Sentry's HTTP instrumentation would otherwise record the invitation in the URL.
            const response = await suppressTracing(() =>
                this.http.get<unknown>(url, {
                    headers: { Authorization: this.config.authorization },
                    params: { playUri: request.playUri },
                    timeout: 10_000,
                    maxRedirects: 0,
                    maxContentLength: 16_384,
                    validateStatus: () => true,
                }),
            );
            if (response.status >= 500) return { status: "unavailable" };
            const member = NpcRegistrationResponse.safeParse(response.data);
            if (response.status !== 200 || !member.success) return { status: "forbidden" };
            return { status: "ok", userUuid: member.data.userUuid, roomUrl: member.data.roomUrl };
        } catch {
            // Axios errors contain the invitation URL and Authorization header. Neither leaves this boundary.
            return { status: "unavailable" };
        }
    }
}
