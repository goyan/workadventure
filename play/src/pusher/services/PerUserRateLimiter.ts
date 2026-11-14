import { RateLimiter } from "limiter";
import type { ResponseWithUserIdentifier } from "../middlewares/Authenticated";

const IDLE_MS = 60_000;

/**
 * A number of requests a minute for each player of an authenticated route, followed for at most `maxClients` players
 * at once (beyond, newcomers wait). Answers 429 with Retry-After when refused.
 */
export class PerUserRateLimiter {
    private readonly clients = new Map<string, { limiter: RateLimiter; at: number }>();

    public constructor(
        private readonly perMinute: number,
        private readonly maxClients = 4096,
    ) {}

    /** Whether this player may make one more request; when not, the answer (401 or 429) is already sent. */
    public allow(res: ResponseWithUserIdentifier): boolean {
        if (!res.userIdentifier) {
            res.status(401).send();
            return false;
        }
        const now = Date.now();
        for (const [id, client] of this.clients) {
            if (now - client.at > IDLE_MS) this.clients.delete(id);
        }
        let client = this.clients.get(res.userIdentifier);
        if (!client) {
            if (this.clients.size >= this.maxClients) return this.refuse(res);
            client = { limiter: new RateLimiter({ tokensPerInterval: this.perMinute, interval: "minute" }), at: now };
            this.clients.set(res.userIdentifier, client);
        }
        client.at = now;
        return client.limiter.tryRemoveTokens(1) || this.refuse(res);
    }

    private refuse(res: ResponseWithUserIdentifier): false {
        res.setHeader("Retry-After", "60");
        res.status(429).json({ error: "limited" });
        return false;
    }
}
