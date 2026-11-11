import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, tick, unmount } from "svelte";

const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), remove: vi.fn() }));

vi.mock("../../../src/front/external-modules/infogene-calendar/CompanionApi", () => ({
    listCompanionTokens: mocks.list,
    createCompanionToken: mocks.create,
    deleteCompanionToken: mocks.remove,
    companionInstallCommand: (origin: string) => `bash <(curl -fsSL https://example/install.sh) --url ${origin}`,
}));
vi.mock("../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    const text = (value: string) => () => value;
    return {
        default: readable({
            externalModule: {
                companion: {
                    title: text("Mac companion"),
                    explain: text("Reads your meetings"),
                    create: text("Create a token"),
                    copyHint: text("Copy it now"),
                    done: text("Done"),
                    remove: ({ label }: { label: string }) => `Remove ${label}`,
                    lastUsed: ({ date }: { date: string }) => `Last used ${date}`,
                    neverUsed: text("Never used"),
                    error: text("Unavailable"),
                },
            },
        }),
    };
});

import CompanionSettings from "../../../src/front/external-modules/infogene-calendar/CompanionSettings.svelte";

const token = {
    id: "59a53748-d07d-4a0a-900a-09c7b5326e66",
    label: "MacBook",
    createdAt: "2026-11-11T15:00:00.000Z",
    lastUsedAt: null,
};
const target = document.createElement("div");
let component: ReturnType<typeof mount> | undefined;

async function settle(): Promise<void> {
    await tick();
    flushSync();
}

function button(text: string): HTMLButtonElement | undefined {
    return [...target.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
}

beforeEach(() => {
    document.body.appendChild(target);
    mocks.list.mockResolvedValue({ tokens: [token] });
    mocks.create.mockResolvedValue({ ...token, id: "c5c0ad38-0000-4000-8000-000000000000", token: "wac_secret" });
    mocks.remove.mockResolvedValue(undefined);
});

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target.innerHTML = "";
    vi.clearAllMocks();
});

describe("CompanionSettings", () => {
    it("stays hidden while the companion is disabled on the server", async () => {
        mocks.list.mockResolvedValue("disabled");
        component = mount(CompanionSettings, { target });
        await vi.waitFor(() => expect(mocks.list).toHaveBeenCalled());
        await settle();

        expect(target.textContent?.trim()).toBe("");
    });

    it("lists the tokens with their last use, never their value", async () => {
        component = mount(CompanionSettings, { target });
        await vi.waitFor(() => expect(target.textContent).toContain("MacBook"));

        expect(target.textContent).toContain("Never used");
        expect(target.textContent).not.toContain("wac_");
    });

    it("shows a new token once, with the install command, then never again", async () => {
        component = mount(CompanionSettings, { target });
        await vi.waitFor(() => expect(button("Create a token")).toBeDefined());

        button("Create a token")?.click();
        await vi.waitFor(() => expect(target.textContent).toContain("wac_secret"));
        expect(target.textContent).toContain(`--url ${window.location.origin}`);
        expect(target.textContent).not.toContain("--token");

        button("Done")?.click();
        await settle();
        expect(target.textContent).not.toContain("wac_secret");
    });

    it("revokes a token", async () => {
        component = mount(CompanionSettings, { target });
        await vi.waitFor(() => expect(target.textContent).toContain("MacBook"));
        mocks.list.mockResolvedValue({ tokens: [] });

        target.querySelector<HTMLButtonElement>('button[aria-label="Remove MacBook"]')?.click();
        await vi.waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(token.id, expect.any(AbortSignal)));
        await vi.waitFor(() => expect(target.textContent).not.toContain("MacBook"));
    });
});
