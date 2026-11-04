<script lang="ts">
    import { tick } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import { settingsSubMenuTargetStore } from "../../Stores/MenuStore";
    import { getSpotifyRedirectUri, SpotifyLinkError, spotifyAccount } from "../../Spotify/SpotifyAccount";
    import { desktopSpotifyPlayer } from "../../Spotify/LocalSpotifyPlayer";
    import {
        spotifyClientIdStore,
        spotifyPersonalClientIdStore,
        spotifySharingEnabledStore,
    } from "../../Spotify/SpotifySettingsStore";
    import InputSwitch from "../Input/InputSwitch.svelte";
    import Input from "../Input/Input.svelte";
    import Button from "../UI/Button.svelte";
    import SettingsSection from "./SettingsSection.svelte";
    import { IconBrandSpotify } from "@wa-icons";

    const linked = spotifyAccount.linked;
    const accessDenied = spotifyAccount.accessDenied;
    const redirectUri = getSpotifyRedirectUri();
    // The desktop app reads the Spotify app of this computer: no account, no developer app, no Premium. Linking an
    // account there is optional, for music played on another device (phone, web player, speaker).
    const readsLocalPlayer = desktopSpotifyPlayer() !== undefined;
    const DESKTOP_APP_URL = "https://github.com/aminekun90/workadventure-desktop/releases/latest";

    let linking = $state(false);
    let errorMessage: string | undefined = $state(undefined);
    let sharing = $state($spotifySharingEnabledStore);
    let personalClientId = $state($spotifyPersonalClientIdStore);
    let showPersonalApp = $state($spotifyPersonalClientIdStore !== "");
    // Under the desktop app, linking an account only adds other devices: kept out of the way until asked for.
    let showOtherDevices = $state(!readsLocalPlayer || $spotifyPersonalClientIdStore !== "");
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

<SettingsSection
    title={$LL.spotify.settings.title()}
    description={readsLocalPlayer ? $LL.spotify.settings.desktopDetected() : $LL.spotify.settings.description()}
    bind:element={section}
    dataTestId="spotify-settings"
>
    {#snippet icon()}<IconBrandSpotify />{/snippet}
    <div class="flex flex-col gap-3">
        {#if $linked}
            <div class="flex items-center gap-3">
                <span class="grow text-sm">{$LL.spotify.settings.linked()}</span>
                <Button variant="light" appearance="border" size="sm" onclick={() => spotifyAccount.unlink()}>
                    {$LL.spotify.settings.unlink()}
                </Button>
            </div>
            {#if $accessDenied}
                <p class="text-sm text-warning m-0" data-testid="spotify-access-denied">
                    {$LL.spotify.settings.accessDenied()}
                </p>
            {/if}
        {:else if showOtherDevices}
            {#if readsLocalPlayer}
                <p class="text-sm text-white/75 m-0" data-testid="spotify-desktop-link-hint">
                    {$LL.spotify.settings.desktopLinkOtherDevices()}
                </p>
            {:else}
                <p class="text-sm text-white/75 m-0" data-testid="spotify-desktop-app-hint">
                    {$LL.spotify.settings.desktopAppHint()}
                    <a class="underline" href={DESKTOP_APP_URL} target="_blank" rel="noopener noreferrer">
                        {$LL.spotify.settings.desktopAppLink()}
                    </a>
                </p>
            {/if}
            {#if usesServerApp}
                <p class="text-sm text-white/75 m-0">{$LL.spotify.settings.serverAppNotice()}</p>
            {/if}
            <Button
                variant={readsLocalPlayer ? "light" : "success"}
                appearance={readsLocalPlayer ? "border" : undefined}
                disabled={linking}
                onclick={link}
                dataTestId="spotify-link-button"
            >
                {linking ? $LL.spotify.settings.linking() : $LL.spotify.settings.link()}
            </Button>
        {/if}
        {#if readsLocalPlayer && !$linked && !showOtherDevices}
            <button
                type="button"
                class="m-0 self-start bg-transparent p-0 text-sm text-white/60 underline hover:text-white"
                onclick={() => (showOtherDevices = true)}
                data-testid="spotify-other-devices"
            >
                {$LL.spotify.settings.otherDevices()}
            </button>
        {/if}
        {#if readsLocalPlayer || $linked}
            <InputSwitch
                id="spotify-sharing-toggle"
                bind:value={sharing}
                onchange={() => spotifySharingEnabledStore.set(sharing)}
                label={$LL.spotify.settings.share()}
            />
        {/if}

        {#if errorMessage}
            <p class="text-sm text-danger m-0">{errorMessage}</p>
        {/if}

        {#if !$linked && showOtherDevices}
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
        {/if}
    </div>
</SettingsSection>
