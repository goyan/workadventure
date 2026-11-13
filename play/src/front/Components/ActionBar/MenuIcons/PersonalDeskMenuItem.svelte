<script lang="ts">
    import ActionBarButton from "../ActionBarButton.svelte";
    import { personalDeskModeStore } from "../../../Stores/PersonalDeskStore";
    import { bindingKeys, shortcutsStore } from "../../../Stores/ShortcutsStore";
    import LL from "../../../../i18n/i18n-svelte";
    import { findFreeDesk, goToPersonalDesk } from "./personalDeskActions";
    import { IconDesk } from "@wa-icons";

    let mode = $derived($personalDeskModeStore);

    let title = $derived(
        mode === "find"
            ? $LL.actionbar.personalDesk.find()
            : mode === "seated"
              ? $LL.actionbar.help.personalDesk.insideTitle()
              : mode === "sit"
                ? $LL.actionbar.personalDesk.sit()
                : $LL.actionbar.personalDesk.label(),
    );

    let desc = $derived(
        mode === "find"
            ? $LL.actionbar.help.personalDesk.findDesc()
            : mode === "seated"
              ? $LL.actionbar.help.personalDesk.insideDesc()
              : mode === "sit"
                ? $LL.actionbar.help.personalDesk.sitDesc()
                : $LL.actionbar.help.personalDesk.desc(),
    );

    // The walkMyDesk shortcut can be rebound or removed in the shortcuts menu.
    let shortcut = $derived.by(() => {
        const binding = $shortcutsStore.walkMyDesk;
        return (mode === "walk" || mode === "sit") && binding
            ? bindingKeys(binding, $LL.menu.shortcuts.keyNames.shift())
            : [];
    });

    function onclick(): void {
        if (mode === "find") {
            findFreeDesk();
        } else if (mode === "walk" || mode === "sit") {
            goToPersonalDesk().catch((error: unknown) => console.error("Error while walking to personal desk", error));
        }
    }
</script>

<!-- Shown from @md only: the contextual group cannot shrink, and on a bar just above @sm a third fixed button there
     would push the profile menu out of the right bar. Outils keeps "Walk to my desk" below that width. -->
<ActionBarButton
    {onclick}
    classList="group/btn-desk hidden @md/actions:block"
    tooltipTitle={title}
    {desc}
    tooltipShortcuts={shortcut}
    state={mode === "seated" ? "disabled" : "normal"}
    dataTestId="desk-action-bar-button"
>
    <IconDesk font-size="20" />
</ActionBarButton>
