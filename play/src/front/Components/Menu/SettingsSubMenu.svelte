<script lang="ts">
    import { tick } from "svelte";
    import { fly } from "svelte/transition";
    import type { NoiseSuppressionEngine, NoiseSuppressionProvider } from "../../Connection/LocalUserStore";
    import {
        audioManagerFileStore,
        audioManagerVisibilityStore,
        audioManagerVolumeStore,
        bubbleSoundStore,
    } from "../../Stores/AudioManagerStore";
    import { HtmlUtils } from "../../WebRtc/HtmlUtils";
    import { LL, locale } from "../../../i18n/i18n-svelte";
    import type { Locales } from "../../../i18n/i18n-types";
    import { displayableLocales, setCurrentLocale } from "../../Utils/locales";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { Room } from "../../Connection/Room";

    import { analyticsClient } from "../../Administration/AnalyticsClient";
    import { localUserStore } from "../../Connection/LocalUserStore";
    import { videoQualityStore } from "../../Stores/MediaStore";
    import { browserNotificationStore } from "../../Stores/BrowserNotificationStore";
    import { helpNotificationSettingsVisibleStore } from "../../Stores/HelpSettingsStore";
    import { screenShareQualityStore } from "../../Stores/ScreenSharingStore";
    import { volumeProximityDiscussionStore } from "../../Stores/PeerStore";
    import { bandwidthConstrainedPreferenceStore } from "../../Stores/BandwidthConstrainedPreferenceStore";
    import { settingsSubMenuTargetStore } from "../../Stores/MenuStore";
    import {
        browserNoiseSuppressionSupportedStore,
        effectiveNoiseSuppressionProviderStore,
        microphoneAutoGainControlStore,
        microphoneBrowserNoiseSuppressionStore,
        microphoneEchoCancellationStore,
        noiseSuppressionEnabledStore,
        noiseSuppressionProviderStore,
        noiseSuppressionEngineStore,
        noiseSuppressionStateStore,
        voiceIsolationSupportedStore,
    } from "../../Stores/NoiseSuppressionStore";
    import InputSwitch from "../Input/InputSwitch.svelte";
    import RangeSlider from "../Input/RangeSlider.svelte";
    import SoundSelect from "../Input/SoundSelect.svelte";
    import { displayVideoQualityStore } from "../../Stores/DisplayVideoQualityStore";
    import InputRadioBox from "../Input/InputRadioBox.svelte";
    import Select from "../Input/Select.svelte";
    import Chip from "../UI/Chip.svelte";
    import SpotifySettings from "./SpotifySettings.svelte";
    import SegmentedControl from "./SegmentedControl.svelte";
    import SettingsSection from "./SettingsSection.svelte";
    import ThemeSettings from "./ThemeSettings.svelte";
    import {
        IconAntennaBarsLow,
        IconAntennaBarsMid,
        IconAntennaBarsHigh,
        IconAdjustements,
        IconLanguage,
        IconDoorExit,
        IconScreenShare,
        IconCameraUp,
        IconMicrophoneOn,
    } from "@wa-icons";

    let fullscreen: boolean = $state(localUserStore.getFullscreen());
    let notification: boolean = $state(localUserStore.getNotification());
    let allowPictureInPicture: boolean = $state(localUserStore.getAllowPictureInPicture());
    let blockAudio: boolean = $state(localUserStore.getBlockAudio());
    let forceCowebsiteTrigger: boolean = $state(localUserStore.getForceCowebsiteTrigger());
    let ignoreFollowRequests: boolean = $state(localUserStore.getIgnoreFollowRequests());
    let decreaseAudioPlayerVolumeWhileTalking: boolean = $state(
        localUserStore.getDecreaseAudioPlayerVolumeWhileTalking(),
    );
    let disableAnimations: boolean = $state(localUserStore.getDisableAnimations());
    let valueLocale: string = $state($locale);
    let valueCameraPrivacySettings = $state(
        localUserStore.getCameraPrivacySettings(
            gameManager.currentStartedRoomOrNull?.defaultCameraPrivacySettings ?? Room.DEFAULT_CAMERA_PRIVACY_SETTINGS,
        ),
    );
    let valueMicrophonePrivacySettings = $state(
        localUserStore.getMicrophonePrivacySettings(
            gameManager.currentStartedRoomOrNull?.defaultMicrophonePrivacySettings ??
                Room.DEFAULT_MICROPHONE_PRIVACY_SETTINGS,
        ),
    );
    const initialVideoQuality = localUserStore.getVideoQuality();
    let valueVideoQuality = $state(initialVideoQuality === "high" ? 3 : initialVideoQuality === "low" ? 1 : 2);
    const initialScreenShareQuality = localUserStore.getScreenShareQuality();
    let valueScreenShareQuality = $state(
        initialScreenShareQuality === "high" ? 3 : initialScreenShareQuality === "low" ? 1 : 2,
    );
    let bandwidthConstrainedPreference = $state(localUserStore.getBandwidthConstrainedScreenSharePreference());
    let selectedNoiseSuppressionProvider: NoiseSuppressionProvider = $derived($effectiveNoiseSuppressionProviderStore);
    let microphoneSettingsSection: HTMLElement | undefined = $state();

    let volumeProximityDiscussion = $state(localUserStore.getVolumeProximityDiscussion());

    let previewCameraPrivacySettings = $state((() => valueCameraPrivacySettings)());
    let previewMicrophonePrivacySettings = $state((() => valueMicrophonePrivacySettings)());

    let valueBubbleSound = $state(localUserStore.getBubbleSound());
    let videoQualityStats = $state(localUserStore.getDisplayVideoQualityStats());

    async function updateLocale() {
        await setCurrentLocale(valueLocale as Locales);
    }

    function updateVideoQuality() {
        let value: "low" | "recommended" | "high";

        switch (valueVideoQuality) {
            case 1:
                value = "low";
                break;
            case 3:
                value = "high";
                break;
            default:
                value = "recommended";
                break;
        }

        videoQualityStore.setQuality(value);
    }

    function updateScreenShareQuality() {
        let value: "low" | "recommended" | "high";

        switch (valueScreenShareQuality) {
            case 1:
                value = "low";
                break;
            case 3:
                value = "high";
                break;
            default:
                value = "recommended";
                break;
        }

        screenShareQualityStore.setQuality(value);
    }

    function updateBandwidthConstrainedPreference() {
        bandwidthConstrainedPreferenceStore.setPreference(bandwidthConstrainedPreference);
    }

    $effect(() => {
        selectedNoiseSuppressionProvider = $effectiveNoiseSuppressionProviderStore;
    });

    $effect(() => {
        if ($settingsSubMenuTargetStore !== "microphone") {
            return;
        }
        tick()
            .then(() => {
                microphoneSettingsSection?.scrollIntoView({ block: "start" });
                settingsSubMenuTargetStore.set(undefined);
            })
            .catch((e) => console.error("Failed to scroll to microphone settings", e));
    });

    function toggleMicrophoneAutoGainControl() {
        microphoneAutoGainControlStore.setEnabled(!$microphoneAutoGainControlStore);
    }

    function toggleMicrophoneEchoCancellation() {
        microphoneEchoCancellationStore.setEnabled(!$microphoneEchoCancellationStore);
    }

    function toggleMicrophoneBrowserNoiseSuppression() {
        microphoneBrowserNoiseSuppressionStore.setEnabled(!$microphoneBrowserNoiseSuppressionStore);
    }

    function toggleNoiseSuppression() {
        noiseSuppressionEnabledStore.setEnabled(!$noiseSuppressionEnabledStore);
    }

    function updateNoiseSuppressionProvider() {
        noiseSuppressionProviderStore.setProvider(selectedNoiseSuppressionProvider);
    }

    function updateNoiseSuppressionEngine(event: Event) {
        const value = (event.target as HTMLSelectElement).value;
        noiseSuppressionEngineStore.setEngine(value === "dtln" ? "dtln" : "deepfilternet");
    }

    const noiseSuppressionEngineOptions: { value: NoiseSuppressionEngine; label: string }[] = $derived([
        { value: "deepfilternet", label: $LL.menu.settings.microphone.noiseSuppressionEngineDeepFilterNet() },
        { value: "dtln", label: $LL.menu.settings.microphone.noiseSuppressionEngineDtln() },
    ]);

    function changeFullscreen() {
        // Analytics Client
        analyticsClient.trackAdminEvent("settings.fullscreen.changed", { value: fullscreen ? "true" : "false" });

        const body = HtmlUtils.querySelectorOrFail("body");
        if (body) {
            if (document.fullscreenElement !== null && !fullscreen) {
                document.exitFullscreen().catch((e) => console.error(e));
            } else {
                document.documentElement.requestFullscreen().catch((e) => console.error(e));
            }
            localUserStore.setFullscreen(fullscreen);
        }
    }

    function changeNotification() {
        // Analytics Client
        analyticsClient.trackAdminEvent("settings.notification.changed", { value: notification ? "true" : "false" });

        // Turning notifications off never needs the permission.
        if (!notification || Notification.permission === "granted") {
            localUserStore.setNotification(notification);
            browserNotificationStore.refresh();
        } else {
            Notification.requestPermission()
                .then((response) => {
                    if (response === "granted") {
                        localUserStore.setNotification(notification);
                    } else {
                        localUserStore.setNotification(false);
                        notification = false;
                        // The browser does not ask again once denied: explain how to unblock notifications.
                        if (response === "denied") {
                            helpNotificationSettingsVisibleStore.set(true);
                        }
                    }
                    browserNotificationStore.refresh();
                })
                .catch((e) => console.error(e));
        }
    }

    function changePictureInPicture() {
        // Analytics Client
        analyticsClient.trackAdminEvent("settings.picture_in_picture.changed", {
            value: allowPictureInPicture ? "true" : "false",
        });

        localUserStore.setAllowPictureInPicture(allowPictureInPicture);
    }

    function changeBlockAudio() {
        if (blockAudio) {
            audioManagerFileStore.unloadAudio();
            audioManagerVisibilityStore.set("disabledBySettings");
        }
        localUserStore.setBlockAudio(blockAudio);
    }

    function changeForceCowebsiteTrigger() {
        // Analytics Client
        analyticsClient.trackAdminEvent("settings.ask_website.changed", {
            value: forceCowebsiteTrigger ? "true" : "false",
        });

        localUserStore.setForceCowebsiteTrigger(forceCowebsiteTrigger);
    }

    function changeIgnoreFollowRequests() {
        // Analytics Client
        analyticsClient.trackAdminEvent("settings.request_follow.changed", {
            value: ignoreFollowRequests ? "true" : "false",
        });

        localUserStore.setIgnoreFollowRequests(ignoreFollowRequests);
    }

    function changeDecreaseAudioPlayerVolumeWhileTalking() {
        // Analytics Client
        analyticsClient.trackAdminEvent("settings.decrease_audio_volume.changed", {
            value: decreaseAudioPlayerVolumeWhileTalking ? "true" : "false",
        });

        localUserStore.setDecreaseAudioPlayerVolumeWhileTalking(decreaseAudioPlayerVolumeWhileTalking);
        audioManagerVolumeStore.setDecreaseWhileTalking(decreaseAudioPlayerVolumeWhileTalking);
    }

    function changeDisableAnimations() {
        localUserStore.setDisableAnimations(disableAnimations);
        gameManager.getCurrentGameScene().setTileAnimationsPaused(disableAnimations);
    }

    function changeCameraPrivacySettings() {
        // Analytics Client
        analyticsClient.trackAdminEvent("settings.camera.changed", {
            value: valueCameraPrivacySettings ? "true" : "false",
        });

        if (valueCameraPrivacySettings !== previewCameraPrivacySettings) {
            previewCameraPrivacySettings = valueCameraPrivacySettings;
            localUserStore.setCameraPrivacySettings(valueCameraPrivacySettings);
        }
    }

    function changeMicrophonePrivacySettings() {
        // Analytics Client
        analyticsClient.trackAdminEvent("settings.microphone.changed", {
            value: valueMicrophonePrivacySettings ? "true" : "false",
        });

        if (valueMicrophonePrivacySettings !== previewMicrophonePrivacySettings) {
            previewMicrophonePrivacySettings = valueMicrophonePrivacySettings;
            localUserStore.setMicrophonePrivacySettings(valueMicrophonePrivacySettings);
        }
    }

    function updateVolumeProximityDiscussion() {
        analyticsClient.trackAdminEvent("settings.audio_volume.opened");
        localUserStore.setVolumeProximityDiscussion(volumeProximityDiscussion);
        volumeProximityDiscussionStore.set(volumeProximityDiscussion);
    }

    function changeBubbleSound() {
        localUserStore.setBubbleSound(valueBubbleSound);
        bubbleSoundStore.set(valueBubbleSound);
    }

    function changeVideoQualityStats() {
        localUserStore.setDisplayVideoQualityStats(videoQualityStats);
        displayVideoQualityStore.set(videoQualityStats);
    }

    function getBubbleSoundUrl(bubbleSound: string): string {
        return `/resources/objects/webrtc-in-${bubbleSound}.mp3`;
    }
