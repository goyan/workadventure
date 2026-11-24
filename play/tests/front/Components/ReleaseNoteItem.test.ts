// @vitest-environment node
import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import ReleaseNoteItem from "../../../src/front/Components/ReleaseNoteItem.svelte";

const note = {
    id: "0123456789abcdef0123456789abcdef01234567",
    date: "2026-11-20T10:00:00+01:00",
    author: "Hervé",
    type: "feat" as const,
    description: "l'herbe repousse en 5 minutes",
};

describe("release note line of the update banner", () => {
    it("shows who made the change after its description", () => {
        const { body } = render(ReleaseNoteItem, { props: { note } });
        expect(body).toContain("l'herbe repousse en 5 minutes");
        expect(body).toMatch(/— Hervé/);
    });

    it("shows the description alone, without a dangling dash, when the author is blank", () => {
        const { body } = render(ReleaseNoteItem, { props: { note: { ...note, author: "  " } } });
        expect(body).toContain("l'herbe repousse en 5 minutes");
        expect(body).not.toContain("—");
    });
});
