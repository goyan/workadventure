import type { WokaData } from "./WokaTypes";

export interface WokaListCache {
    load(roomUrl: string): Promise<WokaData>;
}

/**
 * Keeps the woka list of each room for the life of the page: the woka screens, the onboarding and the default woka
 * all asked the server again, so the woka screen showed its spinner on every opening.
 * A failed request is forgotten so that the retry button asks again. Each caller gets its own copy.
 */
export function createWokaListCache(fetchWokaList: (roomUrl: string) => Promise<WokaData>): WokaListCache {
    const requests = new Map<string, Promise<WokaData>>();
    return {
        load(roomUrl: string): Promise<WokaData> {
            let request = requests.get(roomUrl);
            if (request === undefined) {
                const started = fetchWokaList(roomUrl);
                requests.set(roomUrl, started);
                started.catch(() => {
                    if (requests.get(roomUrl) === started) requests.delete(roomUrl);
                });
                request = started;
            }
            return request.then((wokaList) => structuredClone(wokaList));
        },
    };
}
