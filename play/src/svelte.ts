import "./front/style/index.css";
// Puts the palette of the menu theme on <html>, so that every themed menu follows it from the start.
import "./front/Stores/RetroThemeStore";

import { mount } from "svelte";
import App from "./front/Components/App.svelte";
import { HtmlUtils } from "./front/WebRtc/HtmlUtils";
import { e2eHooks } from "./front/Utils/E2EHooks";

// Initialize E2E hooks
declare global {
    interface Window {
        e2eHooks: typeof e2eHooks;
    }
}
window.e2eHooks = e2eHooks;

const app = mount(App, {
    target: HtmlUtils.getElementByIdOrFail("app"),
});

export default app;
