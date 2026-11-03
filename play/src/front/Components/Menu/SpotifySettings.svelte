<script lang="ts">
    import { tick } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import { settingsSubMenuTargetStore } from "../../Stores/MenuStore";
    import { getSpotifyRedirectUri, SpotifyLinkError, spotifyAccount } from "../../Spotify/SpotifyAccount";
    import {
        spotifyClientIdStore,
        spotifyPersonalClientIdStore,
        spotifySharingEnabledStore,
    } from "../../Spotify/SpotifySettingsStore";
    import InputSwitch from "../Input/InputSwitch.svelte";
    import Input from "../Input/Input.svelte";
    import Button from "../UI/Button.svelte";
    import { IconBrandSpotify } from "@wa-icons";

    const linked = spotifyAccount.linked;
    const accessDenied = spotifyAccount.accessDenied;
    const redirectUri = getSpotifyRedirectUri();

    let linking = $state(false);
    let errorMessage: string | undefined = $state(undefined);
    let sharing = $state($spotifySharingEnabledStore);
    let personalClientId = $state($spotifyPersonalClientIdStore);
    let showPersonalApp = $state($spotifyPersonalClientIdStore !== "");
    let section: HTMLElement | undefined = $state(undefined);
    // The app of this server only accepts the accounts an admin registered in its Spotify dashboard.
    let usesServerApp = $derived($spotifyPersonalClientIdStore.trim() === "" && $spotifyClientIdStore !== undefined);

    $effect(() => {
        if ($settingsSubMenuTargetStore !== "spotify") {
            return;
        }
        tick()
            .then(() => {
                section?.scrollIntoView({ block: "start" });
                settingsSubMenuTargetStore.set(undefined);
            })
            .catch((e) => console.error("Failed to scroll to Spotify settings", e));
    });

    function errorText(error: unknown): string {
        if (!(error instanceof SpotifyLinkError)) {
            return $LL.spotify.settings.errors.failed();
        }
        return $LL.spotify.settings.errors[error.reason]();
    }

    function link(): void {
        const clientId = $spotifyClientIdStore;
        if (!clientId) {
            errorMessage = $LL.spotify.settings.errors.noClientId();
            showPersonalApp = true;
            return;
        }
        errorMessage = undefined;
        linking = true;
        // Not awaited before the call: the popup must open within the click.
        spotifyAccount
            .link(clientId)
            .catch((error: unknown) => {
                console.warn("Spotify link failed", error);
                errorMessage = errorText(error);
            })
            .finally(() => {
                linking = false;
            });
    }
</script>

<section bind:this={section} class="flex flex-col p-0 first:pt-0 pt-8 m-0" data-testid="spotify-settings">
    <div class="group bg-contrast font-bold text-lg p-4 flex items-center relative">
        <div class="me-4 opacity-50"><IconBrandSpotify /></div>
        <div class="grow">
            <div>{$LL.spotify.settings.title()}</div>
            <div class="text-sm italic text-white/50">{$LL.spotify.settings.description()}</div>
        </div>
    </div>

    <div class="flex flex-col gap-3 m-4">
        {#if $linked}
            <div class="flex items-center gap-3">
                <span class="grow text-sm">{$LL.spotify.settings.linked()}</span>
                <Button variant="light" appearance="border" size="sm" onclick={() => spotifyAccount.unlink()}>
                    {$LL.spotify.settings.unlink()}
                </Button>
            </div>
            <InputSwitch
                id="spotify-sharing-toggle"
                bind:value={sharing}
                onchange={() => spotifySharingEnabledStore.set(sharing)}
                label={$LL.spotify.settings.share()}
            />
            {#if $accessDenied}
                <p class="text-sm text-warning m-0" data-testid="spotify-access-denied">
                    {$LL.spotify.settings.accessDenied()}
                </p>
            {/if}
        {:else}
            {#if usesServerApp}
                <p class="text-sm text-white/75 m-0">{$LL.spotify.settings.serverAppNotice()}</p>
            {/if}
            <Button variant="success" disabled={linking} onclick={link} dataTestId="spotify-link-button">
                {linking ? $LL.spotify.settings.linking() : $LL.spotify.settings.link()}
            </Button>
        {/if}

        {#if errorMessage}
            <p class="text-sm text-danger m-0">{errorMessage}</p>
        {/if}

        <InputSwitch
            id="spotify-personal-app-toggle"
            bind:value={showPersonalApp}
            label={$LL.spotify.settings.personalApp.title()}
        />
        {#if showPersonalApp}
            <div class="flex flex-col gap-2 text-sm text-white/75">
                <p class="m-0">{$LL.spotify.settings.personalApp.explanation()}</p>
                <ol class="m-0 ps-5 flex flex-col gap-1">
                    <li>{$LL.spotify.settings.personalApp.step1()}</li>
                    <li class="break-all">{$LL.spotify.settings.personalApp.step2({ redirectUri })}</li>
                    <li>{$LL.spotify.settings.personalApp.step3()}</li>
                </ol>
                <Input
                    id="spotify-personal-client-id"
                    label={$LL.spotify.settings.personalApp.clientIdLabel()}
                    placeholder={$LL.spotify.settings.personalApp.clientIdPlaceholder()}
                    bind:value={personalClientId}
                    onchange={() => spotifyPersonalClientIdStore.set(personalClientId)}
                />
            </div>
        {/if}
    </div>
</section>
