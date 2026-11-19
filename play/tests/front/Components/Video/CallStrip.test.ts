import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import type { writable } from "svelte/store";

const stores = vi.hoisted((): { peers?: unknown; avatarVideos?: unknown } => ({}));
vi.mock("../../../../src/front/Stores/PeerStore", async () => {
    const { writable: w } = await import("svelte/store");
    stores.peers = w<unknown[]>([]);
    return { videoStreamElementsStore: stores.peers };
});
vi.mock("../../../../src/front/Stores/StreamableCollectionStore", async () => {
    const { writable: w } = await import("svelte/store");
    return { myCameraPeerStore: w({ uniqueId: "-1", spaceUser: { spaceUserId: "me", name: "Moi" } }) };
});
vi.mock("../../../../src/front/Stores/AvatarVideoStore", async () => {
    const { writable: w } = await import("svelte/store");
    stores.avatarVideos = w(false);
    return { avatarVideosEnabledStore: stores.avatarVideos };
});
vi.mock("../../../../src/front/Stores/HighlightedEmbedScreenStore", async () => {
    const { writable: w } = await import("svelte/store");
    return { highlightedEmbedScreen: w(undefined) };
});
vi.mock("../../../../src/front/Stores/ActionsCamStore", async () => {
    const { writable: w } = await import("svelte/store");
    return { highlightFullScreen: w(false) };
});
vi.mock("../../../../src/front/Components/Video/CallStrip/CallStripChip.svelte", async () => ({
    default: ((await import("./CallStripChipStub.svelte")) as { default: unknown }).default,
}));

const { offscreenCallUsersStore } = await import("../../../../src/front/Stores/CallStripStore");
const { default: CallStrip } = await import("../../../../src/front/Components/Video/CallStrip/CallStrip.svelte");

type W<T> = ReturnType<typeof writable<T>>;
const peers = () => stores.peers as W<unknown[]>;
const avatarVideos = () => stores.avatarVideos as W<boolean>;
const box = (id: string, name: string) => ({ uniqueId: id, spaceUser: { spaceUserId: id, name } });
const names = (target: HTMLElement) =>
    [...target.querySelectorAll('[data-testid="call-strip-chip"]')].map((chip) => chip.getAttribute("aria-label"));

const target = document.createElement("div");
let component: ReturnType<typeof mount> | undefined;

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target.replaceChildren();
    offscreenCallUsersStore.set(new Set());
    avatarVideos().set(false);
    peers().set([]);
});

describe("The call strip", () => {
    it("shows everyone in a mini tile, me included, with the videos over the avatars while one looks at the call", () => {
        avatarVideos().set(true);
        peers().set([box("s_1", "Hervé"), box("s_2", "Justin")]);
        flushSync(() => {
            component = mount(CallStrip, { target });
        });
        expect(names(target)).toEqual(["Hervé", "Justin", "Moi"]);
    });

    it("gives way to the large tiles when one looks away from the call (the own avatar out of the view)", () => {
        avatarVideos().set(true);
        peers().set([box("s_1", "Hervé")]);
        flushSync(() => {
            component = mount(CallStrip, { target });
        });
        flushSync(() => offscreenCallUsersStore.set(new Set(["local"])));
        expect(target.querySelector('[data-testid="call-strip"]')).toBeNull();
    });

    it("shows no mini tile without the videos over the avatars: the call keeps its large tiles", () => {
        peers().set([box("s_1", "Hervé")]);
        flushSync(() => {
            component = mount(CallStrip, { target });
        });
        expect(target.querySelector('[data-testid="call-strip"]')).toBeNull();
    });
});
