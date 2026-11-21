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
    import {
        aquaticLifeShownStore,
        cloudsHeightStore,
        cloudsShownStore,
        smoothCloudsStore,
        rainbowShownStore,
        waterReflectionsStore,
        weatherEffectsEnabledStore,
    } from "../../Stores/WeatherStore";
    import { lampDemoEnabledStore } from "../../Stores/LampDemoStore";
    import {
        ambienceFullShareStore,
        ambienceOnStore,
        ambienceStrengthStore,
        bounceOnStore,
        lightBounceStore,
        lightSoftEdgeStore,
        nightDarknessStore,
        nightInEditorStore,
        noAreaHighlightStore,
        realFalloffStore,
        realisticNightStore,
        secondBounceOnStore,
        softEdgeOnStore,
    } from "../../Stores/NightStore";
    import { NIGHT_DARKNESS_MAX, NIGHT_DARKNESS_MIN, NIGHT_MAX_OPACITY } from "../../Phaser/Game/Night/NightClock";
    import { lampEffectsEnabledStore } from "../../Stores/LampEffectsStore";
    import { jungleEnabledStore } from "../../Stores/JungleStore";
    import { basicModeStore } from "../../Stores/BasicModeStore";
    import { videoQualityStore } from "../../Stores/MediaStore";
    import { avatarVideosEnabledStore } from "../../Stores/AvatarVideoStore";
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
    import { perfShownStore } from "../../Stores/PerfStore";
    import {
        pixelSmoothingStore,
        setTileAnimationsDisabled,
        tileAnimationsDisabledStore,
    } from "../../Stores/GraphicsSettingsStore";
    import SoundEffectsSettings from "./SoundEffectsSettings.svelte";
    import SpotifySettings from "./SpotifySettings.svelte";
    import SegmentedControl from "./SegmentedControl.svelte";
    import SettingsSection from "./SettingsSection.svelte";
    import ThemeSettings from "./ThemeSettings.svelte";
    import FontSettings from "./FontSettings.svelte";
    import LightSettingsShare from "./LightSettingsShare.svelte";
    import NightSettings from "./NightSettings.svelte";
    import RainSettings from "./RainSettings.svelte";
    import GraphicsQualitySettings from "./GraphicsQualitySettings.svelte";
    import EffectsSettings from "./EffectsSettings.svelte";
    import SkyShadowCategories from "./SkyShadowCategories.svelte";
    import SkyLightSettings from "./SkyLightSettings.svelte";
    import SeasonalThemeSettings from "./SeasonalThemeSettings.svelte";
    import MapWeatherSection from "./MapWeatherSection.svelte";
    import MapLightingSection from "./MapLightingSection.svelte";
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
    const disableAnimations = tileAnimationsDisabledStore;
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

    type SettingsTab = "general" | "ambiance" | "graphics" | "audio" | "video";
    let settingsTab: SettingsTab = $state("general");
    const settingsTabs: { value: SettingsTab; label: string }[] = $derived([
        { value: "general", label: $LL.menu.settings.tabs.general() },
        { value: "ambiance", label: $LL.menu.settings.tabs.ambiance() },
        { value: "graphics", label: $LL.menu.settings.tabs.graphics() },
        { value: "audio", label: $LL.menu.settings.tabs.audio() },
        { value: "video", label: $LL.menu.settings.tabs.video() },
    ]);

    // The microphone and Spotify shortcuts open the settings on their own tab.
    $effect(() => {
        if ($settingsSubMenuTargetStore !== undefined) settingsTab = "audio";
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
        setTileAnimationsDisabled($disableAnimations);
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
    <div class="sticky top-0 z-10 -mx-1 bg-contrast/90 px-1 py-2 backdrop-blur" data-testid="settings-tabs">
        <SegmentedControl ariaLabel={$LL.menu.settings.tabs.label()} bind:value={settingsTab} options={settingsTabs} />
    </div>
    {#if settingsTab === "general"}
        <SettingsSection title={$LL.menu.settings.theme.label()} dataTestId="theme-settings">
            <ThemeSettings />
        </SettingsSection>
        <SettingsSection title={$LL.menu.settings.font.label()} dataTestId="font-settings">
            <FontSettings />
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
                                locale.language
                                    ? locale.language.charAt(0).toUpperCase() + locale.language.slice(1)
                                    : ""
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
        <SettingsSection title={$LL.menu.settings.otherSettings()} dataTestId="general-other-settings">
            {#snippet icon()}<IconAdjustements />{/snippet}
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
        </SettingsSection>
    {:else if settingsTab === "ambiance"}
        <SettingsSection title={$LL.actionbar.basicMode.label()} dataTestId="basic-mode-settings">
            <InputSwitch
                id="basic-mode"
                bind:value={$basicModeStore}
                label={$LL.actionbar.basicMode.switch()}
                labelPosition="right"
            />
            <p class="m-0 text-xs text-white/60">{$LL.actionbar.basicMode.hint()}</p>
        </SettingsSection>
        <SettingsSection title={$LL.menu.settings.graphics.nature()} dataTestId="graphics-nature-settings">
            <div class="flex flex-col gap-2">
                <p class="m-0 text-sm font-bold text-white/90">{$LL.menu.settings.seasonal.label()}</p>
                <SeasonalThemeSettings />
            </div>
            <InputSwitch
                id="jungle-enabled"
                bind:value={$jungleEnabledStore}
                label={$LL.menu.settings.jungle()}
                labelPosition="right"
            />
        </SettingsSection>
        <SettingsSection title={$LL.menu.settings.graphics.lighting()} dataTestId="ambiance-settings">
            <InputSwitch
                id="lamp-effects-enabled"
                bind:value={$lampEffectsEnabledStore}
                label={$LL.menu.settings.lampEffects()}
                labelPosition="right"
            />
            <InputSwitch
                id="lamp-demo-enabled"
                bind:value={$lampDemoEnabledStore}
                label={$LL.menu.settings.lampDemo()}
                labelPosition="right"
            />
            <div class="flex flex-col gap-2">
                <p class="m-0 text-sm font-bold text-white/90">{$LL.menu.settings.night.label()}</p>
                <NightSettings />
                <div class="flex flex-col gap-1" data-testid="night-darkness">
                    <span class="text-sm text-white">
                        {$LL.menu.settings.night.darkness({ percent: Math.round($nightDarknessStore * 100) })}
                    </span>
                    <div class="flex items-center gap-4">
                        <span class="w-14 shrink-0 text-xs text-white/50"
                            >{$LL.menu.settings.night.darknessLight()}</span
                        >
                        <div class="grow">
                            <RangeSlider
                                id="night-darkness"
                                min={NIGHT_DARKNESS_MIN}
                                max={NIGHT_DARKNESS_MAX}
                                step={0.05}
                                bind:value={$nightDarknessStore}
                            />
                        </div>
                        <span class="w-20 shrink-0 text-end text-xs text-white/50">
                            {$LL.menu.settings.night.darknessDark()}
                        </span>
                    </div>
                    {#if $nightDarknessStore !== NIGHT_MAX_OPACITY}
                        <button
                            type="button"
                            class="self-start text-xs text-white/60 underline"
                            onclick={() => nightDarknessStore.set(NIGHT_MAX_OPACITY)}
                        >
                            {$LL.menu.settings.night.darknessReset()}
                        </button>
                    {/if}
                </div>
                <InputSwitch
                    id="night-kept-in-editor"
                    bind:value={$nightInEditorStore}
                    label={$LL.menu.settings.night.keptInEditor()}
                    labelPosition="right"
                />
                <InputSwitch
                    id="night-realistic-lighting"
                    bind:value={$realisticNightStore}
                    label={$LL.menu.settings.night.realistic()}
                    labelPosition="right"
                />
                <p class="m-0 text-xs text-white/60">{$LL.menu.settings.night.realisticHelp()}</p>
                {#if $realisticNightStore}
                    <details class="ps-4" data-testid="night-realistic-advanced">
                        <summary class="cursor-pointer text-sm text-white/80">
                            {$LL.menu.settings.night.realisticAdvanced()}
                        </summary>
                        <div class="flex flex-col gap-1 pt-2">
                            <InputSwitch
                                id="night-no-area-highlight"
                                bind:value={$noAreaHighlightStore}
                                label={$LL.menu.settings.night.noAreaHighlight()}
                                labelPosition="right"
                            />
                            <p class="m-0 text-xs text-white/60">{$LL.menu.settings.night.noAreaHighlightHelp()}</p>
                        </div>
                    </details>
                {/if}
            </div>
            <LightSettingsShare />
        </SettingsSection>
        <SettingsSection title={$LL.menu.settings.graphics.sky()}>
            <SkyLightSettings section="ambiance" />
        </SettingsSection>
        <MapWeatherSection />
        <MapLightingSection />
    {:else if settingsTab === "graphics"}
        <GraphicsQualitySettings />
        <EffectsSettings />
        <SettingsSection title={$LL.menu.settings.graphics.renderQuality()} dataTestId="graphics-sky-settings">
            <InputSwitch
                id="pixel-smoothing"
                bind:value={$pixelSmoothingStore}
                label={$LL.menu.settings.pixelSmoothing()}
                labelPosition="right"
            />
            <InputSwitch
                id="weather-effects-enabled"
                bind:value={$weatherEffectsEnabledStore}
                label={$LL.menu.settings.weatherEffects()}
                labelPosition="right"
            />
            <InputSwitch
                id="aquatic-life-shown"
                bind:value={$aquaticLifeShownStore}
                label={$LL.menu.settings.aquaticLife()}
                labelPosition="right"
            />
            <InputSwitch
                id="weather-clouds-shown"
                bind:value={$cloudsShownStore}
                label={$LL.menu.settings.clouds()}
                labelPosition="right"
            />
            <InputSwitch
                id="water-reflections"
                bind:value={$waterReflectionsStore}
                label={$LL.menu.settings.waterReflections()}
                labelPosition="right"
            />
            <InputSwitch
                id="weather-rainbow-shown"
                bind:value={$rainbowShownStore}
                label={$LL.menu.settings.rainbows()}
                labelPosition="right"
            />
            {#if $cloudsShownStore}
                <InputSwitch
                    id="weather-smooth-clouds"
                    bind:value={$smoothCloudsStore}
                    label={$LL.menu.settings.smoothClouds()}
                    labelPosition="right"
                />
            {/if}
            {#if $cloudsShownStore}
                <div class="flex flex-col gap-1" data-testid="weather-clouds-height">
                    <span class="text-sm text-white">{$LL.menu.settings.cloudsHeight.label()}</span>
                    <div class="flex items-center gap-4">
                        <span class="w-14 shrink-0 text-xs text-white/50">{$LL.menu.settings.cloudsHeight.low()}</span>
                        <div class="grow">
                            <RangeSlider
                                id="weather-clouds-height"
                                min={0}
                                max={1}
                                step={0.05}
                                bind:value={$cloudsHeightStore}
                            />
                        </div>
                        <span class="w-20 shrink-0 text-end text-xs text-white/50">
                            {$LL.menu.settings.cloudsHeight.always()}
                        </span>
                    </div>
                </div>
            {/if}
            {#if $weatherEffectsEnabledStore}
                <RainSettings />
            {/if}
            <SkyLightSettings section="graphics" />
            <SkyShadowCategories />
        </SettingsSection>
        <SettingsSection title={$LL.menu.settings.night.indirect()} dataTestId="graphics-lighting-settings">
            <div class="flex flex-col gap-2" data-testid="night-indirect-light">
                <p class="m-0 text-xs text-white/60">{$LL.menu.settings.night.indirectHelp()}</p>
                <InputSwitch
                    id="night-real-falloff"
                    bind:value={$realFalloffStore}
                    label={$LL.menu.settings.night.realFalloff()}
                    labelPosition="right"
                />
                <InputSwitch
                    id="night-ambience-on"
                    bind:value={$ambienceOnStore}
                    label={$LL.menu.settings.night.ambienceOn()}
                    labelPosition="right"
                />
                {#if $ambienceOnStore}
                    <div class="flex flex-col gap-1 ps-4">
                        <span class="text-sm text-white"
                            >{$LL.menu.settings.night.ambienceStrength({
                                percent: Math.round($ambienceStrengthStore * 100),
                            })}</span
                        >
                        <RangeSlider
                            id="night-ambience-strength"
                            min={0}
                            max={1}
                            step={0.05}
                            bind:value={$ambienceStrengthStore}
                        />
                        <span class="text-sm text-white"
                            >{$LL.menu.settings.night.ambienceFullShare({
                                percent: Math.round($ambienceFullShareStore * 100),
                            })}</span
                        >
                        <RangeSlider
                            id="night-ambience-full-share"
                            min={0.05}
                            max={1}
                            step={0.05}
                            bind:value={$ambienceFullShareStore}
                        />
                    </div>
                {/if}
                <InputSwitch
                    id="night-soft-edge-on"
                    bind:value={$softEdgeOnStore}
                    label={$LL.menu.settings.night.softEdgeOn()}
                    labelPosition="right"
                />
                {#if $softEdgeOnStore}
                    <div class="flex flex-col gap-1 ps-4">
                        <span class="text-sm text-white"
                            >{$LL.menu.settings.night.softEdge({ pixels: Math.round($lightSoftEdgeStore) })}</span
                        >
                        <RangeSlider
                            id="night-light-soft-edge"
                            min={0}
                            max={32}
                            step={2}
                            bind:value={$lightSoftEdgeStore}
                        />
                    </div>
                {/if}
                <InputSwitch
                    id="night-bounce-on"
                    bind:value={$bounceOnStore}
                    label={$LL.menu.settings.night.bounceOn()}
                    labelPosition="right"
                />
                {#if $bounceOnStore}
                    <div class="flex flex-col gap-1 ps-4">
                        <span class="text-sm text-white">
                            {$LL.menu.settings.night.bounce({ percent: Math.round($lightBounceStore * 100) })}
                        </span>
                        <RangeSlider
                            id="night-light-bounce"
                            min={0}
                            max={1}
                            step={0.05}
                            bind:value={$lightBounceStore}
                        />
                        <InputSwitch
                            id="night-second-bounce-on"
                            bind:value={$secondBounceOnStore}
                            label={$LL.menu.settings.night.secondBounceOn()}
                            labelPosition="right"
                        />
                    </div>
                {/if}
            </div>
        </SettingsSection>
        <SettingsSection title={$LL.menu.settings.graphics.performance()} dataTestId="graphics-performance-settings">
            <InputSwitch
                id="perf-counter-shown"
                bind:value={$perfShownStore}
                label={$LL.menu.settings.perfCounter()}
                labelPosition="right"
            />
            <div>
                <InputSwitch
                    id="changeDisableAnimations"
                    bind:value={$disableAnimations}
                    onchange={changeDisableAnimations}
                    label={$LL.menu.settings.disableAnimations()}
                />
            </div>
        </SettingsSection>
    {:else if settingsTab === "audio"}
        <SettingsSection title={$LL.menu.settings.soundEffects.title()} dataTestId="sound-effects-settings">
            <SoundEffectsSettings />
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
        <SpotifySettings />
    {:else}
        <SettingsSection title={$LL.menu.settings.videoBandwidth.title()}>
            {#snippet icon()}<IconCameraUp />{/snippet}
            <InputSwitch
                id="avatar-videos-enabled"
                bind:value={$avatarVideosEnabledStore}
                label={$LL.menu.settings.avatarVideos()}
                labelPosition="right"
                onchange={() => localUserStore.setAvatarVideosEnabled($avatarVideosEnabledStore)}
            />
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
                    id="changeVideoQualityStats"
                    bind:value={videoQualityStats}
                    onchange={changeVideoQualityStats}
                    label={$LL.menu.settings.displayVideoQualityStats()}
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
                        {
                            value: 2,
                            label: $LL.menu.settings.shareScreenBandwidth.recommended(),
                            icon: IconAntennaBarsMid,
                        },
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
    {/if}
</div>

<style>
</style>
