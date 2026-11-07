import { expect, test } from "@playwright/test";
import Map from "./utils/map";
import { resetWamMaps } from "./utils/map-editor/uploader";
import Menu from "./utils/menu";
import AreaAccessRights from "./utils/areaAccessRights";
import { getPage } from "./utils/auth";
import { isMobile } from "./utils/isMobile";

test.setTimeout(240_000);

test.describe("Personal desk and last position on reconnect @oidc @nomobile @nowebkit", () => {
    test.beforeEach(({ page }) => {
        test.skip(isMobile(page), "Map editor is not available on mobile");
    });

    test.beforeEach(({ browserName }) => {
        test.skip(browserName === "webkit", "WebKit has issues with camera/microphone");
    });

    test("Reload preserves the last position outside the personal desk", async ({ browser, request }) => {
        // Given: Admin creates a personal area (dynamic claim). Member1 connects, enters the area and claims it.
        // When: Member1 leaves the desk and reloads, the last position is restored.

        await resetWamMaps(request);

        const areaCenterX = 4 * 32;
        const areaCenterY = 4 * 32;

        await using adminPage = await getPage(browser, "Admin1", Map.url("empty"));

        await Menu.openMapEditor(adminPage);
        await AreaAccessRights.openAreaEditorAndAddPersonalAreaWithDynamicClaim(adminPage);
        await Menu.closeMapEditor(adminPage);

        await adminPage.close();

        await using memberPage = await getPage(browser, "Member1", Map.url("empty"));

        await Map.teleportToPosition(memberPage, areaCenterX, areaCenterY);

        await expect(memberPage.getByTestId("claimPersonalAreaButton")).toBeVisible({ timeout: 15_000 });
        await memberPage.getByTestId("claimPersonalAreaButton").click();

        await Map.teleportToPosition(memberPage, 10 * 32, 10 * 32);

        // A reload must not send the user back to their desk.
        await memberPage.reload();

        await Menu.waitForMapLoad(memberPage);
        await expect.poll(() => Map.getPosition(memberPage)).toEqual({ x: 10 * 32, y: 10 * 32 });

        await Menu.openMapMenu(memberPage);
        const goToDeskButton = memberPage.getByTestId("go-to-personal-desk-button");
        await expect(goToDeskButton).toBeVisible({ timeout: 15_000 });
        await expect(goToDeskButton).not.toHaveClass(/opacity-50|cursor-not-allowed/);
        await Menu.closeMapMenu(memberPage);
        await memberPage.getByTestId("teleport-to-personal-desk").click();
        await Menu.openMapMenu(memberPage);
        await expect(goToDeskButton).toHaveClass(/opacity-50|cursor-not-allowed/);
    });
});
