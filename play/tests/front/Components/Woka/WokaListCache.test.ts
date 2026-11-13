import { describe, expect, it, vi } from "vitest";
import { createWokaListCache } from "@wa/front/Components/Woka/WokaListCache";
import type { WokaData } from "@wa/front/Components/Woka/WokaTypes";

const emptyLayer = () => ({ collections: [] });
const wokaList = (): WokaData => ({
    body: emptyLayer(),
    eyes: emptyLayer(),
    hair: emptyLayer(),
    clothes: emptyLayer(),
    hat: emptyLayer(),
    accessory: emptyLayer(),
    woka: {
        collections: [
            { name: "default", position: 0, textures: [{ id: "male1", name: "male1", url: "male1.png", position: 0 }] },
        ],
    },
});

describe("createWokaListCache", () => {
    it("asks the server once per room, even for concurrent openings", async () => {
        const fetcher = vi.fn((_roomUrl: string) => Promise.resolve(wokaList()));
        const cache = createWokaListCache(fetcher);

        await Promise.all([cache.load("https://wa/room"), cache.load("https://wa/room")]);
        await cache.load("https://wa/room");

        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("asks again for another room", async () => {
        const fetcher = vi.fn((_roomUrl: string) => Promise.resolve(wokaList()));
        const cache = createWokaListCache(fetcher);

        await cache.load("https://wa/room-a");
        await cache.load("https://wa/room-b");

        expect(fetcher.mock.calls.map(([roomUrl]) => roomUrl)).toEqual(["https://wa/room-a", "https://wa/room-b"]);
    });

    it("gives each caller its own copy", async () => {
        const cache = createWokaListCache(() => Promise.resolve(wokaList()));

        const first = await cache.load("https://wa/room");
        first.woka.collections[0].textures.length = 0;
        const second = await cache.load("https://wa/room");

        expect(second.woka.collections[0].textures).toHaveLength(1);
    });

    it("does not keep a failed request, so the retry button asks again", async () => {
        const fetcher = vi
            .fn((_roomUrl: string) => Promise.resolve(wokaList()))
            .mockRejectedValueOnce(new Error("Failed to load Woka data"));
        const cache = createWokaListCache(fetcher);

        await expect(cache.load("https://wa/room")).rejects.toThrow("Failed to load Woka data");
        await expect(cache.load("https://wa/room")).resolves.toEqual(wokaList());

        expect(fetcher).toHaveBeenCalledTimes(2);
    });
});
