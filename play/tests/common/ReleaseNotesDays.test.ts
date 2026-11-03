import { describe, expect, it } from "vitest";
import type { ReleaseNote } from "../../src/common/ReleaseNotes";
import { groupReleaseNotesByDay } from "../../src/common/ReleaseNotes";

function note(id: string, date: string): ReleaseNote {
    return { id: id.repeat(40), date, author: "Contributor", type: "feat", description: "something" };
}

describe("release notes by day", () => {
    const now = new Date("2026-11-03T21:00:00+01:00");
    const options = { locale: "fr-FR", timeZone: "Europe/Paris", now };

    it("groups the notes under today, yesterday, then the long date, in their order", () => {
        const days = groupReleaseNotesByDay(
            [
                note("a", "2026-11-03T20:11:00+01:00"),
                note("b", "2026-11-03T08:57:00+01:00"),
                note("c", "2026-11-02T22:43:00+01:00"),
                note("d", "2026-11-01T02:55:00+01:00"),
            ],
            options,
        );

        expect(days.map((day) => [day.label, day.notes.length])).toEqual([
            ["aujourd’hui", 2],
            ["hier", 1],
            ["1 novembre 2026", 1],
        ]);
    });

    it("uses the day of the viewer's time zone", () => {
        const [day] = groupReleaseNotesByDay([note("a", "2026-11-02T23:30:00Z")], options);

        expect(day?.label).toBe("aujourd’hui");
    });
});