</script>

<div class="flex flex-col gap-4 pb-4" transition:fly={{ x: -700, duration: 250 }}>
    <SettingsSection title={$LL.menu.settings.theme.label()} dataTestId="theme-settings">
        <ThemeSettings />
    </SettingsSection>

    <SettingsSection title={$LL.menu.settings.videoBandwidth.title()}>
        {#snippet icon()}<IconCameraUp />{/snippet}
        <div>
            <SegmentedControl
                ariaLabel={$LL.menu.settings.videoBandwidth.title()}
                bind:value={valueVideoQuality}
                onchange={updateVideoQuality}
                dataTestId="video-quality-control"
                options={[
                    { value: 1, label: $LL.menu.settings.videoBandwidth.low(), icon: IconAntennaBarsLow },
                    { value: 2, label: $LL.menu.settings.videoBandwidth.recommended(), icon: IconAntennaBarsMid },
                    { value: 3, label: $LL.menu.settings.videoBandwidth.high(), icon: IconAntennaBarsHigh },
                ]}
            />
        </div>
    </SettingsSection>

    <SettingsSection title={$LL.menu.settings.shareScreenBandwidth.title()}>
        {#snippet icon()}<IconScreenShare />{/snippet}
        <div>
            <SegmentedControl
                ariaLabel={$LL.menu.settings.shareScreenBandwidth.title()}
                bind:value={valueScreenShareQuality}
                onchange={updateScreenShareQuality}
                dataTestId="screen-share-quality-control"
                options={[
                    { value: 1, label: $LL.menu.settings.shareScreenBandwidth.low(), icon: IconAntennaBarsLow },
                    { value: 2, label: $LL.menu.settings.shareScreenBandwidth.recommended(), icon: IconAntennaBarsMid },
                    { value: 3, label: $LL.menu.settings.shareScreenBandwidth.high(), icon: IconAntennaBarsHigh },
                ]}
            />
        </div>
        <div class="flex flex-col gap-3">
            <p class="m-0 text-sm font-bold text-white/90">
                {$LL.menu.settings.bandwidthConstrainedPreference.title()}
            </p>
            <div class="grid grid-cols-1 items-stretch gap-3 @lg/main-layout:grid-cols-3">
                <InputRadioBox
                    value="maintain-resolution"
                    label={$LL.menu.settings.bandwidthConstrainedPreference.maintainResolutionTitle()}
                    bind:group={bandwidthConstrainedPreference}
                    onchange={updateBandwidthConstrainedPreference}
                    outerClass="flex-1"
                >
                    {$LL.menu.settings.bandwidthConstrainedPreference.maintainResolutionDescription()}
                </InputRadioBox>
                <InputRadioBox
                    value="maintain-framerate"
                    label={$LL.menu.settings.bandwidthConstrainedPreference.maintainFramerateTitle()}
                    bind:group={bandwidthConstrainedPreference}
                    onchange={updateBandwidthConstrainedPreference}
                    outerClass="flex-1"
                >
                    {$LL.menu.settings.bandwidthConstrainedPreference.maintainFramerateDescription()}
                </InputRadioBox>
                <InputRadioBox
                    value="balanced"
                    label={$LL.menu.settings.bandwidthConstrainedPreference.balancedTitle()}
                    bind:group={bandwidthConstrainedPreference}
                    onchange={updateBandwidthConstrainedPreference}
                    outerClass="flex-1"
                >
                    {$LL.menu.settings.bandwidthConstrainedPreference.balancedDescription()}
                </InputRadioBox>
            </div>
        </div>
    </SettingsSection>

    <SettingsSection
        title={$LL.menu.settings.microphone.title()}
        bind:element={microphoneSettingsSection}
        dataTestId="microphone-settings-section"
    >
        {#snippet icon()}<IconMicrophoneOn />{/snippet}
        <div>
            <InputSwitch
                id="noise-suppression-settings-toggle"
                value={$noiseSuppressionEnabledStore}
                onchange={toggleNoiseSuppression}
                label={$LL.menu.settings.microphone.enableAdvancedNoiseReduction()}
            />
        </div>

        {#if $noiseSuppressionEnabledStore}
            <div class="flex flex-col gap-3">
                <p class="m-0 text-sm font-bold text-white/90">
                    {$LL.menu.settings.microphone.noiseSuppressionMode()}
                </p>
                <div class="grid grid-cols-1 items-stretch gap-3 @lg/main-layout:grid-cols-2">
                    <InputRadioBox
                        id="noise-suppression-provider-workadventure"
                        value="workadventure"
                        label={$LL.menu.settings.microphone.workAdventureNoiseSuppression()}
                        bind:group={selectedNoiseSuppressionProvider}
                        onchange={updateNoiseSuppressionProvider}
                    >
                        <Chip class="mb-1">{$LL.menu.settings.microphone.recommended()}</Chip>
                        <span>{$LL.menu.settings.microphone.workAdventureNoiseSuppressionDescription()}</span>
                        {#if selectedNoiseSuppressionProvider === "workadventure" && $noiseSuppressionStateStore.status === "initializing"}
                            <div data-testid="noise-suppression-loading" class="text-xs text-white/50 mt-1">
                                {$LL.actionbar.microphone.noiseSuppressionInitializing()}
                            </div>
                        {:else if selectedNoiseSuppressionProvider === "workadventure" && $noiseSuppressionStateStore.status === "unsupported"}
                            <div data-testid="noise-suppression-error" class="text-xs text-pop-red mt-1">
                                {$noiseSuppressionStateStore.message ??
                                    $LL.actionbar.microphone.noiseSuppressionUnsupported()}
                            </div>
                        {:else if selectedNoiseSuppressionProvider === "workadventure" && $noiseSuppressionStateStore.status === "error"}
                            <div data-testid="noise-suppression-error" class="text-xs text-pop-red mt-1">
                                {$noiseSuppressionStateStore.message ??
                                    $LL.actionbar.microphone.noiseSuppressionError()}
                            </div>
                        {/if}
                    </InputRadioBox>

                    {#if $voiceIsolationSupportedStore}
                        <InputRadioBox
                            id="noise-suppression-provider-voice-isolation"
                            value="voiceIsolation"
                            label={$LL.menu.settings.microphone.voiceIsolation()}
                            bind:group={selectedNoiseSuppressionProvider}
                            onchange={updateNoiseSuppressionProvider}
                        >
                            {$LL.menu.settings.microphone.voiceIsolationDescription()}
                        </InputRadioBox>
                    {/if}
                </div>
                {#if selectedNoiseSuppressionProvider === "workadventure"}
                    <Select
                        id="noise-suppression-engine"
                        dataTestId="noise-suppression-engine"
                        label={$LL.menu.settings.microphone.noiseSuppressionEngine()}
                        options={noiseSuppressionEngineOptions}
                        value={$noiseSuppressionEngineStore}
                        onchange={updateNoiseSuppressionEngine}
                    />
                {/if}
            </div>
        {/if}

        <div>
            <InputSwitch
                id="microphone-auto-gain-control-toggle"
                value={$microphoneAutoGainControlStore}
                onchange={toggleMicrophoneAutoGainControl}
            >
                <span class="flex flex-wrap items-center gap-2">
                    {$LL.menu.settings.microphone.autoGainControl()}
                    <Chip size="xs">{$LL.menu.settings.microphone.recommended()}</Chip>
                </span>

                {#snippet description()}
                    <span>{$LL.menu.settings.microphone.autoGainControlDescription()}</span>
                {/snippet}
            </InputSwitch>
        </div>

        <div>
            <InputSwitch
                id="microphone-echo-cancellation-toggle"
                value={$microphoneEchoCancellationStore}
                onchange={toggleMicrophoneEchoCancellation}
            >
                <span class="flex flex-wrap items-center gap-2">
                    {$LL.menu.settings.microphone.echoCancellation()}
                    <Chip size="xs">{$LL.menu.settings.microphone.recommended()}</Chip>
                </span>
            </InputSwitch>
        </div>
        {#if $browserNoiseSuppressionSupportedStore}
            <div>
                <InputSwitch
                    id="microphone-browser-noise-suppression-toggle"
                    value={$microphoneBrowserNoiseSuppressionStore}
                    onchange={toggleMicrophoneBrowserNoiseSuppression}
                >
                    <span class="flex flex-wrap items-center gap-2">
                        {$LL.menu.settings.microphone.browserNoiseSuppression()}
                        <Chip size="xs">{$LL.menu.settings.microphone.recommended()}</Chip>
                    </span>

                    {#snippet description()}
                        <span>{$LL.menu.settings.microphone.browserNoiseSuppressionDescription()}</span>
                    {/snippet}
                </InputSwitch>
            </div>
        {/if}
    </SettingsSection>

    <SettingsSection title={$LL.menu.settings.proximityDiscussionVolume()}>
        {#snippet icon()}<IconAdjustements />{/snippet}
        <div class="flex items-center gap-4">
            <span class="w-8 shrink-0 text-xs text-white/50">0 %</span>
            <div class="grow">
                <RangeSlider
                    min={0}
                    max={1}
                    step={0.1}
                    bind:value={volumeProximityDiscussion}
                    onchange={updateVolumeProximityDiscussion}
                />
            </div>
            <span class="w-12 shrink-0 text-end text-sm font-bold text-white tabular-nums">
                {Math.round(volumeProximityDiscussion * 100)} %
            </span>
        </div>
    </SettingsSection>

    <SettingsSection title={$LL.menu.settings.language.title()}>
        {#snippet icon()}<IconLanguage />{/snippet}
        <div>
            <select
                class="languages-switcher m-0 w-full rounded-lg border border-solid border-white/15 bg-black/30 px-3 py-2 text-sm text-white hover:border-white/30 focus:border-secondary focus:outline-none"
                bind:value={valueLocale}
                onchange={updateLocale}
            >
                {#each displayableLocales as locale (locale.id)}
                    <option value={locale.id}>
                        {`${
                            locale.language ? locale.language.charAt(0).toUpperCase() + locale.language.slice(1) : ""
                        } (${locale.region})`}
                    </option>
                {/each}
            </select>
        </div>
    </SettingsSection>

    <SettingsSection
        title={$LL.menu.settings.privacySettings.title()}
        description={$LL.menu.settings.privacySettings.explanation()}
    >
        {#snippet icon()}<IconDoorExit />{/snippet}
        <div>
            <InputSwitch
                id="cam-toggle"
                bind:value={valueCameraPrivacySettings}
                onchange={changeCameraPrivacySettings}
                label={$LL.menu.settings.privacySettings.cameraToggle()}
            />
        </div>
        <div>
            <InputSwitch
                id="mic-toggle"
                bind:value={valueMicrophonePrivacySettings}
                onchange={changeMicrophonePrivacySettings}
                label={$LL.menu.settings.privacySettings.microphoneToggle()}
            />
        </div>
    </SettingsSection>

    <SpotifySettings />

    <SettingsSection title={$LL.menu.settings.otherSettings()}>
        {#snippet icon()}<IconAdjustements />{/snippet}
        <div>
            <SoundSelect
                id="bubble-sound"
                bind:value={valueBubbleSound}
                onchange={changeBubbleSound}
                label={$LL.menu.settings.bubbleSound()}
                options={[
                    { value: "ding", label: $LL.menu.settings.bubbleSoundOptions.ding() },
                    { value: "wobble", label: $LL.menu.settings.bubbleSoundOptions.wobble() },
                ]}
                getSoundUrl={getBubbleSoundUrl}
                playLabel="▶"
            />
        </div>
        <div>
            <InputSwitch
                id="fullscreen-toggle"
                bind:value={fullscreen}
                onchange={changeFullscreen}
                label={$LL.menu.settings.fullscreen()}
            />
        </div>
        <div>
            <InputSwitch
                id="notification-toggle"
                bind:value={notification}
                onchange={changeNotification}
                label={$LL.menu.settings.notifications()}
            />
        </div>
        <div>
            <InputSwitch
                id="picture-in-picture-toggle"
                bind:value={allowPictureInPicture}
                onchange={changePictureInPicture}
                label={$LL.menu.settings.enablePictureInPicture()}
            />
        </div>
        <div>
            <InputSwitch
                id="cowebsiteTrigger-toggle"
                bind:value={forceCowebsiteTrigger}
                onchange={changeForceCowebsiteTrigger}
                label={$LL.menu.settings.cowebsiteTrigger()}
            />
        </div>
        <div>
            <InputSwitch
                id="ignoreFollowRequests-toggle"
                bind:value={ignoreFollowRequests}
                onchange={changeIgnoreFollowRequests}
                label={$LL.menu.settings.ignoreFollowRequest()}
            />
        </div>
        <div>
            <InputSwitch
                id="decreaseAudioPlayerVolumeWhileTalking-toggle"
                bind:value={decreaseAudioPlayerVolumeWhileTalking}
                onchange={changeDecreaseAudioPlayerVolumeWhileTalking}
                label={$LL.audio.manager.reduce()}
            />
        </div>
        <div>
            <InputSwitch
                id="changeBlockAudio"
                bind:value={blockAudio}
                onchange={changeBlockAudio}
                label={$LL.menu.settings.blockAudio()}
            />
        </div>
        <div>
            <InputSwitch
                id="changeDisableAnimations"
                bind:value={disableAnimations}
                onchange={changeDisableAnimations}
                label={$LL.menu.settings.disableAnimations()}
            />
        </div>
        <div>
            <InputSwitch
                id="changeVideoQualityStats"
                bind:value={videoQualityStats}
                onchange={changeVideoQualityStats}
                label={$LL.menu.settings.displayVideoQualityStats()}
            />
        </div>
    </SettingsSection>
</div>

<style>
</style>
