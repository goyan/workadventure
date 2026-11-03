import { expect, test, type Page } from "@playwright/test";
import Map from "./utils/map";
import { getPage } from "./utils/auth";
import { isMobile } from "./utils/isMobile";
import { resetWamMaps } from "./utils/map-editor/uploader";
import AreaLivekit from "./utils/AreaLivekit";
import Menu from "./utils/menu";

const IN_A_MEETING = "In a meeting";

async function expectInMeeting(page: Page, inMeeting: boolean) {
    await Menu.openMenu(page);
    const meetingStatus = page.locator(".status-button").getByText(IN_A_MEETING);
    if (inMeeting) {
        await expect(meetingStatus).toBeVisible({ timeout: 20_000 });
    } else {
        await expect(meetingStatus).toBeHidden({ timeout: 20_000 });
    }
    await Menu.closeMenu(page);
}

test.describe("Meeting area started only with someone else @nomobile @nowebkit @nofirefox", () => {
    test.beforeEach(
        "Map editor is not available on mobile, WebKit and Firefox have camera issues",
        ({ page, browser }) => {
            test.skip(
                isMobile(page) || ["webkit", "firefox"].includes(browser.browserType().name()),
                "Map editor is not available on mobile, WebKit and Firefox have camera issues",
            );
        },
    );

    test("alone keeps the usual status, a second player starts the meeting, leaving ends it @oidc", async ({
        browser,
        request,
    }) => {
        await resetWamMaps(request);
        await using admin = await getPage(browser, "Admin1", Map.url("empty"));
        await Map.teleportToPosition(admin, 0, 0);
        await AreaLivekit.openAreaEditorAndAddAreaLivekit(admin);
        await Menu.closeMapEditor(admin);

        // Alone in the meeting area: no meeting, and the status can be chosen as anywhere else.
        await Map.teleportToPosition(admin, AreaLivekit.entityPositionInArea.x, AreaLivekit.entityPositionInArea.y);
        await expectInMeeting(admin, false);
        // Choosing a status closes the menu.
        await Menu.openMenu(admin);
        await Menu.clickOnStatus(admin, "Busy");
        await Menu.closeAllowNotificationsPopUpIfAsked(admin);
        await Menu.openMenu(admin);
        await Menu.expectSelectedStatus(admin, "Busy");
        await Menu.clickOnStatus(admin, "Online");
        await Menu.openMenu(admin);
        await Menu.expectSelectedStatus(admin, "Online");
        await Menu.closeMenu(admin);

        // Someone near the area, but outside it, does not start the meeting.
        await using alice = await getPage(browser, "Alice", Map.url("empty"));
        await Map.teleportToPosition(alice, 0, 7 * 32);
        await expectInMeeting(admin, false);
        await expectInMeeting(alice, false);

        // Entering where someone already is starts the meeting for both.
        await Map.teleportToPosition(alice, 6 * 32, 3 * 32);
        await expectInMeeting(alice, true);
        await expectInMeeting(admin, true);

        // Alone again: the meeting ends, for the one who left and for the one who stayed.
        await Map.teleportToPosition(alice, 0, 7 * 32);
        await expectInMeeting(alice, false);
        await expectInMeeting(admin, false);
        await Menu.openMenu(admin);
        await Menu.expectSelectedStatus(admin, "Online");
        await Menu.closeMenu(admin);
    });
});
