// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";
import TextMessage from "../../../src/front/Components/TypeMessage/TextMessage.svelte";

vi.mock("@wa-icons", () => ({ IconX: vi.fn() }));

describe("global text author", () => {
    it("renders the sender as escaped text and retains rich message content", () => {
        const { body } = render(TextMessage, {
            props: {
                message: {
                    id: "global-test",
                    text: JSON.stringify({
                        ops: [{ insert: "Café", attributes: { bold: true } }, { insert: "\n" }],
                        sender: { uuid: "npc:ada", name: 'NPC · <img src=x onerror="alert(1)">' },
                    }),
                },
            },
        });
        expect(body).toContain("NPC · &lt;img");
        expect(body).not.toContain("<img");
        expect(body).toContain("<strong>Café</strong>");
    });

    it("keeps historical messages readable when they have no sender metadata", () => {
        const { body } = render(TextMessage, {
            props: {
                message: {
                    id: "legacy",
                    text: JSON.stringify({ ops: [{ insert: "Bonjour\n" }] }),
                },
            },
        });
        expect(body).toContain("Bonjour");
    });
});
