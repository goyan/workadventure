import { describe, expect, it } from "vitest";
import { formatReleaseNoteDate } from "../../src/common/ReleaseNotes";

describe("release note date", () => {
    // 2026-10-30 16:34:39 in Paris (UTC+1 after the clocks change)
    const date = "2026-10-30T16:34:39+01:00";

    it("shows the day and the time in the viewer's language", () => {
        const formatted = formatReleaseNoteDate(date, "fr-FR", "Europe/Paris");

        expect(formatted).toContain("30");
        expect(formatted).toContain("2026");
        expect(formatted).toContain("16:34");
    });

    it("uses the 12-hour clock where the language does", () => {
        const formatted = formatReleaseNoteDate(date, "en-US", "Europe/Paris");

        expect(formatted).toMatch(/4:34\s?PM/);
    });

    it("converts the time to the viewer's time zone", () => {
        const formatted = formatReleaseNoteDate(date, "fr-FR", "America/New_York");

        expect(formatted).toContain("11:34");
    });
});
