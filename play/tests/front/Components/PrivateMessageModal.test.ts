import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import PrivateMessageModal from "../../../src/front/Components/PrivateMessage/PrivateMessageModal.svelte";
import {
    clearPrivateMessages,
    privateMessageHistoryStore,
    recordPrivateMessage,
} from "../../../src/front/Stores/PrivateMessageStore";
import { enableUserInputsStore, inputFormFocusStore } from "../../../src/front/Stores/UserInputStore";
import { blackListManager } from "../../../src/front/WebRtc/BlackListManager";

vi.mock("../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    return {
        LL: readable({
            chat: {
                privateMessage: {
                    label: () => "Private message",
                    sending: () => "Sending",
                    unavailable: () => "This user is unavailable",
                },
                userList: { sendMessage: () => "Send" },
                you: () => "You",
                enter: () => "Type a message",
            },
        }),
    };
});

vi.mock("@wa-modals", () => ({ modals: { close: vi.fn() } }));

const target = document.createElement("div");
let component: ReturnType<typeof mount> | undefined;

beforeEach(() => {
    document.body.append(target);
    // jsdom has no layout: each rendered message occupies 100px in a 100px history viewport.
    const positions = new WeakMap<Element, number>();
    vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function () {
        return this.matches('[aria-live="polite"]') ? this.querySelectorAll("p").length * 100 : 0;
    });
    vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(100);
    vi.spyOn(Element.prototype, "scrollTop", "get").mockImplementation(function () {
        return positions.get(this) ?? 0;
    });
    vi.spyOn(Element.prototype, "scrollTop", "set").mockImplementation(function (value) {
        positions.set(this, Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)));
    });
});

function renderModal(send: (text: string) => Promise<void> = () => Promise.resolve()): HTMLTextAreaElement {
    flushSync(() => {
        component = mount(PrivateMessageModal, {
            target,
            props: { isOpen: true, userUuid: "peer-ada", userName: "Ada", send },
        });
    });
    const textarea = target.querySelector("textarea");
    if (!textarea) throw new Error("Private message composer did not render");
    return textarea;
}

