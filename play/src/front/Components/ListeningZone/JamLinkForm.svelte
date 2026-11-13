<script lang="ts">
    import { onMount } from "svelte";
    import { isSpotifyJamUrl } from "@workadventure/map-editor";
    import { LL } from "../../../i18n/i18n-svelte";
    import Input from "../Input/Input.svelte";
    import Button from "../UI/Button.svelte";

    interface Props {
        id: string;
        /** A valid Spotify Jam invite link, trimmed. */
        onreplace: (url: string) => void;
        oncancel: () => void;
    }

    let { id, onreplace, oncancel }: Props = $props();

    let form: HTMLFormElement | undefined = $state();
    let jamUrl = $state("");
    let invalidLink = $state(false);

    // Opened on purpose to paste a link: the field takes the focus right away.
    onMount(() => {
        form?.querySelector<HTMLInputElement>("input")?.focus();
    });

    function submit(event: SubmitEvent): void {
        event.preventDefault();
        const url = jamUrl.trim();
        if (!isSpotifyJamUrl(url)) {
            invalidLink = true;
            return;
        }
        onreplace(url);
    }
</script>

<form class="flex flex-col gap-2" onsubmit={submit} bind:this={form} data-testid="jam-link-replace-form">
    <Input
        {id}
        type="url"
        size="sm"
        placeholder={$LL.spotify.listeningZone.sharePlaceholder()}
        bind:value={jamUrl}
        status={invalidLink ? "error" : undefined}
        oninput={() => (invalidLink = false)}
    />
    <!-- The url variant of Input does not render its error helper text. -->
    {#if invalidLink}
        <p class="m-0 text-xs text-red-500" role="alert">{$LL.spotify.listeningZone.invalidLink()}</p>
    {/if}
    <div class="flex justify-end gap-2">
        <Button variant="light" appearance="ghost" size="sm" onclick={oncancel}>
            {$LL.spotify.listeningZone.cancel()}
        </Button>
        <Button variant="success" size="sm" type="submit" dataTestId="jam-link-replace-submit">
            {$LL.spotify.listeningZone.jamStatus.replaceSubmit()}
        </Button>
    </div>
</form>
