<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import type { UserInputManager } from "../../Phaser/UserInput/UserInputManager";
    import PopUpContainer from "./PopUpContainer.svelte";

    interface Props {
        message: string;
        onclick: () => void;
        userInputManager: UserInputManager;
    }

    let { message, onclick, userInputManager }: Props = $props();

    // One listener for the life of the popup, calling the current action: a popup shown again under the same uuid
    // keeps this component and only gets new props (see popupStore.addPopup).
    const onSpace = (): void => onclick();

    onMount(() => {
        userInputManager.addSpaceEventListener(onSpace);
    });

    onDestroy(() => {
        userInputManager.removeSpaceEventListener(onSpace);
    });
</script>

<PopUpContainer reduceOnSmallScreen={true} {onclick}>
    {message}
</PopUpContainer>