function submitForm(): void {
    const form = target.querySelector("form");
    if (!form) throw new Error("Private message form did not render");
    flushSync(() => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

function setText(textarea: HTMLTextAreaElement, text: string): void {
    flushSync(() => {
        textarea.value = text;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

function enter(textarea: HTMLTextAreaElement, options: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...options });
    flushSync(() => textarea.dispatchEvent(event));
    return event;
}

function history(): HTMLDivElement {
    const element = target.querySelector<HTMLDivElement>('[aria-live="polite"]');
    if (!element) throw new Error("Private message history did not render");
    return element;
}

function receive(text: string, peerUuid = "peer-ada"): void {
    flushSync(() => recordPrivateMessage({ peerUuid, peerName: "Ada", text, incoming: true }));
}

function scrollHistory(top: number): void {
    const element = history();
    element.scrollTop = top;
    flushSync(() => element.dispatchEvent(new Event("scroll")));
}

afterEach(async () => {
    const mountedComponent = component;
    component = undefined;
    if (mountedComponent) await unmount(mountedComponent, { outro: false });
    target.replaceChildren();
    target.remove();
    clearPrivateMessages();
    inputFormFocusStore.set(false);
    blackListManager.cancelBlackList("peer-ada");
    vi.restoreAllMocks();
});

describe("PrivateMessageModal", () => {
    it("opens at the newest message and follows incoming replies while at the bottom", () => {
        receive("First");
        receive("Second");
        receive("Third");
        renderModal();

        expect(history().scrollTop).toBe(200);
        receive("Fourth");
        expect(history().scrollTop).toBe(300);
        receive("Fifth");
        expect(history().scrollTop).toBe(400);
    });

    it("preserves reading position on incoming replies and resumes following after scrolling down", () => {
        receive("First");
        receive("Second");
        receive("Third");
        renderModal();
        scrollHistory(50);

        receive("Fourth");
        expect(history().scrollTop).toBe(50);

        scrollHistory(300);
        receive("Fifth");
        expect(history().scrollTop).toBe(400);
    });

    it("jumps to a successful outgoing message even when reading older messages", async () => {
        receive("First");
        receive("Second");
        receive("Third");
        const textarea = renderModal();
        scrollHistory(50);
        setText(textarea, "My reply");

        submitForm();

        await vi.waitFor(() => expect(history().scrollTop).toBe(300));
        expect(target.textContent).toContain("My reply");
        receive("Ada's reply");
        expect(history().scrollTop).toBe(400);
    });

    it("does not scroll on draft edits, failed sends, or messages from another peer", async () => {
        receive("First");
        receive("Second");
        receive("Third");
        const textarea = renderModal(() => Promise.reject(new Error("offline")));
        scrollHistory(50);

        setText(textarea, "My draft");
        expect(history().scrollTop).toBe(50);
        receive("Other conversation", "peer-other");
        expect(history().scrollTop).toBe(50);
        submitForm();
        await vi.waitFor(() => expect(target.querySelector('[role="alert"]')).not.toBeNull());
        expect(history().scrollTop).toBe(50);
    });

    it("jumps to an outgoing message after the hundred-message history reaches its limit", async () => {
        for (let index = 0; index < 100; index++) receive(`Message ${index}`);
        const textarea = renderModal();
        scrollHistory(50);
        setText(textarea, "Newest reply");
        submitForm();

        await vi.waitFor(() => expect(history().scrollTop).toBe(9900));
        expect(get(privateMessageHistoryStore)).toHaveLength(100);
        expect(history().scrollTop).toBe(9900);
        expect(target.textContent).not.toContain("Message 0");
        expect(target.textContent).toContain("Newest reply");
    });

    it("focuses the composer on opening and disables avatar inputs while typing", () => {
        const textarea = renderModal();

        expect(document.activeElement).toBe(textarea);
        expect(get(inputFormFocusStore)).toBe(true);
        expect(get(enableUserInputsStore)).toBe(false);
    });

    it("does not steal focus when a new private message arrives", () => {
        renderModal();
        const close = target.querySelector<HTMLButtonElement>('[data-testid="closeModal"]');
        if (!close) throw new Error("Private message close button did not render");
        close.focus();

        flushSync(() => {
            recordPrivateMessage({ peerUuid: "peer-ada", peerName: "Ada", text: "New reply", incoming: true });
        });

        expect(document.activeElement).toBe(close);
    });

    it("shows only the selected peer's history and renders message text as text", async () => {
        recordPrivateMessage({ peerUuid: "peer-other", peerName: "Other", text: "Other private text", incoming: true });
        recordPrivateMessage({ peerUuid: "peer-ada", peerName: "Ada", text: "Earlier message", incoming: true });
        const send = vi.fn(() => Promise.resolve());
        const textarea = renderModal(send);

        setText(textarea, "<img src=x onerror=alert(1)> hello ");
        submitForm();

        await vi.waitFor(() => expect(send).toHaveBeenCalledWith("<img src=x onerror=alert(1)> hello"));
        await vi.waitFor(() => expect(get(privateMessageHistoryStore)).toHaveLength(3));
        expect(target.textContent).toContain("Earlier message");
        expect(target.textContent).toContain("<img src=x onerror=alert(1)> hello");
        expect(target.textContent).not.toContain("Other private text");
        expect(target.querySelector("img")).toBeNull();
        expect(target.textContent).toContain("You");
        expect(textarea.value).toBe("");
        expect(document.activeElement).toBe(textarea);
        expect(get(inputFormFocusStore)).toBe(true);
    });

    it("keeps the draft and reports an unavailable peer when sending fails", async () => {
        const send = vi.fn(() => Promise.reject(new Error("offline")));
        const textarea = renderModal(send);
        setText(textarea, "  Please reply  ");

        submitForm();

        await vi.waitFor(() => expect(target.querySelector('[role="alert"]')?.textContent).toContain("unavailable"));
        expect(send).toHaveBeenCalledWith("Please reply");
        expect(textarea.value).toBe("  Please reply  ");
        expect(get(privateMessageHistoryStore)).toEqual([]);
        expect(document.activeElement).toBe(textarea);
    });

    it("blocks sends to a blacklisted peer without clearing the draft", () => {
        const send = vi.fn(() => Promise.resolve());
        const textarea = renderModal(send);
        setText(textarea, "Can you hear me?");
        blackListManager.blackList("peer-ada");

        submitForm();

        expect(send).not.toHaveBeenCalled();
        expect(target.querySelector('[role="alert"]')?.textContent).toContain("unavailable");
        expect(textarea.value).toBe("Can you hear me?");
        expect(get(privateMessageHistoryStore)).toEqual([]);
    });

    it("sends on Enter but leaves Shift+Enter and IME composition alone", async () => {
        const send = vi.fn(() => Promise.resolve());
        const textarea = renderModal(send);
        setText(textarea, "first");

        const shiftEnter = enter(textarea, { shiftKey: true });
        const composingEnter = enter(textarea, { isComposing: true });
        expect(shiftEnter.defaultPrevented).toBe(false);
        expect(composingEnter.defaultPrevented).toBe(false);
        expect(send).not.toHaveBeenCalled();

        const enterEvent = enter(textarea);
        expect(enterEvent.defaultPrevented).toBe(true);
        await vi.waitFor(() => expect(send).toHaveBeenCalledWith("first"));
    });

    it("prevents duplicate sends while a message is pending", async () => {
        let resolveSend: () => void = () => {};
        const send = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolveSend = resolve;
                }),
        );
        const textarea = renderModal(send);
        setText(textarea, "One message");

        submitForm();
        submitForm();

        expect(send).toHaveBeenCalledTimes(1);
        expect(textarea.disabled).toBe(true);
        const close = target.querySelector<HTMLButtonElement>('[data-testid="closeModal"]');
        if (!close) throw new Error("Private message close button did not render");
        close.focus();
        expect(document.activeElement).not.toBe(textarea);
        resolveSend();
        await vi.waitFor(() => expect(get(privateMessageHistoryStore)).toHaveLength(1));
        expect(textarea.value).toBe("");
        expect(document.activeElement).toBe(textarea);
    });

    it("releases input focus and ignores a late send result after destruction", async () => {
        let resolveSend: () => void = () => {};
        const send = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolveSend = resolve;
                }),
        );
        const textarea = renderModal(send);
        textarea.dispatchEvent(new FocusEvent("focus"));
        expect(get(inputFormFocusStore)).toBe(true);
        setText(textarea, "Late reply");
        submitForm();

        const mountedComponent = component;
        component = undefined;
        if (!mountedComponent) throw new Error("Private message modal was not mounted");
        await unmount(mountedComponent, { outro: false });
        expect(get(inputFormFocusStore)).toBe(false);
        expect(get(enableUserInputsStore)).toBe(true);

        resolveSend();
        await Promise.resolve();
        await Promise.resolve();
        expect(get(privateMessageHistoryStore)).toEqual([]);
    });
});
