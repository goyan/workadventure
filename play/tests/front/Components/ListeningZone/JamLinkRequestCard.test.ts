import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import type { JamLinkRequestCard as Card } from "../../../../src/front/ListeningZone/JamLinkRequest";
import JamLinkRequestCard from "../../../../src/front/Components/ListeningZone/JamLinkRequestCard.svelte";

const mocks = vi.hoisted(() => ({
    setCard: vi.fn<(card: Card | undefined) => void>(),
    dismiss: vi.fn(),
    replace: vi.fn().mockResolvedValue("saved"),
}));
vi.mock("../../../../src/front/ListeningZone/JamLinkRequest", async () => {
    const { writable } = await import("svelte/store");
    const card = writable<Card | undefined>(undefined);
    mocks.setCard.mockImplementation(card.set);
    return { jamLinkRequestCardStore: card, dismissJamLinkRequests: mocks.dismiss };
});
vi.mock("../../../../src/front/ListeningZone/ListeningZoneController", async () => ({
    replaceOwnJamLink: mocks.replace,
    ownJamLinkSaveStore: (await import("svelte/store")).writable(undefined),
}));
vi.mock("../../../../src/i18n/i18n-svelte", async () => ({
    LL: (await import("svelte/store")).readable({
        actionbar: { close: () => "Close" },
        spotify: {
            listeningZone: {
                sharePlaceholder: () => "Paste the invite link",
                invalidLink: () => "Not a Jam link",
                cancel: () => "Cancel",
                jamStatus: {
                    replace: () => "Paste a new Jam link",
                    replaceSubmit: () => "Replace the link",
                    linkSaving: () => "Saving the link",
                    linkSaved: () => "Jam link updated",
                    linkFailed: () => "The link was not saved",
                },
                jamLinkRequest: {
                    one: ({ name }: { name: string }) => `${name} asks for a new Jam link`,
                    many: ({ name, count }: { name: string; count: number }) =>
                        `${name} and ${count} others ask for a new Jam link`,
                },
            },
        },
    }),
}));

const request: Card = {
    areaId: "area",
    propertyId: "property",
    jamKey: "https://spotify.link/expired",
    requesters: [{ uuid: "guest-1", name: "Antoine" }],
};
const target = document.body.appendChild(document.createElement("div"));
let component: ReturnType<typeof mount> | undefined;

function testId(id: string): HTMLElement | null {
    return target.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

beforeEach(() => {
    mocks.setCard(undefined);
    mocks.dismiss.mockClear();
    mocks.replace.mockClear();
    flushSync(() => {
        component = mount(JamLinkRequestCard, { target });
    });
});
afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target.replaceChildren();
});

describe("the host's card for new Jam link requests", () => {
    it("names the requester, or the latest one and how many others", () => {
        expect(testId("jam-link-request-card")).toBeNull();
        flushSync(() => mocks.setCard(request));
        expect(testId("jam-link-request-card")?.textContent).toContain("Antoine asks for a new Jam link");
        flushSync(() =>
            mocks.setCard({
                ...request,
                requesters: [
                    { uuid: "guest-1", name: "Antoine" },
                    { uuid: "guest-2", name: "Nat" },
                    { uuid: "guest-3", name: "Lou" },
                ],
            }),
        );
        expect(testId("jam-link-request-card")?.textContent).toContain("Antoine and 2 others ask for a new Jam link");
    });

    it("opens the paste field, focused, and replaces the link from it", () => {
        flushSync(() => mocks.setCard(request));
        flushSync(() => testId("jam-link-request-paste")?.click());
        const input = target.querySelector<HTMLInputElement>("input[type=url]");
        if (!input) throw new Error("The paste field did not open");
        expect(document.activeElement).toBe(input);
        input.value = "https://spotify.link/fresh";
        flushSync(() => input.dispatchEvent(new Event("input", { bubbles: true })));
        flushSync(() => input.form?.requestSubmit());
        expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("https://spotify.link/fresh");
    });

    it("closes with ×", () => {
        flushSync(() => mocks.setCard(request));
        flushSync(() => testId("jam-link-request-dismiss")?.click());
        expect(mocks.dismiss).toHaveBeenCalledOnce();
    });
});
