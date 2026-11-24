import * as Sentry from "@sentry/svelte";
import * as Phaser from "phaser";
import type { Subscription } from "rxjs";
import { Queue } from "queue-typescript";
import type { Readable, Unsubscriber } from "svelte/store";
import { derived, get } from "svelte/store";
import { throttle } from "throttle-debounce";
import { ForwardableStore, MapStore } from "@workadventure/store-utils";
import { MathUtils } from "@workadventure/math-utils";
import { CancelablePromise } from "cancelable-promise";
import { ChatMessageTypes, Deferred, SpatialMap } from "@workadventure/shared-utils";
import {
    AvailabilityStatus,
    availabilityStatusToJSON,
    type BanUserMessage,
    CatastropheKind,
    ErrorScreenMessage,
    FilterType,
    type GroupUsersUpdateMessage,
    PositionMessage_Direction,
    type SendUserMessage,
    type TerrainWaterMessage,
    type MeadowMessage,
    type TreeFireMessage,
    type FireConditionsMessage,
    type AquaticLifeMessage,
} from "@workadventure/messages";
import { z } from "zod";
import type { ITiledMap, ITiledMapLayer, ITiledMapObject, ITiledMapTileset } from "@workadventure/tiled-map-type-guard";
import {
    type AreaData,
    EntityPermissions,
    type EntityPrefabType,
    GameMap,
    freezeThawTimesOf,
    GameMapProperties,
    GRAZING_COVER,
    heightAt,
    HURRICANE_GUST_FACTOR,
    hurricaneHere,
    doorLeavesOf,
    LIFE_DEPTHS_PX,
    zombieCollisionsOf,
    type LifeFire,
    lifeFireOf,
    listeningZoneJamKey,
    mapCellsOf,
    type Season,
    seasonAt,
    snowCoverOf,
    snowShareOf,
    TERRAIN_CELL,
    type WAMFileFormat,
    WAMSettingsUtils,
    waterHasInertia,
    WeatherType,
    bridgesOf,
    pavedTilesOf,
} from "@workadventure/map-editor";
import type { Bridges, ColdMass, TerrainData, WeatherLocation } from "@workadventure/map-editor";
import { ZOMBIE_GRENADES_A_PLAYER, zombieGrenadeAim } from "@workadventure/map-editor";
import { wamFileMigration } from "@workadventure/map-editor/src/Migrations/WamFileMigration";
import Debug from "debug";
import { asError } from "catch-unknown";
import { AirplaneSounds, AIRPLANE_SOUND } from "@wa/front/Phaser/Vehicle/AirplaneSounds";
import { SkateboardSounds, SKATEBOARD_SOUNDS } from "@wa/front/Phaser/Vehicle/SkateboardSounds";
import { Vehicle } from "@wa/front/Phaser/Vehicle/Vehicle";
import { AIRPLANE_IMAGE_URL, AIRPLANE_SOURCE_TEXTURE } from "@wa/front/Phaser/Vehicle/AirplaneArtwork";
import { GROUND_TEXTURE_URLS } from "@wa/front/Phaser/Game/Terrain/TexturedGround";
import { textMessageStore } from "@wa/front/Stores/TypeMessageStore/TextMessageStore";
import { connectionManager } from "@wa/front/Connection/ConnectionManager";
import { urlManager } from "@wa/front/Url/UrlManager";
import { mediaManager } from "@wa/front/WebRtc/MediaManager";
import { iceServersManager } from "@wa/front/WebRtc/IceServersManager";
import { ActiveEventList, UserInputEvent, UserInputManager } from "@wa/front/Phaser/UserInput/UserInputManager";
import { touchScreenManager } from "@wa/front/Touch/TouchScreenManager";
import { PinchManager } from "@wa/front/Phaser/UserInput/PinchManager";
import { waScaleManager } from "@wa/front/Phaser/Services/WaScaleManager";
import { lazyLoadPlayerCharacterTextures } from "@wa/front/Phaser/Entity/PlayerTexturesLoadingManager";
import { lazyLoadPlayerCompanionTexture } from "@wa/front/Phaser/Companion/CompanionTexturesLoadingManager";
import { iframeListener } from "@wa/front/Api/IframeListener";
import { coWebsiteManager, coWebsites } from "@wa/front/Stores/CoWebsiteStore";
import {
    ADMIN_URL,
    DEBUG_MODE,
    ENABLE_CHAT_DISCONNECTED_LIST,
    ENABLE_MAP_EDITOR,
    ENABLE_OPENID,
    MAP_LAYER_CATALOG_URLS,
    MAX_PER_GROUP,
    POSITION_DELAY,
    PUBLIC_MAP_STORAGE_PREFIX,
    WOKA_SPEED,
} from "@wa/front/Enum/EnvironmentVariable";
import { Room } from "@wa/front/Connection/Room";
import { CharacterTextureError } from "@wa/front/Exception/CharacterTextureError";
import { localUserStore } from "@wa/front/Connection/LocalUserStore";
import { HtmlUtils } from "@wa/front/WebRtc/HtmlUtils";
import { Loader } from "@wa/front/Phaser/Components/Loader";
import { RemotePlayer } from "@wa/front/Phaser/Entity/RemotePlayer";
import type { Entity } from "@wa/front/Phaser/ECS/Entity";
import { AVATAR_ACTION_VARIABLE } from "@wa/front/Phaser/Entity/AvatarAction";
import { SWIMWEAR_VARIABLE, SWIMWEAR_COLOR_VARIABLE } from "@wa/front/Phaser/Entity/Swimwear";
import { SelectCharacterScene, SelectCharacterSceneName } from "@wa/front/Phaser/Login/SelectCharacterScene";
import { hasMovedEventName, Player, requestEmoteEventName } from "@wa/front/Phaser/Player/Player";
import { findSeatOfCharacter, getSeats, isSeatTaken } from "@wa/front/Phaser/Player/Seat";
import { walkToDesk } from "@wa/front/Phaser/Player/DeskSeat";
import { ErrorSceneName } from "@wa/front/Phaser/Reconnecting/ErrorScene";
import { ReconnectingSceneName } from "@wa/front/Phaser/Reconnecting/ReconnectingScene";
import { TextUtils } from "@wa/front/Phaser/Components/TextUtils";
import { PropertyUtils } from "@wa/front/Phaser/Map/PropertyUtils";
import { analyticsClient } from "@wa/front/Administration/AnalyticsClient";
import { stripUrlSensitiveParts } from "@wa/front/Administration/CowebsiteAnalyticsProperties";
import { PathfindingManager, PathTileType } from "@wa/front/Utils/PathfindingManager";
import type {
    GroupCreatedUpdatedMessageInterface,
    MessageUserMovedInterface,
    OnConnectInterface,
    PositionInterface,
    RoomJoinedMessageInterface,
    ViewportInterface,
} from "@wa/front/Connection/ConnexionModels";
import type { RoomConnection } from "@wa/front/Connection/RoomConnection";
import type { ActionableItem } from "@wa/front/Phaser/Items/ActionableItem";
import type { ItemFactoryInterface } from "@wa/front/Phaser/Items/ItemFactoryInterface";
import { biggestAvailableAreaStore } from "@wa/front/Stores/BiggestAvailableAreaStore";
import { playersStore } from "@wa/front/Stores/PlayersStore";
import { emoteStore } from "@wa/front/Stores/EmoteStore";
import { isHandRaisedStore, requestedHandRaiseState } from "@wa/front/Stores/RaiseHandStore";
import { raisedHandPlayerIdsStore } from "@wa/front/Stores/RaisedHandsStore";
import { isInRemoteConversation } from "@wa/front/Stores/StreamableCollectionStore";
import {
    jitsiParticipantsCountStore,
    userIsAdminStore,
    userIsEditorStore,
    userIsJitsiDominantSpeakerStore,
} from "@wa/front/Stores/GameStore";
import {
    contactPageStore,
    inviteUserActivated,
    mapEditorActivated,
    mapManagerActivated,
    roomListActivated,
    screenSharingActivatedStore,
} from "@wa/front/Stores/MenuStore";
import type { WasCameraUpdatedEvent } from "@wa/front/Api/Events/WasCameraUpdatedEvent";
import { audioManagerFileStore, bubbleSoundStore } from "@wa/front/Stores/AudioManagerStore";
import { currentPlayerGroupIdStore, currentPlayerGroupLockStateStore } from "@wa/front/Stores/CurrentPlayerGroupStore";
import { errorScreenStore } from "@wa/front/Stores/ErrorScreenStore";
import {
    availabilityStatusStore,
    batchGetUserMediaStore,
    lastNewMediaDeviceDetectedStore,
    localVoiceIndicatorStore,
    requestedCameraDeviceIdStore,
    requestedCameraState,
    requestedMicrophoneDeviceIdStore,
    requestedMicrophoneState,
    speakerSelectedStore,
} from "@wa/front/Stores/MediaStore";
import { devicesToOffer } from "@wa/front/Stores/AudioOutputStore";
import NoMicrophoneSoundToast from "@wa/front/Components/Toasts/NoMicrophoneSoundToast.svelte";
import LoudEnvironmentToast from "@wa/front/Components/Toasts/LoudEnvironmentToast.svelte";
import { LL, locale } from "@wa/i18n/i18n-svelte";
import { toastStore } from "@wa/front/Stores/ToastStoreSingleton";
import { audioInterruptedStore } from "@wa/front/Stores/AudioInterruptedStore";
import { loudEnvironmentWarningStore } from "@wa/front/Stores/LoudEnvironmentWarningStore";
import { GameSceneUserInputHandler } from "@wa/front/Phaser/UserInput/GameSceneUserInputHandler";
import { followUsersColorStore, followUsersStore } from "@wa/front/Stores/FollowStore";
import {
    axiosWithRetry,
    hideConnectionIssueMessage,
    showConnectionIssueMessage,
} from "@wa/front/Connection/AxiosUtils";
import { StringUtils } from "@wa/front/Utils/StringUtils";
import { PHASER_COLOR_DESIGN_SYSTEM_SECONDARY } from "@wa/front/Utils/DesignSystemPhaserColors";
import { SuperLoaderPlugin } from "@wa/front/Phaser/Services/SuperLoaderPlugin";
import { embedScreenLayoutStore } from "@wa/front/Stores/EmbedScreenLayoutStore";
import { highlightedEmbedScreen } from "@wa/front/Stores/HighlightedEmbedScreenStore";
import type { AddPlayerEvent } from "@wa/front/Api/Events/AddPlayerEvent";
import { chatVisibilityStore, forceRefreshChatStore } from "@wa/front/Stores/ChatStore";
import type { HasPlayerMovedInterface } from "@wa/front/Api/Events/HasPlayerMovedInterface";
import { extensionModuleStore, gameSceneIsLoadedStore, gameSceneStore } from "@wa/front/Stores/GameSceneStore";
import { myCameraBlockedStore, myMicrophoneBlockedStore } from "@wa/front/Stores/MyMediaStore";
import type { GameStateEvent } from "@wa/front/Api/Events/GameStateEvent";
import { currentPlayerWokaStore } from "@wa/front/Stores/CurrentPlayerWokaStore";
import {
    mapEditorModeStore,
    mapEditorSelectedToolStore,
    mapEditorPlacementLevelStore,
    mapEditorWamSettingsEditorToolCurrentMenuItemStore,
    WAM_SETTINGS_EDITOR_TOOL_MENU_ITEM,
} from "@wa/front/Stores/MapEditorStore";
import {
    coldLyingStore,
    heldBallStore,
    hurricaneHighestRiseStore,
    hurricaneShownStore,
    tsunamiShownStore,
    zombieShownStore,
    pointerFloodRiseStore,
} from "@wa/front/Stores/CatastropheStore";
import { refreshPromptStore } from "@wa/front/Stores/RefreshPromptStore";
import { mapDeletedPromptStore } from "@wa/front/Stores/MapDeletedPromptStore";
import { SpaceRegistry } from "@wa/front/Space/SpaceRegistry/SpaceRegistry";
import { SpaceScriptingBridgeService } from "@wa/front/Space/Utils/SpaceScriptingBridgeService";
import { debugAddPlayer, debugRemovePlayer, debugUpdatePlayer, debugZoom } from "@wa/front/Utils/Debuggers";
import { checkCoturnServer } from "@wa/front/Components/Video/utils";
import { BroadcastService } from "@wa/front/Streaming/BroadcastService";
import {
    megaphoneCanBeUsedStore,
    megaphoneSpaceSettingsStore,
    megaphoneSpaceStore,
    requestedMegaphoneStore,
} from "@wa/front/Stores/MegaphoneStore";
import { stopMegaphoneLive } from "@wa/front/Components/ActionBar/MenuIcons/megaphoneActions";
import { CompanionTextureError } from "@wa/front/Exception/CompanionTextureError";
import { SelectCompanionScene, SelectCompanionSceneName } from "@wa/front/Phaser/Login/SelectCompanionScene";
import { scriptUtils } from "@wa/front/Api/ScriptUtils";
import { statusChanger } from "@wa/front/Components/ActionBar/AvailabilityStatus/statusChanger";
import { warningMessageStore } from "@wa/front/Stores/ErrorStore";
import { closeCoWebsite, getCoWebSite, openCoWebSite, openCoWebSiteWithoutSource } from "@wa/front/Chat/Utils";
import { navChat } from "@wa/front/Chat/Stores/ChatStore";
import { ProximityChatRoom } from "@wa/front/Chat/Connection/Proximity/ProximityChatRoom";
import {
    DEFAULT_PROXIMITY_SPACE_NAME,
    ProximityChatRoomManager,
    type ProximityChatRoomKind,
} from "@wa/front/Chat/Connection/Proximity/ProximityChatRoomManager";
import { ProximitySpaceManager } from "@wa/front/WebRtc/ProximitySpaceManager";
import { BubbleListeningManager } from "@wa/front/WebRtc/BubbleListeningManager";
import { overheardLoudness, overheardLoudnessStore, userIdOfSpaceUser } from "@wa/front/Stores/BubbleListeningStore";
import { audioContextManager } from "@wa/front/WebRtc/AudioContextManager";
import { bindAudioOutput, pendingSinkRequests } from "@wa/front/WebRtc/AudioOutputManager";
import { noMicrophoneSoundWarningVisibleStore } from "@wa/front/Stores/NoMicrophoneSoundWarningVisibleStore";
import type { SpaceRegistryInterface } from "@wa/front/Space/SpaceRegistry/SpaceRegistryInterface";
import { WorldUserProvider } from "@wa/front/Chat/UserProvider/WorldUserProvider";
import { ChatUserProvider } from "@wa/front/Chat/UserProvider/ChatUserProvider";
import { UserProviderMerger } from "@wa/front/Chat/UserProviderMerger/UserProviderMerger";
import { AdminUserProvider } from "@wa/front/Chat/UserProvider/AdminUserProvider";
import { ExtensionModuleStatusSynchronization } from "@wa/front/Rules/StatusRules/ExtensionModuleStatusSynchronization";
import { resetAllStatusStoreExcept } from "@wa/front/Rules/StatusRules/statusChangerFunctions";
import { calendarEventsStore, isActivatedStore as isCalendarActiveStore } from "@wa/front/Stores/CalendarStore";
import { isActivatedStore as isTodoListActiveStore, todoListsStore } from "@wa/front/Stores/TodoListStore";
import { externalSvelteComponentService } from "@wa/front/Stores/Utils/externalSvelteComponentService";
import type { ExtensionModule } from "@wa/front/ExternalModule/ExtensionModule";
import { findExternalModuleFactory } from "@wa/front/Phaser/Game/ExternalModuleFactories";
import { findNewerBuild, getLoadedBuildVersion, rememberUpdateForReload } from "@wa/front/Network/BuildUpdate";
import { getNewReleaseNotes, releaseNotes } from "@wa/common/ReleaseNotes";
import type { SpaceInterface } from "@wa/front/Space/SpaceInterface";
import { spotifyAccount } from "@wa/front/Spotify/SpotifyAccount";
import { desktopSpotifyPlayer } from "@wa/front/Spotify/LocalSpotifyPlayer";
import { SpotifyListeningSharer } from "@wa/front/Spotify/SpotifyListeningSharer";
import {
    followedUserUuidStore,
    listenAlongAvailableStore,
    startListeningFollower,
} from "@wa/front/Spotify/ListeningFollower";
import { desktopApi } from "@wa/front/Api/Desktop";
import {
    bindListeningDirectory,
    type ListeningByUserUuid,
    listeningByUserUuidStore,
} from "@wa/front/Spotify/SpotifyListeningDirectory";
import { spotifySharingEnabledStore } from "@wa/front/Spotify/SpotifySettingsStore";
import { joinedJamStore, listeningZoneNamesStore, type JoinedJam } from "@wa/front/ListeningZone/ListeningZoneStore";
import { allJamRoomsStore, syncJoinedJam } from "@wa/front/ListeningZone/ListeningZoneController";
import { jamAudioSession } from "@wa/front/ListeningZone/GameJamAudioSession";
import { startHomeJam } from "@wa/front/Spotify/HomeJam";
import type { HomeJamContext } from "@wa/front/Spotify/HomeJam";
import { startJamKaraoke } from "@wa/front/Karaoke/JamKaraoke";
import { startKaraokeStage } from "@wa/front/Karaoke/KaraokeStage";
import { startJamLinkRequests } from "@wa/front/ListeningZone/JamLinkRequest";
import { notifySystem } from "@wa/front/Notification/SystemNotifier";
import type { UserProviderInterface } from "@wa/front/Chat/UserProvider/UserProviderInterface";
import { registerAdditionalMenuItem, unregisterAdditionalMenuItem } from "@wa/front/Stores/AdditionalItemsMenuStore";
import { popupStore } from "@wa/front/Stores/PopupStore";
import PopUpRoomAccessDenied from "@wa/front/Components/PopUp/PopUpRoomAccessDenied.svelte";
import PopUpTriggerActionMessage from "@wa/front/Components/PopUp/PopUpTriggerActionMessage.svelte";
import PopUpMapEditorNotEnabled from "@wa/front/Components/PopUp/PopUpMapEditorNotEnabled.svelte";
import PopUpMapEditorShortcut from "@wa/front/Components/PopUp/PopUpMapEditorShortcut.svelte";
import { enableUserInputsStore } from "@wa/front/Stores/UserInputStore";
import { ScriptLoadedError } from "@wa/front/Api/ScriptLoadedError";
import {
    mediaSynchronizedSpacesStore,
    heardVideoBoxesStore,
    bubbleListenersStore,
    raisedHandSectionsStore,
    screenShareStreamStore,
    videoStreamStore,
    videoStreamElementsStore,
} from "@wa/front/Stores/PeerStore";
import { isOffscreen, offscreenCallUsersStore } from "@wa/front/Stores/CallStripStore";
import type { ChatConnectionInterface, ChatUser } from "@wa/front/Chat/Connection/ChatConnection";
import { selectedRoomStore } from "@wa/front/Chat/Stores/SelectRoomStore";
import { getCustomEntityCollectionUrl } from "@wa/front/Utils/MapStorageUrl";
import { CHARACTER_BODY_OFFSET_Y, PLAYTEXT_NEW_MEDIA_DEVICE_PREFIX } from "@wa/front/Phaser/Entity/Character";
import type { Character } from "@wa/front/Phaser/Entity/Character";
import { type Avatar, ConversationBubble } from "@wa/front/Phaser/Entity/ConversationBubble";
import { DarkenOutsideAreaEffect } from "@wa/front/Phaser/Components/DarkenOutsideArea/DarkenOutsideAreaEffect";
import { isInsidePersonalAreaStore, personalAreaDataStore } from "@wa/front/Stores/PersonalDeskStore";
import { areaPropertyVariablesManagerStore } from "@wa/front/Stores/AreaPropertyVariablesStore";
import { entityStatesManagerStore } from "@wa/front/Stores/EntityStatesStore";
import { ApplicationManager } from "@wa/front/Chat/Applications/ApplicationManager";
import { audioPlaybackStore, handleSuspendedAudioContext } from "@wa/front/Stores/AudioPlaybackStore";
import { requestedScreenSharingState } from "@wa/front/Stores/ScreenSharingStore";
import { EnterLeaveScriptingService } from "@wa/front/Phaser/Helpers/EnterLeaveScriptingService";
import { stopShortOf } from "@wa/front/Utils/PathStop";
import {
    doorVolumeStore,
    footstepVolumeStore,
    jungleVolumeStore,
    notificationSoundVolumeStore,
} from "@wa/front/Stores/SoundEffectsStore";
import { waterCycleNow } from "@wa/front/Phaser/Game/Weather/Frost";
import { karaokeSingerActiveStore } from "../../Karaoke/KaraokeGameStore";
import type { TileBarriers } from "../../Utils/TileBarriers";
import { nerfEquippedStore } from "../../Stores/NerfStore";
import { torchEquippedStore } from "../../Stores/TorchStore";
import { rodEquippedStore } from "../../Stores/FishingStore";
import { grenadeLauncherEquippedStore } from "../../Stores/ZombieGrenadeStore";
import { aquaticLifeShownStore, cloudsShownStore, weatherEffectsEnabledStore } from "../../Stores/WeatherStore";
import { skyShadowCategoriesStore } from "../../Stores/SkyLightStore";
import type { SkyShadowCategories } from "../../Stores/SkyLightStore";
import { mapLayerBuiltLevelsStore, mapLayerLevelStore } from "../../Stores/MapLayerStore";
import { avatarAltitudeStore, floorLevelsBuiltStore, showPointerGround } from "../../Stores/FloorLevelsStore";
import { areaHighlightHiddenStore } from "../../Stores/NightStore";
import {
    aquaticLifeSpeciesStore,
    aquaticLifeStatsStore,
    terrainWaterStatsStore,
} from "../../Stores/TerrainEditorStore";
import { jungleEnabledStore } from "../../Stores/JungleStore";
import { isEffectShown, pixelReliefStore } from "../../Stores/EffectsStore";
import { fireConditionsStore } from "../../Stores/FireConditionsStore";
import { basicActiveStore, isBasicActive } from "../../Stores/BasicModeStore";
import {
    isWeatherPipetteOn,
    waterFlowMeasuredStore,
    waterFlowOverlayStore,
    weatherPipetteCellStore,
} from "../../Stores/VisualisationStore";
import { fastWaterActiveNow, setFastWaterResynchronize, sharedWaterBackStore } from "../../Stores/FastWaterStore";
import { HurricaneFloodView } from "./Terrain/HurricaneFloodView";
import { KaraokeSpotlight } from "./KaraokeSpotlight";
import { FadedWallFloorView } from "./MapEditor/MapLayer/FadedWallFloorView";
import { groundPrefabOfUpper } from "./MapEditor/MapLayer/MapLayerLevels";
import { parseFloorPiece } from "./MapEditor/MapLayer/MapLayerFloors";
import { floorPieceCover, RaisedCover } from "./Weather/RaisedCover";
import { floorPath } from "./MapEditor/MapLayer/FloorPath";
import { levelUnderPoint } from "./MapEditor/MapLayer/FloorOperations";
import { levelItems } from "./MapEditor/MapLayer/MapLayerLevels";
import { TreadmillBelts } from "./Treadmill/TreadmillBelts";
import { weatherAtTime } from "./Weather/WeatherFrame";
import {
    mapPlaceSlotsNow,
    setRoomConditions,
    getRoomHurricane,
    setHurricaneViewpoint,
    setRoomHurricane,
    showsChosenPlaceWeather,
    shownWeatherSettings,
} from "./Weather/RealWeatherClient";
import { chosenWeatherNow } from "./Weather/ChosenPlaceWeather";
import { groundSnowAt, snowLinePeak } from "./Terrain/GroundPace";
import { LocalTerrainController, openModuleWorker } from "./Terrain/LocalTerrainController";
import { SubmergedDrains } from "./Terrain/SubmergedDrains";
import { isSwayingTree, TreeSway } from "./Nature/TreeSway";
import { TreePoseTextures } from "./Nature/TreePoses";
import { TreeSeasonEffects } from "./Nature/TreeSeasonEffects";
import { avatarAltitude, pointerGroundAt } from "./Floors/AvatarAltitude";
import { FloorSpike } from "./Floors/FloorSpike";
import type { FloorOccupant } from "./Floors/FloorSpike";
import { FLOOR_Z_VARIABLE, decodeFloorZ } from "./Floors/FloorProtocol";
import { UpperDoors } from "./Floors/UpperDoors";
import type { RaisedCharacter } from "./Floors/UpperDoors";
import { wallBarriers } from "./MapEditor/MapLayer/MapLayerBarriers";
import { readMapLayerEntityStates } from "./MapEditor/MapLayer/MapLayerSync";
import { autumnProgress } from "./Nature/TreeLeafFall";
import { isGroundUnderWater } from "./Water/WaterZones";
import {
    followsServerGround,
    meadowHoldsSnow,
    setLocalGroundShown,
    snowCoverHere,
    snowCoverOfMap,
    snowPeakOfMap,
} from "./Weather/GroundSource";
import { precipitationAirNow, roomPrecipitationAir } from "./Weather/PrecipitationAir";
import { GameMapFrontWrapper } from "./GameMap/GameMapFrontWrapper";
import { gameManager } from "./GameManager";
import { EmoteManager } from "./EmoteManager";
import { EntityAudioManager } from "./EntityAudioManager";
import { OutlineManager } from "./UI/OutlineManager";
import { soundManager } from "./SoundManager";
import { DOOR_SOUND_KEYS, DOOR_SOUND_URLS, DoorAnimator } from "./MapEditor/MapLayer/DoorAnimator";
import type { DoorCharacter, HearingZone } from "./MapEditor/MapLayer/DoorAnimator";
import { DoorLockIcons } from "./MapEditor/MapLayer/DoorLockIcons";
import { MAP_LAYER_FLOOR_COLLECTION, MAP_LAYER_WALL_LIKE_COLLECTIONS } from "./MapEditor/MapLayer/MapLayerCatalog";
import { WallFade } from "./MapEditor/MapLayer/WallFade";
import { FOOTSTEP_SOUNDS, FootstepSounds } from "./FootstepSounds";
import { takesSteps } from "./Ice/Steps";
import { WEATHER_SOUNDS } from "./Weather/WeatherSounds";
import { FootstepSurfaces } from "./FootstepSurfaces";
import { SharedVariablesManager } from "./SharedVariablesManager";
import { AreaPropertyVariablesManager } from "./AreaPropertyVariablesManager";
import { EntityStatesManager } from "./EntityStates/EntityStatesManager";
import { GameSwitches } from "./Switches/GameSwitches";
import { EmbeddedWebsiteManager } from "./EmbeddedWebsiteManager";
import { DynamicAreaManager } from "./DynamicAreaManager";
import { PlayerMovement } from "./PlayerMovement";
import { PlayersPositionInterpolator } from "./PlayersPositionInterpolator";
import { DirtyScene } from "./DirtyScene";
import { computeStartPosition } from "./StartPositionCalculator";
import { readLastPlayerPosition, saveLastPlayerPosition } from "./LastPlayerPosition";
import { GameMapPropertiesListener } from "./GameMapPropertiesListener";
import { ActivatablesManager } from "./ActivatablesManager";
import type { AddPlayerInterface } from "./AddPlayerInterface";
import type { CameraManagerEventCameraUpdateData } from "./CameraManager";
import { CameraManager, CameraManagerEvent } from "./CameraManager";
import { EditorToolName, MapEditorModeManager } from "./MapEditor/MapEditorModeManager";
import type { PlayerDetailsUpdate } from "./RemotePlayersRepository";
import { RemotePlayersRepository } from "./RemotePlayersRepository";
import { IframeEventDispatcher } from "./IframeEventDispatcher";
import { PlayerVariablesManager } from "./PlayerVariablesManager";
import { SayManager } from "./Say/SayManager";
import { EntitiesCollectionsManager } from "./MapEditor/EntitiesCollectionsManager";
import { mergeEntityCollectionUrls } from "./MapEditor/EntityCollectionUrls";
import { DEPTH_BUBBLE_CHAT_SPRITE, DEPTH_DEBUG_SERVER_VIEWPORT } from "./DepthIndexes";
import { ScriptingEventsManager } from "./ScriptingEventsManager";
import { FollowManager } from "./FollowManager";
import { InviteManager } from "./InviteManager";
import { LocateManager } from "./LocateManager";
import { DuckRushManager } from "./DuckRushManager";
import { WanderingCharactersManager } from "./Wander/WanderingCharactersManager";
import { WeatherManager } from "./Weather/WeatherManager";
import { TerrainWater } from "./Terrain/TerrainWater";
import { AquaticLife } from "./Life/AquaticLife";
import { AquaticLifeView } from "./Life/AquaticLifeView";
import { iceUnderfoot, isOnFrozenWater, isPoolFrozen, poolIceState, poolStyleUnder } from "./Ice/FrozenWater";
import { cellProbeNow } from "./Weather/CellProbeNow";
import { IceBreaks } from "./Ice/IceBreaks";
import { FrozenPoolsView } from "./Ice/FrozenPoolsView";
import { BODY_CENTER_OFFSET_Y, getFrozenPoolRectangles, isPointInWater } from "./Water/WaterZones";
import { LandLifeView } from "./Life/LandLifeView";
import { GullLifeView, isGullKind } from "./Life/GullLifeView";
import { LandCompanions } from "./Life/LandCompanions";
import { LandCries } from "./Life/LandCries";
import type { HeardAnimal } from "./Life/LandCries";
import { playJungleSound } from "./Jungle/JungleCries";
import { isLandKind } from "./Life/LandSprites";
import { LifeSpeciesStats, withoutSpeciesCounts } from "./Life/LifeSpeciesStats";
import { LifeStats } from "./Life/LifeStats";
import { MapGroundLayout, GRASS_NAME, mapTileIsGrass } from "./Terrain/MapGroundLayout";
import { footprintSurface, GroundFootprints } from "./Terrain/Footprints";
import { WaterGlints } from "./Terrain/WaterGlints";
import { ReliefTiles } from "./Terrain/ReliefTiles";
import { createBlockPaintPool } from "./Terrain/BlockPaintWorkers";
import { blocksStateOf, groundEngineOf } from "./Terrain/GroundEngineChoice";
import type { GroundEngine } from "./Terrain/GroundEngineChoice";
import { GroundEngines } from "./Terrain/GroundEngines";
import type { PixelGround } from "./Terrain/GroundEngines";
import { tellPixelBlocksShown } from "./Terrain/PixelBlocksShown";
import { groundPointAt, heightAtPoint, hiddenBehindRim, shiftAt, shiftOfHeight } from "./Terrain/ReliefProjection";
import { seenPoint } from "./Terrain/ObliqueView";
import { TerrainView } from "./Terrain/TerrainView";
import { groundDropOf, PlacedDrops } from "./Terrain/GroundDrop";
import { FlatGround, SeenRelief } from "./Terrain/BuiltGround";
import { imagePoolsOf } from "./Terrain/ImagePools";
import type { DroppedCharacter } from "./Terrain/CharacterDrops";
import { CharacterDrops } from "./Terrain/CharacterDrops";
import { avatarDrop, ON_A_FLOOR, surfaceDropAt, waterDepthAtPoint } from "./Terrain/AvatarDrop";
import { WaterFlowView } from "./Terrain/WaterFlowView";
import { WaterFlowOverlay } from "./Terrain/WaterFlowOverlay";
import { gunzip } from "./Terrain/WaterStateCodec";
import { MeadowState } from "./Terrain/MeadowState";
import { entityOutdoorRect, OutdoorTracker } from "./Outdoor/OutdoorTracker";
import { feetOf, GameJungle } from "./Jungle/GameJungle";
import { joinedUserId } from "./Jungle/JungleCompanions";
import { InteractionPrompt } from "./Water/InteractionPrompt";
import type { OutdoorGrid } from "./Outdoor/OutdoorGrid";
import { SeasonalThemeManager } from "./Seasonal/SeasonalThemeManager";
import { forcedTreeSeason, SeasonalTheme } from "./Seasonal/SeasonalTheme";
import type { WalkerSample } from "./Christmas/FootprintTrail";
import { NightManager } from "./Night/NightManager";
import { PerfMonitor } from "./Perf/PerfMonitor";
import { skyWeatherFactor } from "./Night/SkyLight";
import { mapDaylightAt } from "./Lamps/MapDaylight";
import { SkyShadowManager } from "./SkyShadows/SkyShadowManager";
import { SkyWindowLightManager } from "./SkyShadows/SkyWindowLightManager";
import { SkyMovingShadows } from "./SkyShadows/SkyMovingShadows";
import type { MovingShadowSource } from "./SkyShadows/SkyMovingShadows";
import { drawableSource } from "./SkyShadows/SkyShadowPicture";
import { NATURE_PREFIX } from "./SkyShadows/SkyShadowCasters";
import type { ShadowSourceEntity } from "./SkyShadows/SkyShadowCasters";
import { LampManager } from "./Lamps/LampManager";
import { parseLampDemo } from "./Lamps/LampDemo";
import { KNOCK_SOUND_KEY, KNOCK_SOUND_URL, KnockManager } from "./Knock/KnockManager";
import { WaveManager } from "./Wave/WaveManager";
import { NerfManager } from "./Nerf/NerfManager";
import { TorchManager } from "./Torch/TorchManager";
import { TORCH_EQUIPPED_VARIABLE, TORCH_INTENSITY_VARIABLE } from "./Torch/TorchProtocol";
import { PERCEPTION_VARIABLE } from "./Perception/PerceptionProtocol";
import { PerceptionManager } from "./Perception/PerceptionManager";
import { FishingManager } from "./Fishing/FishingManager";
import { IceShackManager } from "./IceShack/IceShackManager";
import { groundWind } from "./Weather/Snowfall";
import { MeteorView } from "./Catastrophe/MeteorView";
import { roomHurricaneAir, windOfAir } from "./Weather/HurricaneAir";
import { FireView } from "./Fire/FireView";
import { TreeFireState } from "./Fire/TreeFireState";
import { FallenTreeView } from "./Nature/FallenTreeView";
import { lyingVector } from "./Nature/FallenTreeShape";
import type { TreePose } from "./SkyShadows/SkyShadowGeometry";
import { growShare, growStep } from "./Nature/FallenTreeTexture";
import { TreeFireView } from "./Fire/TreeFireView";
import { DownpourView } from "./Catastrophe/DownpourView";
import { DrainView } from "./Catastrophe/DrainView";
import { BallView } from "./Catastrophe/BallView";
import { ColdView } from "./Catastrophe/ColdView";
import { HurricaneReceiver } from "./Catastrophe/HurricaneReceiver";
import { TsunamiReceiver } from "./Catastrophe/TsunamiReceiver";
import { HurricaneDebris } from "./Catastrophe/HurricaneDebris";
import { HurricaneView, seaHurricaneOf } from "./Catastrophe/HurricaneView";
import { ZombieReceiver } from "./Catastrophe/ZombieReceiver";
import { ZombieView } from "./Catastrophe/ZombieView";
import { FireTorchView } from "./Catastrophe/FireTorchView";
import { ROD_EQUIPPED_VARIABLE } from "./Fishing/FishingProtocol";
import { NERF_EQUIPPED_VARIABLE, NERF_HEARTS_VARIABLE, NERF_SOUND_KEY, NERF_SOUND_URL } from "./Nerf/NerfProtocol";
import { CoffeeManager } from "./Coffee/CoffeeManager";
import { KonamiCodeDetector } from "./KonamiCodeDetector";
import { uiWebsiteManager } from "./UI/UIWebsiteManager";
import { ScriptingVideoManager } from "./ScriptingVideoManager";
import { UsernameDomLayer } from "./UsernameDomLayer";

import Tileset = Phaser.Tilemaps.Tileset;
import Tilemap = Phaser.Tilemaps.Tilemap;
import PhysicsSprite = Phaser.Physics.Arcade.Sprite;
import CanvasTexture = Phaser.Textures.CanvasTexture;
import DOMElement = Phaser.GameObjects.DOMElement;
import Graphics = Phaser.GameObjects.Graphics;
import WebGLRenderer = Phaser.Renderer.WebGL.WebGLRenderer;
import Sprite = Phaser.GameObjects.Sprite;
import Body = Phaser.Physics.Arcade.Body;
import StaticBody = Phaser.Physics.Arcade.StaticBody;
import Tile = Phaser.Tilemaps.Tile;
import Color = Phaser.Display.Color;
import Pointer = Phaser.Input.Pointer;
import Clamp = Phaser.Math.Clamp;

const MOUSE_WHEEL_ZOOM_RATE = 0.5;
const CONVERSATION_BUBBLE_SPATIAL_GRID_SIZE = 64;
/** How often the volumes of an overheard bubble follow the players: often enough for a walk, not every frame. */
const OVERHEARD_LOUDNESS_PERIOD_MS = 200;
/** How often the names of the players in the discussion of the local player are marked again. */
const DISCUSSION_MARKS_PERIOD_MS = 250;
/** How high over the feet of an avatar its video bubble stands, in map pixels (AvatarVideoBubble). */
const CALL_BUBBLE_ABOVE_FEET_PX = 40;

export interface GameSceneInitInterface {
    reconnecting: boolean;
    initPosition?: PositionInterface;
}

interface GroupCreatedUpdatedEventInterface {
    type: "GroupCreatedUpdatedEvent";
    event: GroupCreatedUpdatedMessageInterface;
}

interface DeleteGroupEventInterface {
    type: "DeleteGroupEvent";
    groupId: number;
}

interface GroupUsersUpdatedEventInterface {
    type: "GroupUsersUpdatedEvent";
    event: GroupUsersUpdateMessage;
}

interface PositionCoordinates {
    x: number;
    y: number;
}

const WORLD_SPACE_NAME = "allWorldUser";
const debug = Debug("GameScene");

// Safety cap for moveTo() reroutes when the collision grid keeps changing while the path is followed.
const MAX_PATH_REROUTES = 5;

/** The pieces of a wall two tiles high or more, by their identifier (`…-h2`, `…-h3`, `…-h4`). */
const TALL_WALL = /-h[234](?:[-:]|$)/;

/** Water this deep, in pixels, makes the ground wet: the burst of a meteor is then water, not dust. */
const METEOR_WET_DEPTH_PX = 2;

/** The relief seen in 3/4, with what goes with it; its blocks are asked by the clicks and the footprints. */
interface PixelRelief extends PixelGround {
    tiles: ReliefTiles;
}

/** How long the map waits, at most, for the meadow and the water sent on joining before it is shown. */
const FIRST_GROUND_WAIT_MS = 2000;

export class GameScene extends DirtyScene {
    Terrains: Array<Tileset>;
    CurrentPlayer!: Player;
    MapPlayersByKey: MapStore<number, RemotePlayer> = new MapStore<number, RemotePlayer>();
    CurrentRemotePlayerLocated: RemotePlayer | undefined = undefined;
    CurrentChatUserLocated: ChatUser | undefined = undefined;
    Map!: Tilemap;
    Objects!: Array<PhysicsSprite>;
    mapFile!: ITiledMap;
    wamFile!: WAMFileFormat;
    groups: Map<number, ConversationBubble>;
    circleTexture!: CanvasTexture;
    circleRedTexture!: CanvasTexture;
    pendingEvents = new Queue<
        GroupCreatedUpdatedEventInterface | DeleteGroupEventInterface | GroupUsersUpdatedEventInterface
    >();
    public connection: RoomConnection | undefined;
    mapUrlFile!: string;
    wamUrlFile?: string;
    roomUrl: string;
    currentTick!: number;
    lastSentTick!: number; // The last tick at which a position was sent.
    lastMoveEventSent: HasPlayerMovedInterface = {
        direction: PositionMessage_Direction.DOWN,
        moving: false,
        running: false,
        x: -1000,
        y: -1000,
        oldX: -1000,
        oldY: -1000,
    };
    public userInputManager!: UserInputManager;
    public readonly superLoad: SuperLoaderPlugin;
    private initPosition?: PositionInterface;
    private playersPositionInterpolator = new PlayersPositionInterpolator();
    // Promise resolved when we receive the first message of the roomConnection (RoomConnectedMessage)
    private connectionAnswerPromiseDeferred: Deferred<void>;
    private roomJoinedPromiseDeferred: Deferred<RoomJoinedMessageInterface>;
    // Resolved once the chat connection is ready (the Matrix initial sync included) and the user's Matrix id, if any,
    // was sent to the server. Until then, the server cannot invite the user into a room. The map does not wait for it.
    public chatIdSentDeferred: Deferred<void>;
    // true is soon as the roomConnection received the "roomJoined" message.
    private hasJoinedRoom: boolean = false;
    // A promise that will resolve when the "create" method is called (signaling loading is ended)
    private createPromiseDeferred: Deferred<void>;
    // A promise that will resolve when the scene is ready to start (all assets have been loaded and the connection to the room is established)
    private sceneReadyToStartDeferred: Deferred<void> = new Deferred<void>();
    private iframeSubscriptionList: Array<Subscription> = [];
    private gameMapChangedSubscription!: Subscription;
    private tileAnimationRefreshEvent: Phaser.Time.TimerEvent | undefined;
    private messageSubscription: Subscription | null = null;
    private rxJsSubscriptions: Array<Subscription> = [];
    // Player ids of remote players whose raised hand is currently shown above their woka (to diff on store updates).
    private previousRaisedHandPlayerIds = new Set<number>();
    private listeningUserUuids = new Set<string>();
    private localVolumeStoreUnsubscriber: Unsubscriber | undefined;
    private unsubscribers: Unsubscriber[] = [];
    /** Whether the map snow shows for this person (trees, Christmas decor): read once per change, not at every image. */
    private storesSubscribed = false;
    private entityPermissions: EntityPermissions | undefined;
    private entityPermissionsDeferred: Deferred<EntityPermissions> = new Deferred();
    private gameMapFrontWrapper!: GameMapFrontWrapper;
    private actionableItems: Map<number, ActionableItem> = new Map<number, ActionableItem>();
    private isReconnecting: boolean | undefined = undefined;
    private playerName!: string;
    private popUpElements: Map<number, DOMElement> = new Map<number, DOMElement>();
    private remotePlayersSpatialIndex = new SpatialMap<number, RemotePlayer>(CONVERSATION_BUBBLE_SPATIAL_GRID_SIZE);
    private originalMapUrl: string | undefined;
    private exteriorTextureKey: string | undefined;
    private pinchManager: PinchManager | undefined;
    private outlineManager!: OutlineManager;
    private mapTransitioning = false; //used to prevent transitions happening at the same time.
    private emoteManager!: EmoteManager;
    private entityAudioManager!: EntityAudioManager;
    private cameraManager!: CameraManager;
    private mapEditorModeManager: MapEditorModeManager | undefined;
    private doorAnimator: DoorAnimator | undefined;
    /** The doors of the raised floors. */
    private upperDoors: UpperDoors | undefined;
    private doorLockIcons: DoorLockIcons | undefined;
    private footstepSounds: FootstepSounds | undefined;
    private airplaneSounds: AirplaneSounds | undefined;
    private skateboardSounds: SkateboardSounds | undefined;
    private entitiesCollectionsManager!: EntitiesCollectionsManager;
    private pathfindingManager!: PathfindingManager;
    private activatablesManager!: ActivatablesManager;
    private preloading = true;
    private sharedVariablesManager!: SharedVariablesManager;
    private areaPropertyVariablesManager!: AreaPropertyVariablesManager;
    private entityStatesManager: EntityStatesManager | undefined;
    private playerVariablesManager!: PlayerVariablesManager;
    private scriptingEventsManager!: ScriptingEventsManager;
    private followManager!: FollowManager;
    public inviteManager?: InviteManager;
    private locateManager!: LocateManager;
    private duckRushManager: DuckRushManager | undefined;
    private wanderingCharactersManager: WanderingCharactersManager | undefined;
    // Lions and tigers around the outdoor trees, given to the wandering characters (see GameJungle).
    private gameJungle: GameJungle | undefined;
    private nightManager: NightManager | undefined;
    private perfMonitor: PerfMonitor | undefined;
    private unsubscribeAreaHighlight: Unsubscriber | undefined;
    private lampManager: LampManager | undefined;
    private gameSwitches: GameSwitches | undefined;
    private weatherManager: WeatherManager | undefined;
    /** The water of the hollows of the relief, as the server keeps it. */
    private readonly terrainWater = new TerrainWater();
    /** When the bridges of the map were last read, in ms of the game. */
    private bridgesReadAt = -Infinity;
    /** The bridges of the map: decks one walks up to from the ground (see bridgesOf). */
    private bridges: Bridges | undefined;
    /** The grass and the moisture of the soil of the map, as the server tells them. */
    private readonly meadow = new MeadowState();
    /**
     * The own ground of this player while they follow the weather of a place they chose (Jour dans le monde, a point
     * of the world map): their lakes, rivers and meadow live under it, the server's are kept aside until they leave it.
     */
    /** The drains seen under the water that covers them, until they drained it. */
    private readonly submergedDrains = new SubmergedDrains(
        () => this.gameMapFrontWrapper?.getEntitiesManager().getEntities().values() ?? [],
        (x, y) => this.terrainWater.depthAt(x, y, this.time.now),
    );
    private readonly localTerrain = new LocalTerrainController(
        {
            chosenPlace: () => {
                if (isBasicActive() || get(mapEditorModeStore) || !showsChosenPlaceWeather()) return undefined;
                const { place, state } = chosenWeatherNow();
                return place && { place, slots: state.status === "known" ? state.slots : undefined };
            },
            fastWater: () => {
                if (!fastWaterActiveNow()) return undefined;
                const file = this.gameMapFrontWrapper ? this.getGameMap().getWamFile() : undefined;
                return { slots: mapPlaceSlotsNow(file?.getWam().settings?.weatherLocation) };
            },
            backToSharedWater: () => sharedWaterBackStore.set(performance.now()),
            map: () => {
                const file = this.gameMapFrontWrapper ? this.getGameMap().getWamFile() : undefined;
                if (!file) return undefined;
                return {
                    wam: file.getWam(),
                    key: file.getLastCommandId() ?? "",
                    mapCells: mapCellsOf(this.getGameMap().getMap()),
                };
            },
            walkers: () =>
                this.CurrentPlayer && this.CurrentPlayer.getFloorZ() < 2
                    ? [{ x: this.CurrentPlayer.x, y: this.CurrentPlayer.y }]
                    : [],
            water: this.terrainWater,
            showWaterStats: (stats) => terrainWaterStatsStore.set(stats),
            showMeadow: (state) => this.meadow.receive(state),
        },
        async () => {
            const { default: workerUrl } = await import("./Terrain/LocalTerrainWorker?worker&url");
            return openModuleWorker(workerUrl);
        },
        () => this.time.now,
    );
    /** The local ground stops while the tab is hidden, and starts again from the server's when it comes back. */
    private readonly tabVisibilityChanged = (): void => this.localTerrain.hidden(document.hidden);
    private meadowSubscription: Subscription | undefined;
    private readonly treeFire = new TreeFireState();
    private treeFireSubscription: Subscription | undefined;
    private hurricaneAirSubscription: Subscription | undefined;
    private fireConditionsSubscription: Subscription | undefined;
    private meadowQueue: Promise<void> = Promise.resolve();
    private terrainWaterSubscription: Subscription | undefined;
    private meteorView: MeteorView | undefined;
    private fireView: FireView | undefined;
    private treeFireView: TreeFireView | undefined;
    /** The trees the wind laid down, lying on the ground (made at the first one). */
    private fallenTreeView: FallenTreeView | undefined;
    private downpourView: DownpourView | undefined;
    private drainView: DrainView | undefined;
    private ballView: BallView | undefined;
    private coldView: ColdView | undefined;
    private hurricaneReceiver: HurricaneReceiver | undefined;
    private tsunamiReceiver: TsunamiReceiver | undefined;
    private hurricaneView: HurricaneView | undefined;
    /** The debris the wind of a hurricane (or a wind of the map strong enough) carries, drawn here alone. */
    private hurricaneDebris: HurricaneDebris | undefined;
    /** The flood of the hurricane as this browser sees it: the rise of the water, the marks it leaves. */
    private hurricaneFlood: HurricaneFloodView | undefined;
    /** The horde of zombies of the room: what the server tells of it, and its crowd drawn. */
    private zombieReceiver: ZombieReceiver | undefined;
    /** When this player shot their last grenade (scene time, ms). */
    private zombieGrenadeShotAt = -Infinity;
    /** The grenades this player shot into the horde it shoots at; the launcher is put away once they are all shot. */
    private zombieGrenadesShot = { horde: -1, shot: 0 };
    private zombieView: ZombieView | undefined;
    /** When the panel was last told the horde (ms, the clock of the game). */
    private zombieToldAt = 0;
    private shownFloodRise: number | undefined;
    private fireTorchView: FireTorchView | undefined;
    private catastropheSubscription: Subscription | undefined;
    /** The animals of the water of the relief, as the server tells them. */
    private readonly aquaticLife = new AquaticLife();
    /** The ice of the frozen pools and the steam of the heated ones, in the cold. */
    private frozenPoolsView: FrozenPoolsView | undefined;
    private aquaticLifeView: AquaticLifeView | undefined;
    private readonly gullLife = new AquaticLife(isGullKind);
    private gullLifeView: GullLifeView | undefined;
    /** The animals of the land the server runs (antelopes, lions, tigers). */
    private readonly landLife = new AquaticLife(isLandKind);
    private landLifeView: LandLifeView | undefined;
    private landCompanions: LandCompanions | undefined;
    private landCries: LandCries | undefined;
    private landTamePrompt: InteractionPrompt | undefined;
    private landReleasePrompt: InteractionPrompt | undefined;
    private readonly aquaticLifeStats = new LifeStats();
    private readonly aquaticLifeSpecies = new LifeSpeciesStats();
    private aquaticLifeSubscription: Subscription | undefined;
    private mapGroundLayout: MapGroundLayout | undefined;
    /**
     * The relief seen in 3/4, in pixel art: its blocks and their workers, the glints of its water, the footprints on
     * its ground. Made only for who chose it (GroundEngines).
     */
    private pixelRelief: GroundEngines<PixelRelief> | undefined;
    /**
     * The engine of the ground: flat, or the relief seen in 3/4 where its shaders can draw it (the pools, the ice, the
     * frost come with it). It draws unless the blocks do (pixelBlocksShown).
     */
    private terrainView: TerrainView | undefined;
    /** The relief and the mode the drops of the things on the ground were last read with (reliefDrawVersion). */
    private reliefDrawn: { terrain: TerrainData | undefined; shown: boolean; version: number } = {
        terrain: undefined,
        shown: false,
        version: 0,
    };
    /** The engine that draws the ground, and the image of the game it was worked out at (groundEngine). */
    private groundEngineNow: GroundEngine = "flat";
    private groundEngineAt = -1;
    /** The characters drawn lower in the hollows of the relief, while the image is drawn. */
    private characterDrops: CharacterDrops | undefined;
    private placedDrops: PlacedDrops<Entity> | undefined;
    private seenRelief: SeenRelief | undefined;
    private waterFlowView: WaterFlowView | undefined;
    private waterFlowOverlay: WaterFlowOverlay | undefined;
    private terrainWaterQueue: Promise<void> = Promise.resolve();
    private skyShadowManager: SkyShadowManager | undefined;
    private skyWindowLightManager: SkyWindowLightManager | undefined;
    private skyMovingShadows: SkyMovingShadows | undefined;
    /** What throws a shadow of the sky for this person (skyShadowCategoriesStore). */
    private skyShadowCategories: SkyShadowCategories | undefined;
    private unsubscribeSkyShadowCategories: Unsubscriber | undefined;
    /** Trees of the nature catalogue swaying with the wind of the map weather. */
    private treeSway: TreeSway | undefined;
    /** The bent images the swaying trees are drawn with. */
    private treePoses: TreePoseTextures | undefined;
    /** Leaves falling from the autumn trees, snow building up on the snowy ones and falling off them. */
    private treeSeasonEffects: TreeSeasonEffects | undefined;
    /** SPIKE (floors study), `?palier=1`. */
    public floorSpike: FloorSpike | undefined;
    private outdoorTracker: OutdoorTracker | undefined;
    /** See-through walls, for the local player only: in the map editor, and the high walls of their room. */
    private wallFade: WallFade | undefined;
    /** The altitude of the raised floor the player stood on before a reload, until the floors are there to take it. */
    private floorToRestore: number | undefined;
    private fadedWallFloor: FadedWallFloorView | undefined;
    private seasonalThemeManager: SeasonalThemeManager | undefined;
    private _knockManager: KnockManager | undefined;
    private _waveManager: WaveManager | undefined;
    private _nerfManager: NerfManager | undefined;
    private _torchManager: TorchManager | undefined;
    private _perceptionManager: PerceptionManager | undefined;
    private _fishingManager: FishingManager | undefined;
    private _iceShackManager: IceShackManager | undefined;
    private karaokeSpotlight: KaraokeSpotlight | undefined;
    private _coffeeManager: CoffeeManager | undefined;
    /** Animated treadmills move their belt only while someone runs on them. */
    public readonly treadmillBelts = new TreadmillBelts((entityId) =>
        this.gameMapFrontWrapper?.getEntitiesManager().getEntities().get(entityId),
    );
    private konamiCodeDetector: KonamiCodeDetector | undefined;
    private hasMovedThisFrame: boolean = false;

    private proximitySpaceManager: ProximitySpaceManager | undefined;
    private bubbleListeningManager: BubbleListeningManager | undefined;
    private overheardLoudnessUpdatedAt = -Infinity;
    private discussionMarksUpdatedAt = -Infinity;
    /** The players whose name is marked as in the discussion of the local player (see updateDiscussionMarks). */
    private discussionMarked = new Set<number>();
    private scriptingVideoManager: ScriptingVideoManager | undefined;
    private gameMapPropertiesListener: GameMapPropertiesListener | undefined;
    private objectsByType = new Map<string, ITiledMapObject[]>();
    private embeddedWebsiteManager!: EmbeddedWebsiteManager;
    private areaManager!: DynamicAreaManager;
    private _sayManager: SayManager | undefined;
    private loader: Loader;
    private lastCameraEvent: WasCameraUpdatedEvent | undefined;
    private firstCameraUpdateSent = false;
    private currentPlayerGroupId?: number;
    private showVoiceIndicatorChangeMessageSent = false;
    private jitsiDominantSpeaker = false;
    private jitsiParticipantsCount = 0;
    private readonly worldLoadStartedAt = performance.now();
    private mapLoadSucceededAnalyticsSent = false;
    private mapLoadFailedAnalyticsSent = false;
    private cleanupDone = false;
    private playersEventDispatcher = new IframeEventDispatcher();
    private playersMovementEventDispatcher = new IframeEventDispatcher();
    private remotePlayersRepository = new RemotePlayersRepository();
    public usernameDomLayer!: UsernameDomLayer;
    private throttledSendViewportToServer_!: throttle<() => void>;
    private lastSentViewport: ViewportInterface | undefined;
    private serverViewportDebugGraphics: Graphics | undefined;
    private playersDebugLogAlreadyDisplayed = false;
    private hideTimeout: ReturnType<typeof setTimeout> | undefined;
    // The promise that will resolve to the current player textures. This will be available only after connection is established.
    private currentPlayerTexturesResolve!: (value: string[]) => void;
    private currentPlayerTexturesReject!: (reason: unknown) => void;
    private currentPlayerTexturesPromise: CancelablePromise<string[]> = new CancelablePromise((resolve, reject) => {
        this.currentPlayerTexturesResolve = resolve;
        this.currentPlayerTexturesReject = reject;
    });
    private currentCompanionTextureResolve!: (value: string) => void;
    private currentCompanionTextureReject!: (reason: unknown) => void;
    private currentCompanionTexturePromise: CancelablePromise<string> = new CancelablePromise((resolve, reject) => {
        this.currentCompanionTextureResolve = resolve;
        this.currentCompanionTextureReject = reject;
    });
    private _applicationManager: ApplicationManager | undefined;
    private _spaceRegistry: SpaceRegistryInterface | undefined;
    private spaceScriptingBridgeService: SpaceScriptingBridgeService | undefined;
    private allUserSpace: SpaceInterface | undefined;
    private isLiveStreamingUnsubscriber: Unsubscriber | undefined;
    private shouldPublishScreenShareUnsubscriber: Unsubscriber | undefined;
    private unregisterAudioContextPlaybackRetry: Unsubscriber | undefined;
    private _proximityChatRoom: ProximityChatRoom | undefined;
    private _proximityChatRoomManager: ProximityChatRoomManager | undefined;
    private _userProviderMergerDeferred: Deferred<UserProviderMerger> = new Deferred();
    private _worldUserCounter: ForwardableStore<number> = new ForwardableStore(0);
    public extensionModule: ExtensionModule | undefined = undefined;
    public landingAreas: AreaData[] = [];
    // Listeners for when the player finishes moving
    private onPlayerMovementEndedCallbacks: Array<(event: HasPlayerMovedInterface) => void> = [];

    private enterLeaveScriptingService: EnterLeaveScriptingService | undefined;

    public _chatConnection: ChatConnectionInterface | undefined;
    private _proximityChatRoomDeferred: Deferred<ProximityChatRoom> = new Deferred();
    private _proximityChatRoomManagerDeferred: Deferred<ProximityChatRoomManager> = new Deferred();
    private _focusFx: DarkenOutsideAreaEffect | undefined;
    private abortController: AbortController = new AbortController();

    // FIXME: we need to put a "unknown" instead of a "any" and validate the structure of the JSON we are receiving.

    constructor(
        private _room: Room,
        customKey?: string,
        private _isInsidePersonalAreaStore = isInsidePersonalAreaStore,
    ) {
        super({
            key: customKey ?? _room.key,
        });

        this.Terrains = [];
        this.groups = new Map<number, ConversationBubble>();

        // TODO: How to get mapUrl from WAM here?
        if (_room.mapUrl) {
            this.mapUrlFile = _room.mapUrl;
        } else if (_room.wamUrl) {
            this.wamUrlFile = _room.wamUrl;
        }
        this.roomUrl = _room.key;
        analyticsClient.trackAdminEvent("map_loading.started", {
            mapUrl: stripUrlSensitiveParts(this.mapUrlFile || this.wamUrlFile || this.roomUrl),
        });

        this.entitiesCollectionsManager = new EntitiesCollectionsManager();

        this.createPromiseDeferred = new Deferred<void>();
        this.connectionAnswerPromiseDeferred = new Deferred<void>();
        this.roomJoinedPromiseDeferred = new Deferred<RoomJoinedMessageInterface>();
        this.chatIdSentDeferred = new Deferred<void>();
        this.loader = new Loader(this);
        this.superLoad = new SuperLoaderPlugin(this);
    }

    private _broadcastService: BroadcastService | undefined;

    public get broadcastService(): BroadcastService {
        if (this._broadcastService === undefined) {
            throw new Error("BroadcastService not initialized yet.");
        }
        return this._broadcastService;
    }

    //hook preload scene
    preload(): void {
        this.load.image(AIRPLANE_SOURCE_TEXTURE, AIRPLANE_IMAGE_URL);
        // The ground textures of the relief (soils, grass, snow): ready before its first drawing.
        for (const url of GROUND_TEXTURE_URLS) this.load.image(url, url);
        //initialize frame event of scripting API
        this.listenToIframeEvents();

        this.load.image("iconFocus", "/resources/icons/icon_focus.png");
        this.load.image("iconLink", "/resources/icons/icon_link.png");
        this.load.image("iconListenerMegaphone", "/resources/icons/icon_listener.png");
        this.load.image("iconSpeakerMegaphone", "/resources/icons/icon_speaker.png");
        this.load.image("iconSilent", "/resources/icons/icon_silent.png");
        this.load.image("iconMeeting", "/resources/icons/icon_meeting.png");
        DuckRushManager.preload(this);

        // Load the selected bubble sound from bubbleSoundStore
        const selectedBubbleSound = get(bubbleSoundStore);
        this.load.audio(
            `audio-webrtc-in-${selectedBubbleSound}`,
            `/resources/objects/webrtc-in-${selectedBubbleSound}.mp3`,
        );
        this.load.audio(
            `audio-webrtc-out-${selectedBubbleSound}`,
            `/resources/objects/webrtc-out-${selectedBubbleSound}.mp3`,
        );
        this.load.audio("audio-cloud", "/resources/objects/cloud.mp3");
        this.load.audio("new-message", "/resources/objects/new-message.mp3");
        this.load.audio(DOOR_SOUND_KEYS.open, DOOR_SOUND_URLS.open);
        this.load.audio(DOOR_SOUND_KEYS.close, DOOR_SOUND_URLS.close);
        this.load.audio(KNOCK_SOUND_KEY, KNOCK_SOUND_URL);
        this.load.audio(NERF_SOUND_KEY, NERF_SOUND_URL);
        for (const { key, url } of [
            ...FOOTSTEP_SOUNDS,
            ...SKATEBOARD_SOUNDS,
            AIRPLANE_SOUND,
            ...WEATHER_SOUNDS.filter((sound) => sound.key === "audio-weather-thunder"),
        ]) {
            this.load.audio(key, url);
        }
        this.load.audio("meeting-in", "/resources/objects/meeting-in.wav");
        this.load.audio("meeting-out", "/resources/objects/meeting-out.wav");

        this.sound.pauseOnBlur = false;
        // Bubble, meeting and scripting API sounds play through Phaser's own AudioContext (absent when Phaser falls back
        // to HTML5 audio), bypassing media elements: it follows the selected audio output itself.
        if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
            this.unsubscribers.push(bindAudioOutput(this.sound.context));
        }

        this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: { src: string }) => {
            // If we happen to be in HTTP and we are trying to load a URL in HTTPS only... (this happens only in dev environments)
            if (
                window.location.protocol === "http:" &&
                file.src === this.mapUrlFile &&
                file.src.startsWith("http:") &&
                this.originalMapUrl === undefined
            ) {
                this.originalMapUrl = this.mapUrlFile;
                this.mapUrlFile = this.mapUrlFile.replace("http://", "https://");
                this.load.tilemapTiledJSON(this.mapUrlFile, this.mapUrlFile);
                this.load.on(
                    "filecomplete-tilemapJSON-" + this.mapUrlFile,
                    (key: string, type: string, data: unknown) => {
                        this.onMapLoad(data).catch((e) => console.error(e));
                    },
                );
                return;
            }
            // 127.0.0.1, localhost and *.localhost are considered secure, even on HTTP.
            // So if we are in https, we can still try to load a HTTP local resource (can be useful for testing purposes)
            // See https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts#when_is_a_context_considered_secure
            const base = new URL(window.location.href);
            base.pathname = "";
            const url = new URL(file.src, base.toString());
            const host = url.host.split(":")[0];
            if (
                window.location.protocol === "https:" &&
                file.src === this.mapUrlFile &&
                (host === "127.0.0.1" || host === "localhost" || host.endsWith(".localhost")) &&
                this.originalMapUrl === undefined
            ) {
                this.originalMapUrl = this.mapUrlFile;
                this.mapUrlFile = this.mapUrlFile.replace("https://", "http://");
                this.load.tilemapTiledJSON(this.mapUrlFile, this.mapUrlFile);
                this.load.on(
                    "filecomplete-tilemapJSON-" + this.mapUrlFile,
                    (key: string, type: string, data: unknown) => {
                        this.onMapLoad(data).catch((e) => console.error(e));
                    },
                );
                // If the map has already been loaded as part of another GameScene, the "on load" event will not be triggered.
                // In this case, we check in the cache to see if the map is here and trigger the event manually.
                if (this.cache.tilemap.exists(this.mapUrlFile)) {
                    const data = this.cache.tilemap.get(this.mapUrlFile);
                    this.onMapLoad(data.data).catch((e) => console.error(e));
                }
                return;
            }

            //once preloading is over, we don't want loading errors to crash the game, so we need to disable this behavior after preloading.
            //if SpriteSheetFile (WOKA file) don't display error and give an access for user
            if (this.preloading && !(file instanceof Phaser.Loader.FileTypes.SpriteSheetFile)) {
                analyticsClient.trackAdminEvent("asset.error", {
                    kind: "asset",
                    reason: stripUrlSensitiveParts(file?.src ?? this.originalMapUrl),
                });
                //remove loader in progress
                this.handleErrorAndCleanup(
                    new Error('Cannot load "' + (file?.src ?? this.originalMapUrl) + '"'),
                    "NETWORK_ERROR",
                    "Network error",
                    "An error occurred while loading a resource",
                );
            }
        });

        if (this.wamUrlFile) {
            const absoluteWamFileUrl = new URL(this.wamUrlFile, window.location.href).toString();

            this.superLoad.loadPromise(
                axiosWithRetry.get(absoluteWamFileUrl).then((response) => {
                    try {
                        this.wamFile = wamFileMigration.migrate(response.data);
                        this.mapUrlFile = new URL(this.wamFile.mapUrl, absoluteWamFileUrl).toString();
                        this.doLoadTMJFile(this.mapUrlFile);
                        this.loadEntityCollections();
                    } catch (error) {
                        this.handleErrorAndCleanup(
                            error,
                            "WAM_FILE_LOAD_ISSUE",
                            "Error when loading WAM file",
                            "Unknown error while loading WAM file",
                        );
                        return;
                    }
                }),
            );
        } else {
            this.doLoadTMJFile(this.mapUrlFile);
        }

        //this function must stay at the end of preload function
        this.loader.addLoader();
    }

    private handleErrorAndCleanup(
        error: Error | unknown,
        errorCode: string,
        errorTitle: string,
        errorSubtitle: string,
    ) {
        console.error(error);

        // In case an error is already displayed, let's do nothing. We want the first error to be kept visible.
        if (get(errorScreenStore)) {
            return;
        }

        this.trackMapLoadingFailure(errorCode);
        this.loader.removeLoader();
        errorScreenStore.setError(
            ErrorScreenMessage.fromPartial({
                type: "error",
                code: errorCode,
                title: errorTitle,
                subtitle: errorSubtitle,
                details: error instanceof Error ? error.message : "Unknown error",
            }),
        );

        this.cleanupClosingScene();
        this.scene.stop(this.scene.key);
        this.scene.remove(this.scene.key);
    }

    public getCustomEntityCollectionUrl() {
        if (this.wamUrlFile === undefined) {
            throw new Error("Cannot resolve the custom entity collection URL: the map has no WAM file.");
        }
        return getCustomEntityCollectionUrl(this.wamUrlFile, PUBLIC_MAP_STORAGE_PREFIX);
    }

    //hook initialisation
    init(initData: GameSceneInitInterface) {
        if (initData.initPosition !== undefined) {
            this.initPosition = initData.initPosition; //todo: still used?
        }
        if (initData.initPosition !== undefined) {
            this.isReconnecting = initData.reconnecting;
        }
    }

    //hook create scene
    create(): void {
        window.addEventListener("pagehide", this.saveCurrentPosition);
        this.input.topOnly = false;
        this.preloading = false;
        this.cleanupDone = false;
        // Its own ground, once shown, holds the snow and the ice of this player (GroundSource.meadowHoldsSnow).
        setLocalGroundShown(() => this.localTerrain.isLocal());
        setFastWaterResynchronize(() => this.localTerrain.resynchronize());
        document.addEventListener("visibilitychange", this.tabVisibilityChanged);

        this.bindSceneEventHandlers();

        this.trackDirtyAnims();

        this.outlineManager = new OutlineManager(this);
        gameManager.gameSceneIsCreated(this);
        urlManager.pushRoomIdToUrl(this._room);
        analyticsClient.enteredRoom(this._room.id, this._room.group);
        this.trackMapLoadingSuccess();
        contactPageStore.set(this._room.contactPage);

        if (touchScreenManager.supportTouchScreen) {
            this.pinchManager = new PinchManager(this);
        }

        const playerName = gameManager.getPlayerName();
        if (!playerName) {
            throw new Error("playerName is not set");
        }
        this.playerName = playerName;
        try {
            this.Map = this.add.tilemap(this.mapUrlFile);
        } catch (e) {
            // Error when loading the map, probably because the map file is not a valid TMJ file.
            this.handleErrorAndCleanup(
                e,
                "MAP_FILE_LOAD_ISSUE",
                "Error when loading map file",
                `An error occurred while loading the map file "${this.mapUrlFile}". Please check the URL or contact the map administrator.`,
            );
            return;
        }
        const mapDirUrl = this.mapUrlFile.substring(0, this.mapUrlFile.lastIndexOf("/"));
        this.mapFile.tilesets.forEach((tileset: ITiledMapTileset) => {
            if ("source" in tileset) {
                throw new Error(
                    `Tilesets must be embedded in a map. The tileset "${tileset.source}" must be embedded in the Tiled map "${this.mapUrlFile}".`,
                );
            }
            if (!("image" in tileset)) {
                throw new Error(
                    `Tilesets made of a collection of images are not supported in WorkAdventure in the Tiled map "${this.mapUrlFile}".`,
                );
            }
            const tilesetImage = this.Map.addTilesetImage(
                tileset.name,
                `${mapDirUrl}/${tileset.image}`,
                tileset.tilewidth,
                tileset.tileheight,
                tileset.margin,
                tileset.spacing /*, tileset.firstgid*/,
            );
            if (tilesetImage) {
                this.Terrains.push(tilesetImage);
            } else {
                console.warn(`Failed to add TilesetImage ${tileset.name}: ${`${mapDirUrl}/${tileset.image}`}`);
            }
        });

        this.throttledSendViewportToServer_ = throttle(200, () => {
            this._sendViewportToServer();
        });

        //permit to set bound collision
        this.physics.world.setBounds(0, 0, this.Map.widthInPixels, this.Map.heightInPixels);

        if (this.exteriorTextureKey !== undefined) {
            // Match the camera's extended bounds and anchor the repeating ground at the map origin.
            this.add
                .tileSprite(
                    -this.Map.widthInPixels,
                    -this.Map.heightInPixels,
                    this.Map.widthInPixels * 3,
                    this.Map.heightInPixels * 3,
                    this.exteriorTextureKey,
                )
                .setOrigin(0)
                .setDepth(-3)
                .setTilePosition(-this.Map.widthInPixels, -this.Map.heightInPixels);
        }

        this.usernameDomLayer = new UsernameDomLayer(this);

        this.embeddedWebsiteManager = new EmbeddedWebsiteManager(this);

        //add layer on map
        this.gameMapFrontWrapper = new GameMapFrontWrapper(
            this,
            new GameMap(this.mapFile, this.wamFile),
            this.Map,
            this.Terrains,
        );
        this.gameMapFrontWrapper.initialize().catch((e) => console.error(e));
        for (const layer of this.gameMapFrontWrapper.getFlatLayers()) {
            if (layer.type === "tilelayer") {
                const exitSceneUrl = this.getExitSceneUrl(layer);
                if (exitSceneUrl !== undefined) {
                    this.loadNextGame(
                        Room.getRoomPathFromExitSceneUrl(exitSceneUrl, window.location.toString(), this.mapUrlFile),
                    ).catch((e) => console.error(e));
                }
                const exitUrl = this.getExitUrl(layer);
                if (exitUrl !== undefined) {
                    this.loadNextGameFromExitUrl(exitUrl).catch((e) => console.error(e));
                }
            }
            if (layer.type === "objectgroup") {
                for (const object of layer.objects) {
                    if (object.text) {
                        TextUtils.createTextFromITiledMapObject(this, object);
                    }
                    if (object.class === "website") {
                        // Let's load iframes in the map
                        const url = PropertyUtils.mustFindStringProperty(
                            GameMapProperties.URL,
                            object.properties,
                            'in the "' + object.name + '" object of type "website"',
                        );
                        const allowApi = PropertyUtils.findBooleanProperty(
                            GameMapProperties.ALLOW_API,
                            object.properties,
                        );
                        const policy = PropertyUtils.findStringProperty(GameMapProperties.POLICY, object.properties);

                        this.embeddedWebsiteManager.createEmbeddedWebsite(
                            object.name,
                            url,
                            object.x,
                            object.y,
                            object.width ?? 0,
                            object.height ?? 0,
                            object.visible,
                            allowApi ?? false,
                            policy ?? "",
                            "map",
                            1,
                        );
                    }
                }
            }
        }

        this.gameMapFrontWrapper.getExitUrls().forEach((exitUrl) => {
            this.loadNextGameFromExitUrl(exitUrl).catch((e) => console.error(e));
        });

        // TODO: Dynamic areas should be exclusively managed on the front side
        this.areaManager = new DynamicAreaManager(this.gameMapFrontWrapper);

        //create input to move
        this.userInputManager = new UserInputManager(this, new GameSceneUserInputHandler(this));
        mediaManager.setUserInputManager(this.userInputManager);

        //add entities
        this.Objects = new Array<PhysicsSprite>();

        if (localUserStore.getFullscreen()) {
            document
                .querySelector("body")
                ?.requestFullscreen()
                .catch((e) => console.error(e));
        }

        this.pathfindingManager = new PathfindingManager(
            this.gameMapFrontWrapper.getCollisionGrid(),
            this.gameMapFrontWrapper.getTileDimensions(),
        );

        this.subscribeToGameMapChanged();
        this.subscribeToEntitiesManagerObservables();

        this.removeAllRemotePlayers(); //cleanup the list  of remote players in case the scene was rebooted

        this.cameraManager = new CameraManager(
            this,
            { width: this.Map.widthInPixels, height: this.Map.heightInPixels },
            waScaleManager,
        );

        biggestAvailableAreaStore.recompute();
        if (ENABLE_MAP_EDITOR) {
            this.mapEditorModeManager = new MapEditorModeManager(this);
        }

        this.configureTileAnimations();

        // Let's pause the scene if the connection is not established yet
        if (!this._room.isDisconnected()) {
            if (this.isReconnecting) {
                setTimeout(() => {
                    if (this.connection === undefined) {
                        try {
                            this.hide();
                        } catch (err) {
                            console.error("Scene sleep error: ", err);
                        }
                        if (get(errorScreenStore)) {
                            // If an error message is already displayed, don't display the "connection lost" message.
                            console.error(
                                "Error message store already displayed for CONNECTION_LOST",
                                get(errorScreenStore),
                            );
                            return;
                        }
                        errorScreenStore.setError(
                            ErrorScreenMessage.fromPartial({
                                type: "reconnecting",
                                code: "CONNECTION_LOST",
                                title: get(LL).warning.connectionLostTitle(),
                                details: get(LL).warning.connectionLostSubtitle(),
                                image: this._room.errorSceneLogo,
                            }),
                        );
                    }
                }, 0);
            } else if (this.connection === undefined) {
                // Let's wait 1 second before printing the "connecting" screen to avoid blinking
                this.hideTimeout = setTimeout(() => {
                    this.hideTimeout = undefined;
                    if (this.connection === undefined) {
                        try {
                            this.hide();
                        } catch (err) {
                            console.error("Scene sleep error: ", err);
                        }
                        if (get(errorScreenStore)) {
                            // If an error message is already displayed, don't display the "connection lost" message.
                            console.error(
                                "Error message store already displayed for CONNECTION_PENDING: ",
                                get(errorScreenStore),
                            );
                            return;
                        }
                        /*
                         * @fixme
                         * The error awaiting connection appears while the connection is in progress.
                         * In certain cases like the invalid character layer, the connection is close and this error is displayed after selecting Woka scene.
                         * TODO: create connection status with invalid layer case and not display this error.
                         **/
                        /*errorScreenStore.setError(
                            ErrorScreenMessage.fromPartial({
                                type: "reconnecting",
                                code: "CONNECTION_PENDING",
                                title: get(LL).warning.waitingConnectionTitle(),
                                details: get(LL).warning.waitingConnectionSubtitle(),
                            })
                        );*/
                    }
                }, 1000);
            }
        }

        this.createPromiseDeferred.resolve();
        // Now, let's load the script, if any
        const scripts = this.getScriptUrls(this.mapFile);
        const disableModuleMode = PropertyUtils.findBooleanProperty(
            GameMapProperties.SCRIPT_DISABLE_MODULE_SUPPORT,
            this.mapFile.properties,
        );
        const scriptPromises = [];
        for (const script of scripts) {
            scriptPromises.push(
                // Note: registerScript fails after 7 seconds if the script cannot be loaded
                iframeListener.registerScript(script, !disableModuleMode),
            );
        }

        this.reposition(true);

        this.gameMapPropertiesListener = new GameMapPropertiesListener(this, this.gameMapFrontWrapper);
        this.gameMapPropertiesListener.register();

        if (!this._room.isDisconnected()) {
            try {
                this.hide();
            } catch (err) {
                console.error("Scene sleep error: ", err);
            }
            this.connect();
        }

        /*this.connectionAnswerPromiseDeferred.promise.then((connectionAnswer) => {
            console.warn("Connection established", connectionAnswer);
        });
        this.CurrentPlayer.getTextureLoadedPromise().then((textures) => {
            console.warn("Current player textures loaded", textures);
        });
        this.gameMapFrontWrapper.initializedPromise.then(() => {
            console.warn("GameMapFrontWrapper initialized");
        });
        Promise.all(scriptPromises).then(() => {
            console.warn("All scripts loaded");
        });*/

        Promise.all([
            this.connectionAnswerPromiseDeferred.promise.then(() =>
                debug("Loading process: Websocket connection ready"),
            ),
            Promise.allSettled(scriptPromises).then((results) => {
                debug("Loading process: Scripts loaded");
                return results;
            }),
            this.gameMapFrontWrapper.initializedPromise.promise.then(() =>
                debug("Loading process: Game map initialized"),
            ),
            // The chat is deliberately not awaited: the map shows right away and the chat catches up once
            // Matrix is ready (see GameManager.chatConnectionStore).
        ])
            .then((results) => {
                const settledScriptLoadedResult = results[1];
                // Script loading might have failed, in particular if the network connection was lost.
                // In this case, the websocket connection will keep retrying, while the script will not retry.
                // Therefore, just after the websocket connection is established (so at a time we know the scripts
                // can be retried), we retry loading the failed scripts.

                Promise.allSettled(
                    settledScriptLoadedResult.map((result) => {
                        if (result.status === "rejected") {
                            if (result.reason instanceof ScriptLoadedError) {
                                return result.reason.retry();
                            } else {
                                throw result.reason;
                            }
                        }
                        return Promise.resolve();
                    }),
                )
                    .then((scriptReload) => {
                        for (const r of scriptReload) {
                            if (r.status === "rejected") {
                                console.error("Error while reloading script after connection established", r.reason);
                            }
                        }

                        if (this.cleanupDone) {
                            // The GameScene was closed before completing.
                            // For instance, the websocket is closed while the map was loading.
                            // Let's not join the room.
                            return;
                        }

                        this.joinRoom()
                            .then(() => this.groundStatesOfJoinApplied())
                            .then(() => {
                                this.initUserPermissionsOnEntity();
                                this.hide(false);
                                gameSceneIsLoadedStore.set(true);
                                this.sceneReadyToStartDeferred.resolve();
                                this.initializeAreaManager();
                                // #moveTo walks the player along a path: it needs the player (created when the pusher
                                // answered) and the areas the user cannot enter in the collision grid, which only
                                // exist once the areas manager is initialized.
                                this.tryMovePlayerWithMoveToParameter();
                            })
                            .catch((e) => {
                                if (e instanceof CloseEvent) {
                                    // The socket closed before the room was joined. This is a lost connection, not a
                                    // bug, and the user already sees it: RoomConnection emits serverDisconnected, and
                                    // the scene shows the connection issue toast and reconnects from there (or the page
                                    // is unloading, code 1000). An error screen would cover that reconnection.
                                    return;
                                }
                                console.error("Error while joining the room", e);
                                Sentry.captureException(e);
                                errorScreenStore.setException(e);
                            });
                    })
                    .catch((e) => {
                        console.error("Promise.allSettled should never error", e);
                        Sentry.captureException(e);
                    });
            })
            .catch((e: unknown) => {
                console.error("Initialization failed", e);
                Sentry.captureException(e);
                errorScreenStore.setException(e);
            });

        gameManager
            .getChatConnection()
            .then(async () => {
                const connection = this.connection;
                const chatId = localUserStore.getChatId();
                const email: string | null = localUserStore.getLocalUser()?.email || null;
                if (email && chatId && connection) {
                    await this.roomJoinedPromiseDeferred.promise;
                    connection.emitUpdateChatId(email, chatId);
                    connection.emitPlayerChatID(chatId);
                }
            })
            .catch((e) => {
                console.error(e);
                Sentry.captureException(e);
            })
            .finally(() => this.chatIdSentDeferred.resolve());

        if (this.game.renderer instanceof WebGLRenderer) {
            this._focusFx = new DarkenOutsideAreaEffect(this, this.cameras.main, {
                feather: 10,
                darkness: 0.65,
                tweenDurationMs: 250,
            });
        }
    }

    private getWorldLoadDurationMs(): number {
        return Math.round(performance.now() - this.worldLoadStartedAt);
    }

    private trackMapLoadingSuccess(): void {
        if (this.mapLoadSucceededAnalyticsSent || this.mapLoadFailedAnalyticsSent) {
            return;
        }

        this.mapLoadSucceededAnalyticsSent = true;
        const durationMs = this.getWorldLoadDurationMs();
        analyticsClient.trackAdminEvent("map_loading.succeeded", { durationMs });
        analyticsClient.trackAdminEvent("world.entered", { durationMs });
    }

    private trackMapLoadingFailure(reason: string): void {
        if (this.mapLoadFailedAnalyticsSent || this.mapLoadSucceededAnalyticsSent) {
            return;
        }

        this.mapLoadFailedAnalyticsSent = true;
        analyticsClient.trackAdminEvent("map_loading.failed", { reason, durationMs: this.getWorldLoadDurationMs() });
    }

    public getMapUrl(): string {
        if (!this.mapUrlFile) {
            throw new Error("Trying to access mapUrl before it was fetched");
        }
        return this.mapUrlFile;
    }

    public getEntityPermissions(): EntityPermissions {
        if (this.entityPermissions === undefined) {
            throw new Error("EntityPermissions not instantiated yet");
        }
        return this.entityPermissions;
    }

    public getEntityPermissionsPromise(): Promise<EntityPermissions> {
        return this.entityPermissionsDeferred.promise;
    }

    public async onMapExit(roomUrl: URL) {
        if (this.mapTransitioning) return;
        this.mapTransitioning = true;

        this.gameMapFrontWrapper.triggerExitCallbacks();

        let targetRoom: Room;
        try {
            targetRoom = await Room.createRoom(roomUrl);
        } catch (e /*: unknown*/) {
            console.error('Error while fetching new room "' + roomUrl.toString() + '"', e);

            //show information room access denied
            popupStore.addPopup(
                PopUpRoomAccessDenied,
                {
                    message: get(LL).warning.accessDenied.room(),
                    onclick: () => {
                        popupStore.removePopup("roomAccessDenied");
                    },
                    userInputManager: this.userInputManager,
                },
                "roomAccessDenied",
            );

            this.mapTransitioning = false;
            return;
        }

        urlManager.pushStartLayerNameToUrl(roomUrl.hash);

        if (!targetRoom.isEqual(this._room)) {
            if (this.scene.get(targetRoom.key) === null) {
                console.error("next room not loaded", targetRoom.key);
                // Try to load next game room from exit URL
                // The policy of room can to be updated during a session and not load before
                await this.loadNextGameFromExitUrl(targetRoom.key);
            }
            this.cleanupClosingScene();

            this.scene.stop();
            this.scene.start(targetRoom.key);
            this.scene.remove(this.scene.key);
            forceRefreshChatStore.forceRefresh();
        } else {
            //if the exit points to the current map, we simply teleport the user back to the startLayer
            const startPosition = computeStartPosition(
                this.gameMapFrontWrapper,
                this.mapFile,
                undefined,
                urlManager.getStartPositionNameFromUrl(),
                (position) => this.isPositionAllowedForCurrentUser(position),
            );
            this.CurrentPlayer.setPosition(startPosition.x, startPosition.y);
            this.CurrentPlayer.finishFollowingPath(true);
            // clear properties in case we are moved on the same layer / area in order to trigger them
            this.gameMapFrontWrapper.clearCurrentProperties();
            this.gameMapFrontWrapper.setPosition(
                this.CurrentPlayer.x,
                this.CurrentPlayer.y,
                this.CurrentPlayer.getFloorZ(),
            );

            // TODO: we should have a "teleport" parameter to explicitly say the user teleports and should not be moved in 200ms to the new place.
            this.handleCurrentPlayerHasMovedEvent({
                x: this.CurrentPlayer.x,
                y: this.CurrentPlayer.y,
                direction: this.CurrentPlayer.lastDirection,
                moving: false,
                running: false,
            });

            this.markDirty();
            setTimeout(() => (this.mapTransitioning = false), 500);
        }
    }

    public playSound(sound: string, volume: number = 0.2): void {
        if (!statusChanger.allowNotificationSound()) return;
        this.sound.play(sound, {
            volume: volume * get(notificationSoundVolumeStore),
        });
    }

    public playBubbleInSound() {
        const bubbleSound = get(bubbleSoundStore);
        this.playSound(`audio-webrtc-in-${bubbleSound}`);
    }

    public playBubbleOutSound() {
        const bubbleSound = get(bubbleSoundStore);
        this.playSound(`audio-webrtc-out-${bubbleSound}`);
    }

    public playMeetingInSound() {
        this.playSound(`meeting-in`);
    }

    public playMeetingOutSound() {
        this.playSound(`meeting-out`);
    }

    private readonly saveCurrentPosition = (): void => {
        if (this.CurrentPlayer) {
            this.saveLastPosition(this.CurrentPlayer);
        }
    };

    /**
     * Keeps where the player is for the next reload, with the raised floor they stand on. Not on a stair, between
     * two floors: the last place kept stays.
     */
    private saveLastPosition(position: PositionInterface): void {
        // Until the floors are there, the floor to restore is still the one of the player.
        const floorZ = this.floorSpike ? this.floorSpike.restingElevation() : (this.floorToRestore ?? 0);
        if (floorZ === undefined) return;
        saveLastPlayerPosition(this.roomUrl, localUserStore.getLocalUser()?.uuid, position, floorZ);
    }

    public cleanupClosingScene(): void {
        offscreenCallUsersStore.set(new Set());
        this.saveCurrentPosition();
        window.removeEventListener("pagehide", this.saveCurrentPosition);
        this.abortController?.abort();
        this.unregisterAudioContextPlaybackRetry?.();
        this.unregisterAudioContextPlaybackRetry = undefined;

        // make sure we restart own medias
        mediaManager.disableMyCamera();
        mediaManager.disableMyMicrophone();
        // stop playing audio, close any open website, stop any open Jitsi, unsubscribe
        coWebsiteManager.cleanup();

        iframeListener.cleanup();
        uiWebsiteManager.closeAll();
        followUsersStore.stopFollowing();

        audioManagerFileStore.unloadAudio();

        this.connection?.closeConnection();
        this.outlineManager?.clear();
        this.tileAnimationRefreshEvent?.remove(false);
        this.tileAnimationRefreshEvent = undefined;
        this.userInputManager?.destroy();
        this.isLiveStreamingUnsubscriber?.();
        this.shouldPublishScreenShareUnsubscriber?.();
        this.pinchManager?.destroy();
        this.emoteManager?.destroy();
        this.entityAudioManager?.destroy();
        this.cameraManager?.destroy();
        this.mapEditorModeManager?.destroy();
        this.gameMapPropertiesListener?.destroy();

        // A broadcast does not follow the user into the next room, but nothing said
        // so: the action bar kept offering to stop it, and its analytics interval —
        // opened with reopenOnReconnect — was resumed on the next room's socket as if
        // the megaphone were still on. Guarded so an idle room change does not count
        // as a stop.
        if (get(requestedMegaphoneStore)) {
            stopMegaphoneLive();
        }
        this._broadcastService?.destroy().catch((e) => {
            console.error("Error while destroying broadcast service", e);
            Sentry.captureException(e);
        });
        megaphoneSpaceStore.set(undefined);
        this.proximitySpaceManager?.destroy();
        this.bubbleListeningManager?.destroy();
        if (this._proximityChatRoomManager) {
            this._proximityChatRoomManager.destroy();
        } else {
            this._proximityChatRoom?.destroy();
        }
        for (const unsubscriber of this.unsubscribers) {
            unsubscriber();
        }
        this.unsubscribers = [];
        iframeListener.unregisterAnswerer("getState");
        iframeListener.unregisterAnswerer("loadTileset");
        iframeListener.unregisterAnswerer("getMapData");
        iframeListener.unregisterAnswerer("getWamMapData");
        iframeListener.unregisterAnswerer("triggerActionMessage");
        iframeListener.unregisterAnswerer("triggerPlayerMessage");
        iframeListener.unregisterAnswerer("removeActionMessage");
        iframeListener.unregisterAnswerer("removePlayerMessage");
        iframeListener.unregisterAnswerer("openCoWebsite");
        iframeListener.unregisterAnswerer("getCoWebsites");
        iframeListener.unregisterAnswerer("closeCoWebsite");
        iframeListener.unregisterAnswerer("closeCoWebsites");
        iframeListener.unregisterAnswerer("setPlayerOutline");
        iframeListener.unregisterAnswerer("removePlayerOutline");
        iframeListener.unregisterAnswerer("setVariable");
        iframeListener.unregisterAnswerer("openUIWebsite");
        iframeListener.unregisterAnswerer("getUIWebsites");
        iframeListener.unregisterAnswerer("getUIWebsiteById");
        iframeListener.unregisterAnswerer("closeUIWebsite");
        iframeListener.unregisterAnswerer("enablePlayersTracking");
        iframeListener.unregisterAnswerer("getPlayerPosition");
        iframeListener.unregisterAnswerer("movePlayerTo");
        iframeListener.unregisterAnswerer("teleportPlayerTo");
        iframeListener.unregisterAnswerer("getWoka");
        iframeListener.unregisterAnswerer("goToLogin");
        iframeListener.unregisterAnswerer("playSoundInBubble");
        iframeListener.unregisterAnswerer("playSoundInMeeting");
        iframeListener.unregisterAnswerer("startStreamInBubble");
        iframeListener.unregisterAnswerer("startStreamInMeeting");
        iframeListener.unregisterAnswerer("appendPCMData");
        iframeListener.unregisterAnswerer("appendPCMDataToMeeting");
        iframeListener.unregisterAnswerer("resetAudioBuffer");
        iframeListener.unregisterAnswerer("resetMeetingAudioBuffer");
        iframeListener.unregisterAnswerer("stopStreamInBubble");
        iframeListener.unregisterAnswerer("stopStreamInMeeting");
        this.sharedVariablesManager?.close();
        this.playerVariablesManager?.close();
        this.areaPropertyVariablesManager?.destroy();
        areaPropertyVariablesManagerStore.set(undefined);
        this.terrainWaterSubscription?.unsubscribe();
        this.terrainWaterSubscription = undefined;
        this.meadowSubscription?.unsubscribe();
        this.meadowSubscription = undefined;
        this.localTerrain.destroy();
        setLocalGroundShown(() => false);
        setFastWaterResynchronize(() => undefined);
        document.removeEventListener("visibilitychange", this.tabVisibilityChanged);
        this.treeFireSubscription?.unsubscribe();
        this.treeFireSubscription = undefined;
        this.hurricaneAirSubscription?.unsubscribe();
        this.hurricaneAirSubscription = undefined;
        this.fireConditionsSubscription?.unsubscribe();
        this.fireConditionsSubscription = undefined;
        this.receiveFireConditions(undefined);
        this.aquaticLifeSubscription?.unsubscribe();
        this.aquaticLifeSubscription = undefined;
        this.entityStatesManager?.destroy();
        this.entityStatesManager = undefined;
        entityStatesManagerStore.set(undefined);
        this.scriptingEventsManager?.close();
        this.embeddedWebsiteManager?.close();
        this.scriptingVideoManager?.close();
        this.areaManager?.close();
        this._sayManager?.close();
        this.playersEventDispatcher.cleanup();
        this.playersMovementEventDispatcher.cleanup();
        this.usernameDomLayer?.destroy();
        this.gameMapFrontWrapper?.close();
        this.followManager?.close();
        this.inviteManager?.close();
        this.spaceScriptingBridgeService?.destroy();
        this.enterLeaveScriptingService?.destroy();
        iceServersManager.finalize();
        if (this.localVolumeStoreUnsubscriber) {
            this.localVolumeStoreUnsubscriber();
            this.localVolumeStoreUnsubscriber = undefined;
        }
        this.throttledSendViewportToServer_?.cancel();

        this.serverViewportDebugGraphics?.destroy();
        this.serverViewportDebugGraphics = undefined;

        this._focusFx?.destroy();

        this._spaceRegistry?.destroy().catch((e) => {
            console.error("Error while destroying space registry", e);
            Sentry.captureException(e);
        });

        // We need to destroy all the entities
        get(extensionModuleStore).forEach((extensionModule) => {
            extensionModule.destroy();
        });
        extensionModuleStore.set([]);

        //When we leave game, the camera is stop to be reopen after.
        // I think that we could keep camera status and the scene can manage camera setup
        //TODO find wy chrome don't manage correctly a multiple ask mediaDevices
        //mediaManager.hideMyCamera();

        for (const iframeEvents of this.iframeSubscriptionList) {
            iframeEvents.unsubscribe();
        }
        for (const subscription of this.rxJsSubscriptions) {
            subscription.unsubscribe();
        }
        this.rxJsSubscriptions = [];
        this.gameMapChangedSubscription?.unsubscribe();
        this.messageSubscription?.unsubscribe();

        // Cleanup locate manager
        this.locateManager?.destroy();
        this.konamiCodeDetector?.destroy();
        this.duckRushManager?.destroy();
        this.nightManager?.destroy();
        this.perfMonitor?.destroy();
        this.perfMonitor = undefined;
        this.unsubscribeAreaHighlight?.();
        this.unsubscribeAreaHighlight = undefined;
        this.wallFade?.destroy();
        this.wallFade = undefined;
        this.fadedWallFloor?.destroy();
        this.fadedWallFloor = undefined;
        this.lampManager?.destroy();
        this.lampManager = undefined;
        this.gameSwitches?.destroy();
        this.gameSwitches = undefined;
        this.weatherManager?.destroy();
        this.mapGroundLayout = undefined;
        this.pixelRelief?.destroy();
        this.pixelRelief = undefined;
        tellPixelBlocksShown(undefined);
        this.terrainView?.destroy();
        this.terrainView = undefined;
        this.characterDrops?.destroy();
        this.characterDrops = undefined;
        this.placedDrops?.destroy();
        this.placedDrops = undefined;
        this.seenRelief = undefined;
        this.waterFlowView?.destroy();
        this.waterFlowView = undefined;
        this.frozenPoolsView?.destroy();
        this.frozenPoolsView = undefined;
        this.waterFlowOverlay?.destroy();
        this.waterFlowOverlay = undefined;
        this.aquaticLifeView?.destroy();
        this.aquaticLifeView = undefined;
        this.gullLifeView?.destroy();
        this.gullLifeView = undefined;
        this.landLifeView?.destroy();
        this.landLifeView = undefined;
        this.landCompanions?.destroy();
        this.landCompanions = undefined;
        this.skyShadowManager?.destroy();
        this.skyShadowManager = undefined;
        this.skyWindowLightManager?.destroy();
        this.skyWindowLightManager = undefined;
        this.skyMovingShadows?.destroy();
        this.skyMovingShadows = undefined;
        this.unsubscribeSkyShadowCategories?.();
        this.unsubscribeSkyShadowCategories = undefined;
        this.treeSway?.destroy();
        this.treePoses?.destroy();
        this.treePoses = undefined;
        this.treeSeasonEffects?.destroy();
        this.treeSeasonEffects = undefined;
        this.floorSpike?.destroy();
        this.floorSpike = undefined;
        this.seasonalThemeManager?.destroy();
        this.seasonalThemeManager = undefined;
        this.skateboardSounds?.destroy();
        this.airplaneSounds?.destroy();
        this.nightManager = undefined;
        this._knockManager?.destroy();
        this._knockManager = undefined;
        this._waveManager?.destroy();
        this._waveManager = undefined;
        this._nerfManager?.destroy();
        this._nerfManager = undefined;
        nerfEquippedStore.set(false);
        this._torchManager?.destroy();
        this._torchManager = undefined;
        this._perceptionManager?.destroy();
        this._perceptionManager = undefined;
        this.karaokeSpotlight?.destroy();
        this.karaokeSpotlight = undefined;
        torchEquippedStore.set(false);
        this._fishingManager?.destroy();
        this._fishingManager = undefined;
        this._iceShackManager?.destroy();
        this._iceShackManager = undefined;
        this.catastropheSubscription?.unsubscribe();
        this.catastropheSubscription = undefined;
        this.meteorView?.destroy();
        this.meteorView = undefined;
        this.fireView?.destroy();
        this.fireView = undefined;
        this.treeFireView?.destroy();
        this.treeFireView = undefined;
        this.fallenTreeView?.destroy();
        this.fallenTreeView = undefined;
        this.downpourView?.destroy();
        this.downpourView = undefined;
        this.drainView?.destroy();
        this.drainView = undefined;
        this.ballView?.destroy();
        this.ballView = undefined;
        this.coldView?.destroy();
        this.coldView = undefined;
        coldLyingStore.set(undefined);
        this.hurricaneReceiver?.destroy();
        this.hurricaneReceiver = undefined;
        this.tsunamiReceiver?.destroy();
        this.tsunamiReceiver = undefined;
        tsunamiShownStore.set(undefined);
        this.hurricaneView?.destroy();
        this.hurricaneView = undefined;
        this.hurricaneDebris?.destroy();
        this.hurricaneDebris = undefined;
        this.hurricaneFlood?.destroy();
        this.hurricaneFlood = undefined;
        setRoomHurricane(undefined);
        roomHurricaneAir.clear();
        hurricaneShownStore.set(undefined);
        this.zombieReceiver?.destroy();
        this.zombieReceiver = undefined;
        this.zombieView?.destroy();
        this.zombieView = undefined;
        zombieShownStore.set(undefined);
        grenadeLauncherEquippedStore.set(false);
        this.fireTorchView?.destroy();
        this.fireTorchView = undefined;
        rodEquippedStore.set(false);
        this._coffeeManager?.destroy();
        this._coffeeManager = undefined;
        // Before the wandering characters it gives its animals to.
        this.gameJungle?.destroy();
        this.gameJungle = undefined;
        this.wanderingCharactersManager?.destroy();

        gameSceneIsLoadedStore.set(false);
        gameSceneStore.set(undefined);
        this.cleanupDone = true;
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = undefined;
        }
    }

    /**
     * @param time
     * @param delta The delta time in ms since the last frame. This is a smoothed and capped value based on the FPS rate.
     */
    /** The areas the local player stands in, and their personal desk: doors and footsteps are only heard there. */
    private getHearingZones(): HearingZone[] {
        const zones: HearingZone[] =
            this.gameMapFrontWrapper.getGameMap().getWamFile()?.getGameMapAreas().getAreasOnPosition({
                x: this.CurrentPlayer.x,
                y: this.CurrentPlayer.y,
                z: this.CurrentPlayer.getFloorZ(),
            }) ?? [];
        const personalArea = get(personalAreaDataStore);
        return personalArea ? [...zones, personalArea] : zones;
    }

    /** The voices of a bubble overheard from its edge fade as the local player walks away from each member. */
    private updateOverheardLoudness(): void {
        const now = performance.now();
        if (now - this.overheardLoudnessUpdatedAt < OVERHEARD_LOUDNESS_PERIOD_MS) return;
        this.overheardLoudnessUpdatedAt = now;
        const heard = get(heardVideoBoxesStore);
        if (heard.length === 0 && get(overheardLoudnessStore).size === 0) return;
        const loudness = new Map<string, number>();
        for (const { spaceUser } of heard) {
            const member = this.MapPlayersByKey.get(userIdOfSpaceUser(spaceUser.spaceUserId));
            if (!member) continue;
            const distance = Math.hypot(member.x - this.CurrentPlayer.x, member.y - this.CurrentPlayer.y);
            // Rounded, so that standing still does not refresh the volumes every period
            loudness.set(spaceUser.spaceUserId, Math.round(overheardLoudness(distance) * 20) / 20);
        }
        const previous = get(overheardLoudnessStore);
        const changed =
            loudness.size !== previous.size ||
            [...loudness].some(([spaceUserId, value]) => previous.get(spaceUserId) !== value);
        if (changed) overheardLoudnessStore.set(loudness);
    }

    /**
     * The players in the discussion of the local player (a bubble or a meeting room) get their name marked on the map:
     * one sees who is in the call, even with the cameras off. Only the changes are applied.
     */
    private updateDiscussionMarks(): void {
        const now = performance.now();
        if (now - this.discussionMarksUpdatedAt < DISCUSSION_MARKS_PERIOD_MS) return;
        this.discussionMarksUpdatedAt = now;
        const inDiscussion = new Set(
            get(videoStreamElementsStore).map(({ spaceUser }) => userIdOfSpaceUser(spaceUser.spaceUserId)),
        );
        for (const userId of this.discussionMarked) {
            if (!inDiscussion.has(userId)) this.MapPlayersByKey.get(userId)?.setInDiscussion(false);
        }
        for (const userId of inDiscussion) {
            // Every time: a player who just came into view is marked too.
            this.MapPlayersByKey.get(userId)?.setInDiscussion(true);
        }
        this.discussionMarked = inDiscussion;
        this.updateOffscreenCallUsers();
    }

    /** The players of the discussion out of the view (or not on the map shown): the call strip lists them. */
    private updateOffscreenCallUsers(): void {
        const view = this.cameras.main.worldView;
        const previous = get(offscreenCallUsersStore);
        const offscreen = new Set<string>();
        for (const { spaceUser } of get(videoStreamElementsStore)) {
            const player = this.MapPlayersByKey.get(userIdOfSpaceUser(spaceUser.spaceUserId));
            // The video bubble stands over the head: that is what must be seen.
            // Found by its user id, like the names marked in the discussion (updateDiscussionMarks): the uuid of a
            // guest's space user is not the one of its player.
            const bubble = player && { x: player.x, y: player.y - CALL_BUBBLE_ABOVE_FEET_PX };
            if (!bubble || isOffscreen(previous.has(spaceUser.spaceUserId), bubble, view)) {
                offscreen.add(spaceUser.spaceUserId);
            }
        }
        if (get(videoStreamElementsStore).length > 0) {
            const localBubble = { x: this.CurrentPlayer.x, y: this.CurrentPlayer.y - CALL_BUBBLE_ABOVE_FEET_PX };
            if (isOffscreen(previous.has("local"), localBubble, view)) offscreen.add("local");
        }
        const changed = offscreen.size !== previous.size || [...offscreen].some((userId) => !previous.has(userId));
        if (changed) offscreenCallUsersStore.set(offscreen);
    }

    /** Only the local player hears their footsteps and rolling skateboard. */
    /** The personal seasonal theme shown right now, if any. */
    public getSeasonalTheme(): SeasonalTheme | undefined {
        return this.seasonalThemeManager?.activeTheme();
    }

    /** The walls, doors and windows of the map layer, among the entities of the map. */
    private *mapLayerWallEntities(): Generator<Entity> {
        for (const entity of this.gameMapFrontWrapper.getEntitiesManager().getEntities().values()) {
            if (MAP_LAYER_WALL_LIKE_COLLECTIONS.includes(entity.getPrefab().collectionName)) yield entity;
        }
    }

    /** The raised floor a point of the screen stands on at this altitude, for what must stay within it (lights). */
    /** The switches of the map (see GameSwitches); undefined before the map is ready. */
    public getSwitches(): GameSwitches | undefined {
        return this.gameSwitches;
    }

    public raisedFloorZoneAt(
        elevation: number,
        x: number,
        y: number,
    ): { key: string; x: number; y: number; width: number; height: number } | undefined {
        return this.floorSpike?.floorZoneAt(elevation, x, y);
    }

    /**
     * The bridges of the map are read again twice a second at most: an editor lays or erases one, and the animals
     * cross the water there, or no longer. An avatar walks on their slabs as on any raised floor.
     */
    private refreshBridges(time: number): void {
        if (time - this.bridgesReadAt < 500) return;
        this.bridgesReadAt = time;
        this.bridges = bridgesOf(this.getGameMap().getWamFile()?.getWam());
        this.terrainWater.setBridges(this.bridges.tiles);
    }

    /** Who shows and fades with the raised floor they stand on: the other players, and the animals that walk around. */
    private *floorOccupants(): Generator<FloorOccupant> {
        yield* this.MapPlayersByKey.values();
        if (this.wanderingCharactersManager) yield* this.wanderingCharactersManager.floorOccupants();
    }

    /** How high over the ground an animal walks above a point of the ground (map pixels): 0 off the bridges. */
    public getBridgeElevationAt(x: number, y: number): number {
        return this.bridges?.elevationAt(x, y) ?? 0;
    }

    /** The floor tiles of the map layer laid on the ground. */
    private *mapLayerGroundFloors(): Generator<Entity> {
        for (const entity of this.gameMapFrontWrapper.getEntitiesManager().getEntities().values()) {
            if (entity.getPrefab().collectionName === MAP_LAYER_FLOOR_COLLECTION && entity.getElevation() === 0) {
                yield entity;
            }
        }
    }

    /** Outdoor cells of the map, shared by the weather and the seasonal theme. */
    /** The trees of the nature catalogue placed on the map, for them to sway with the wind. */
    private *swayingTrees(): Generator<{ id: string; object: Entity }> {
        for (const [id, entity] of this.gameMapFrontWrapper.getEntitiesManager().getEntities()) {
            if (isSwayingTree(entity.getPrefab().id)) yield { id, object: entity };
        }
    }

    /** The objects of the map as their shadows of the sky need them. */
    private *shadowSourceEntities(): Generator<ShadowSourceEntity> {
        // The pictures are only read for the realistic shadows of the trees and of the details.
        const pictures =
            this.skyShadowCategories?.treeShape === "realistic" ||
            this.skyShadowCategories?.detailShape === "realistic";
        for (const [id, entity] of this.gameMapFrontWrapper.getEntitiesManager().getEntities()) {
            const frame = pictures && entity.getPrefab().id.startsWith(NATURE_PREFIX) ? entity.frame : undefined;
            yield {
                id,
                picture:
                    frame && drawableSource(frame.source.image)
                        ? {
                              key: `${entity.texture.key}:${frame.name}`,
                              source: frame.source.image,
                              cutX: frame.cutX,
                              cutY: frame.cutY,
                              cutWidth: frame.cutWidth,
                              cutHeight: frame.cutHeight,
                          }
                        : undefined,
                x: entity.x,
                // Where it is drawn: a tree on a relief seen in 3/4 throws its shadow from where its trunk is seen.
                y: entity.y + entity.getGroundDrop(),
                displayWidth: entity.displayWidth,
                displayHeight: entity.displayHeight,
                elevation: entity.getElevation(),
                prefab: entity.getPrefab(),
            };
        }
    }

    /** The avatars that throw a shadow of the sky now: this person and the others. */
    private *shadowAvatars(): Generator<MovingShadowSource> {
        // The body of an avatar, for its oval shadow: narrower than its frame.
        const body = { width: 24, height: 30 };
        const own = this.CurrentPlayer?.skyShadowSource();
        if (own) yield { id: "me", ...body, ...own, drop: this.CurrentPlayer.getGroundDrop() };
        for (const [userId, player] of this.MapPlayersByKey) {
            const source = player.skyShadowSource();
            if (source) yield { id: userId, ...body, ...source, drop: player.getGroundDrop() };
        }
    }

    /** The animals that walk around, as their oval shadows need them. */
    private shadowAnimals(): MovingShadowSource[] {
        const animals: MovingShadowSource[] = [];
        this.wanderingCharactersManager?.forEachShownCharacter((id, sprite, raised) => {
            // The body of an animal fills about two thirds of its frame, in width as in height.
            animals.push({
                id,
                x: sprite.x,
                y: sprite.y,
                width: sprite.displayWidth * 0.7,
                height: sprite.displayHeight * 0.6,
                sprites: [sprite],
                scale: sprite.scaleX,
                // As the animal itself (drawnLower): nothing on a raised floor.
                drop: raised ? 0 : Math.round(this.groundDropAt(sprite.x, sprite.y)),
            });
        });
        // The antelopes, lions and tigers the server runs.
        this.landLifeView?.forEachShown((id, sprite, { drop }) => {
            animals.push({
                id: `land:${id}`,
                x: sprite.x,
                // Its sprite is already where it is drawn: its place is that much higher.
                y: sprite.y - drop,
                drop,
                width: sprite.displayWidth * 0.7,
                height: sprite.displayHeight * 0.6,
                sprites: [sprite],
                scale: sprite.scaleX,
            });
        });
        return animals;
    }

    /** The calls of the lions and tigers the server runs, as for those of the jungle (see LandCries). */
    private updateLandCries(): void {
        const view = this.landLifeView;
        if (!view || !get(jungleEnabledStore)) return;
        this.landCries ??= new LandCries({
            listener: () => (this.CurrentPlayer ? { x: this.CurrentPlayer.x, y: this.CurrentPlayer.y } : undefined),
            hidden: () => document.hidden,
            volume: () => get(jungleVolumeStore),
            play: (key, volume) => {
                // The same guards as the other sound effects (see NerfManager.playPop).
                if (localUserStore.getBlockAudio() || this.sound.locked) return;
                playJungleSound(this.sound, this.cache.audio, key, volume);
            },
        });
        const heard: HeardAnimal[] = [];
        view.forEachShown((id, sprite, animal) => heard.push({ id, x: sprite.x, y: sprite.y, ...animal }));
        this.landCries.update(Date.now(), heard);
    }

    /**
     * The share of the direct light of the sky the weather shown to this person lets through (skyWeatherFactor): all
     * of it with the weather effects hidden or the clouds turned off, as the sky then looks clear.
     */
    private skyWeatherFactor(): number {
        if (!get(weatherEffectsEnabledStore) || isBasicActive()) return 1;
        const cloudiness = get(cloudsShownStore) ? (this.shownWeather()?.cloudiness ?? 0) : 0;
        return skyWeatherFactor(this.getMapWeather(), cloudiness);
    }

    public getOutdoorGrid(): OutdoorGrid | undefined {
        return this.outdoorTracker?.grid;
    }

    private weatherCover: { at: number; cover: RaisedCover } | undefined;

    /**
     * What the weather must not be drawn on although it is over outdoor tiles: the slabs and the stairs of the
     * raised floors, and the walls two tiles high or more (and the ones of the raised floors), whose images reach
     * north of the tiles they stand on. Read again from the map twice a second at most.
     */
    private raisedWeatherCover(): RaisedCover | undefined {
        const now = this.time.now;
        if (this.weatherCover && now - this.weatherCover.at < 500) return this.weatherCover.cover;
        const grid = this.getOutdoorGrid();
        const cover = new RaisedCover();
        if (grid) {
            for (const entity of this.gameMapFrontWrapper.getEntitiesManager().getEntities().values()) {
                const prefab = entity.getPrefab();
                const image = { x: entity.x, y: entity.y, width: entity.displayWidth, height: entity.displayHeight };
                const piece = parseFloorPiece(prefab.collectionName, prefab.id);
                if (piece !== undefined) {
                    // A slab or a stair of a raised floor is part of a building, wherever it stands: over a room,
                    // or over the outdoors (a storey that reaches out, a house without a floor on the ground). Only
                    // what is drawn of it: the empty corners of the image of a ramp get the weather of the ground.
                    for (const rect of floorPieceCover(piece, image)) cover.add(rect);
                } else if (
                    groundPrefabOfUpper(prefab.collectionName, prefab.id) !== undefined ||
                    (MAP_LAYER_WALL_LIKE_COLLECTIONS.includes(prefab.collectionName) && TALL_WALL.test(prefab.id))
                ) {
                    cover.add(image);
                }
            }
        }
        // Read again twice a second, the same most of the time: the same object then, so that what the weather
        // worked out from it (the outdoors of the view) is not worked out again.
        const previous = this.weatherCover?.cover;
        const kept = previous?.sameAs(cover) ? previous : cover;
        this.weatherCover = { at: now, cover: kept };
        return kept;
    }

    /** Feet of the avatars on the ground (not on a raised floor): the wild animals run from them (WanderFear). */
    public avatarFeetOnGround(): { x: number; y: number }[] {
        const feet: { x: number; y: number }[] = [];
        if (this.CurrentPlayer && this.CurrentPlayer.getFloorZ() === 0) {
            feet.push({ x: this.CurrentPlayer.x, y: this.CurrentPlayer.y + CHARACTER_BODY_OFFSET_Y });
        }
        for (const player of this.MapPlayersByKey.values()) {
            if (player.getFloorZ() === 0) feet.push({ x: player.x, y: player.y + CHARACTER_BODY_OFFSET_Y });
        }
        return feet;
    }

    /**
     * Feet of the players who leave footprints, and the wheels of those who ride on the ground: one track for an
     * electric unicycle, two for a skateboard. Nothing from a skater on the ice, a canoe or a plane.
     */
    private seasonalWalkers(): WalkerSample[] {
        const walkers: WalkerSample[] = [];
        const sample = (id: string, character: Character & { isRunning(): boolean }): void => {
            const wheels = groundWheelsOf(character);
            if (wheels === undefined && !takesSteps(character)) return;
            walkers.push({
                id,
                ...feetOf(character),
                running: character.isRunning(),
                ...(wheels !== undefined && { wheels }),
            });
        };
        sample("local", this.CurrentPlayer);
        for (const player of this.MapPlayersByKey.values()) sample(String(player.userId), player);
        return walkers;
    }

    /** Changes each time the outdoor grid is recomputed. */
    public getOutdoorVersion(): number {
        return this.outdoorTracker?.version ?? 0;
    }

    private updateFootsteps(): void {
        if (!this.footstepSounds) {
            const surfaces = new FootstepSurfaces(
                () =>
                    Array.from(this.gameMapFrontWrapper.getEntitiesManager().getEntities().values(), (entity) => {
                        const prefab = entity.getPrefab();
                        return {
                            x: entity.x,
                            y: entity.y,
                            width: entity.displayWidth,
                            height: entity.displayHeight,
                            collectionName: prefab.collectionName,
                            prefabId: prefab.id,
                            footstepSound: prefab.footstepSound,
                        };
                    }),
                (x, y) =>
                    (this.gameMapFrontWrapper
                        .getGameMap()
                        .getWamFile()
                        ?.getGameMapAreas()
                        .getAreasOnPosition({ x, y, z: this.CurrentPlayer.getFloorZ() }).length ?? 0) > 0,
            );
            this.footstepSounds = new FootstepSounds(
                (key, { volume, detune, pan }) => {
                    volume *= get(footstepVolumeStore);
                    if (volume === 0) return;
                    const sound = this.sound.add(key, { volume, detune });
                    if (sound instanceof Phaser.Sound.WebAudioSound) sound.setPan(pan);
                    sound.once(Phaser.Sound.Events.COMPLETE, () => sound.destroy());
                    sound.play();
                },
                () => this.getHearingZones(),
                (x, y) => surfaces.surfaceAt(x, y),
            );
        }
        // The feet, not the middle of the sprite, tell which floor tile is walked on.
        // A swimmer makes the sound of water, whatever the floor under the pool.
        const listener = {
            id: "local",
            x: this.CurrentPlayer.x,
            y: this.CurrentPlayer.y + CHARACTER_BODY_OFFSET_Y,
            swimming: this.CurrentPlayer.isSwimming() || this.CurrentPlayer.isInWater(),
        };
        const characters = [
            ...(takesSteps(this.CurrentPlayer) ? [listener] : []),
            ...Array.from(this.MapPlayersByKey.values())
                .filter((player) => takesSteps(player))
                .map((player) => ({
                    id: String(player.userId),
                    x: player.x,
                    y: player.y + CHARACTER_BODY_OFFSET_Y,
                    swimming: player.isInWater(),
                })),
        ];
        this.footstepSounds.update(characters, listener);
        this.airplaneSounds ??= new AirplaneSounds(this.sound);
        this.airplaneSounds.update(this.CurrentPlayer.isInAirplane(), this.mapEditorModeManager?.isActive() ?? false);
        this.skateboardSounds ??= new SkateboardSounds(this.sound);
        this.skateboardSounds.update(
            {
                x: listener.x,
                y: listener.y,
                // An electric unicycle rolls in silence: the rolling sound is the skateboard's.
                riding: this.CurrentPlayer.isRidingVehicle() && this.CurrentPlayer.vehicle === Vehicle.Skateboard,
                moving: this.CurrentPlayer.isVehicleMoving(),
                indoor:
                    (this.gameMapFrontWrapper
                        .getGameMap()
                        .getWamFile()
                        ?.getGameMapAreas()
                        .getAreasOnPosition({ x: listener.x, y: listener.y, z: this.CurrentPlayer.getFloorZ() })
                        .length ?? 0) > 0,
            },
            this.mapEditorModeManager?.isActive() ?? false,
            this.currentTick,
        );
    }

    /** The doors of the map layer open when a player, a companion or a duck comes near. */
    private updateDoors(time: number): void {
        this.doorAnimator ??= new DoorAnimator(
            this,
            () => this.gameMapFrontWrapper.getEntitiesManager().getEntities().values(),
            (collectionName, id) => this.getEntitiesCollectionsManager().getEntityPrefab(collectionName, id),
            (key, volume) => {
                volume *= get(doorVolumeStore);
                if (volume > 0) this.sound.play(key, { volume });
            },
            () => this.markDirty(),
            () => this.getHearingZones(),
        );
        // Doors react to the collision body of a character (the one that is blocked by the walls), not to the middle of
        // its sprite, which overlaps the wall when the character walks along it.
        // Players carry their uuid: the doors of a locked area only open for its occupants and the visitors let in.
        const asDoorCharacter = (
            character: {
                x: number;
                y: number;
                getPathAhead?: () => { x: number; y: number }[];
                lastDirection?: PositionMessage_Direction;
            },
            uuid?: string,
        ): DoorCharacter => ({
            uuid,
            x: character.x,
            y: character.y + CHARACTER_BODY_OFFSET_Y,
            facingSideways:
                character.lastDirection === PositionMessage_Direction.LEFT ||
                character.lastDirection === PositionMessage_Direction.RIGHT,
            // A character following a computed path opens the doors it is going through ahead of time.
            path: (character.getPathAhead?.() ?? []).map((point) => ({
                x: point.x,
                y: point.y + CHARACTER_BODY_OFFSET_Y,
            })),
        });
        const localUuid = this._knockManager?.localUuid;
        const listener = asDoorCharacter(this.CurrentPlayer, localUuid === "" ? undefined : localUuid);
        // SPIKE (floors study): an avatar on a raised floor does not open the doors of the ground.
        const characters: DoorCharacter[] = this.CurrentPlayer.getFloorZ() > 0 ? [] : [listener];
        // (A companion follows its master: on a raised floor with them, it does not open the doors of the ground.)
        // The characters of a raised floor open the doors of their own floor (see UpperDoors).
        const raised: RaisedCharacter[] = [];
        const localZ = this.CurrentPlayer.getFloorZ();
        if (localZ > 0) raised.push({ character: listener, elevation: localZ });
        if (this.CurrentPlayer.companion) {
            const companion = asDoorCharacter(this.CurrentPlayer.companion);
            if (localZ > 0) raised.push({ character: companion, elevation: localZ });
            else characters.push(companion);
        }
        for (const player of this.MapPlayersByKey.values()) {
            const z = player.getFloorZ();
            const people = [asDoorCharacter(player, player.userUuid)];
            if (player.companion) people.push(asDoorCharacter(player.companion));
            for (const character of people) {
                if (z > 0) raised.push({ character, elevation: z });
                else characters.push(character);
            }
        }
        // The animals open the doors without a sound.
        this.duckRushManager?.forEachDoorOpener((position) => characters.push({ ...position, silent: true }));
        this.wanderingCharactersManager?.forEachDoorOpener((position) =>
            characters.push({ ...position, silent: true }),
        );
        // The ones on a raised floor open the doors of that floor.
        this.wanderingCharactersManager?.forEachRaisedDoorOpener((position, elevation) =>
            raised.push({ character: { ...position, silent: true }, elevation }),
        );
        const locks = this._knockManager?.getDoorLocks();
        this.doorAnimator.update(time, characters, listener, locks);
        this.upperDoors ??= new UpperDoors(
            this,
            () => this.gameMapFrontWrapper.getEntitiesManager().getEntities().values(),
            (collectionName, id) => this.getEntitiesCollectionsManager().getEntityPrefab(collectionName, id),
            (key, volume) => {
                volume *= get(doorVolumeStore);
                if (volume > 0) this.sound.play(key, { volume });
            },
            () => this.markDirty(),
            () => this.getHearingZones(),
        );
        this.upperDoors.update(time, raised, listener);
        // Red padlocks on the doors of the locked areas, for everyone.
        this.doorLockIcons ??= new DoorLockIcons(this, () => this.markDirty());
        this.doorLockIcons.update(this.doorAnimator.getLockedDoorMarkers(locks?.zones ?? []));
    }

    public update(time: number, delta: number): void {
        this.dirty = false;
        this.currentTick = time;

        if (biggestAvailableAreaStore.consumePendingRecompute()) {
            this.updateCameraOffsetFromBiggestAvailableArea();
        }

        const currentPlayerPreviousPosition = this.hasJoinedRoom
            ? { x: this.CurrentPlayer.x, y: this.CurrentPlayer.y }
            : undefined;

        if (this.hasJoinedRoom && this.mapEditorModeManager?.isActive()) {
            // In the map editor, the move keys scroll the map and the avatar stays put.
            this.cameraManager.move(this.userInputManager.getEventListForGameTick(), delta);
            this.CurrentPlayer.moveUser(delta, new ActiveEventList());
        } else if (this.hasJoinedRoom) {
            const moveEvents = this.userInputManager.getEventListForGameTick();
            if (
                moveEvents.get(UserInputEvent.MoveUp) ||
                moveEvents.get(UserInputEvent.MoveDown) ||
                moveEvents.get(UserInputEvent.MoveLeft) ||
                moveEvents.get(UserInputEvent.MoveRight)
            ) {
                this.userInputManager.userInputHandler.handlePointerCancelEvent?.();
                this.cameraManager.resumePlayerFollow();
            }
            this.CurrentPlayer.moveUser(delta, moveEvents);
        }
        if (this.mapEditorModeManager?.isActive()) {
            this.mapEditorModeManager.update(time, delta);
        }
        if (this.hasJoinedRoom) {
            this.refreshBridges(time);
            this.updateDoors(time);
            this._nerfManager?.update(time);
            // Before the night veil: it is pierced with the lights the torches have just drawn.
            this._torchManager?.update(time);
            this._fishingManager?.update(time);
            this._iceShackManager?.update(time);
            this.meteorView?.update(time);
            this.terrainView?.setWaterRings(this.meteorView?.waterRings(time) ?? []);
            this.stepIceBreaks(time);
            this.fireView?.update(time);
            this.treeFireView?.update(time);
            this.downpourView?.update(time);
            this.drainView?.update(time);
            this.ballView?.update(time);
            this.coldView?.update(time);
            this.fireTorchView?.update(time);
            this.nightManager?.update(time);
            this.lampManager?.update(time);
            this.gameSwitches?.update(time);
            this.karaokeSpotlight?.update(time);
            desktopApi.reportEnvironment(time);
            const serverDate = this.nightManager?.serverDate();
            this.outdoorTracker?.update();
            this.wallFade?.update(delta);
            if (this.wallFade) {
                const wallFade = this.wallFade;
                this.fadedWallFloor?.update(wallFade.version, () => wallFade.fadedFrontWalls());
            }
            this.seasonalThemeManager?.update(time, () => this.seasonalWalkers());
            this.gameMapFrontWrapper
                .getEntitiesManager()
                .updateSeason(time, serverDate, forcedTreeSeason(this.getSeasonalTheme()));
            // Under a hurricane, the weather drawn is that of where this player looks.
            const look = this.cameras.main.midPoint;
            setHurricaneViewpoint(look.x, look.y);
            this.weatherManager?.update(
                time,
                serverDate,
                this.nightManager?.isNight(),
                this.nightManager?.sunPosition(),
            );
            // The trees the wind is laying down fall on, before their shadows are drawn.
            this.fallenTreeView?.update(time);
            this.updateZombies(time, serverDate?.getTime());
            this.hurricaneView?.update(
                serverDate,
                this.nightManager?.sunPosition()?.elevation,
                window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
                !isBasicActive(),
            );
            {
                const weather = this.shownWeather();
                this.hurricaneDebris?.update(
                    delta,
                    serverDate?.getTime(),
                    { speed: weather?.windSpeed, from: weather?.windFrom },
                    get(weatherEffectsEnabledStore) && !isBasicActive() && !get(mapEditorModeStore),
                );
            }
            // After the weather: the textures of the clouds it drew this time (one may have just been made again).
            if (this.weatherManager) {
                this.terrainView?.setWaterReflection(
                    this.weatherManager.waterReflection(this.nightManager?.lampReflection()),
                );
            }
            // The relief may have been edited: the water follows it (nothing is done while it stays the same).
            const terrain = this.getGameMap().getWamFile()?.getWam().terrain;
            this.terrainWater.setTerrain(terrain);
            this.terrainWater.setPools(this.getGameMap().getWamFile()?.getWam().settings?.pools);
            // Told under the clock, with the floor of the avatar.
            avatarAltitudeStore.set(
                avatarAltitude(terrain, this.CurrentPlayer.x, this.CurrentPlayer.y, this.CurrentPlayer.getFloorZ()),
            );
            // And the ground and the water under the pointer, while it is over the game (drawn again only when a
            // figure shown changes: the water changes once a state of the server at most).
            const pointer = this.input.isOver ? this.input.activePointer : undefined;
            pointer?.updateWorldPoint(this.cameras.main);
            // The ground drawn under the pointer: down in a hollow when the relief is seen in 3/4.
            const pointed = pointer && { x: pointer.worldX, y: pointer.worldY };
            showPointerGround(
                pointerGroundAt(terrain, pointed && this.groundPointUnder(pointed), this.terrainWater, (point) =>
                    isOnFrozenWater(this, point),
                ),
            );
            // The flood of a hurricane: its marks, and how much higher the water stands under the pointer than before
            // it (to the decimetre, told only when that changes).
            this.hurricaneFlood?.update(time, !isBasicActive());
            const risen = pointed && this.hurricaneFlood?.riseAt(pointed.x, pointed.y);
            const shownRise = risen === undefined ? undefined : Math.round(risen * 10) / 10;
            if (shownRise !== this.shownFloodRise) {
                this.shownFloodRise = shownRise;
                pointerFloodRiseStore.set(shownRise);
            }
            // The weather pipette: the cell under the pointer explained, while it is on.
            this.stepWeatherPipette(pointed, time);
            // Their own ground, for a player who follows the weather of a place they chose.
            this.localTerrain.update();
            // One engine draws the ground: the relief in 3/4 where the player chose it (never in the editor nor in
            // Basique), the flat one else (nothing in Basique).
            const projected = this.pixelReliefShown();
            this.terrainView?.update(time);
            // The relief in 3/4 is made when the player turns it on, destroyed when they turn it off, hidden meanwhile
            // in the editor and in Basique: no page to load again.
            // Its blocks only where the shaders of the flat engine cannot draw it.
            this.pixelRelief?.sync(blocksStateOf(this.groundChoice()), time);
            // The relief as it is seen: flat under what is built, where everyone is drawn at their place.
            if (projected) this.seenRelief?.refresh(time);
            // The objects standing on the ground, drawn where it is.
            this.placedDrops?.update(time);
            this.submergedDrains.update(time);
            // Every character drawn as low as the ground (or the water) under it, in a hollow; at its place when the
            // relief is not seen in 3/4.
            const relief = this.reliefSeen();
            const dropOf = (character: Character): number => {
                const feet = feetOf(character);
                return projected
                    ? avatarDrop(
                          relief,
                          feet,
                          waterDepthAtPoint((x, y) => this.seenDepthAt(x, y, time), feet.x, feet.y),
                          character.getFloorZ(),
                          false,
                          // A bridge is a raised floor: who walks on its deck is on a floor (no drop), who is
                          // under it is on the ground, in its water.
                          false,
                      )
                    : 0;
            };
            if (this.CurrentPlayer) this.CurrentPlayer.setGroundDrop(dropOf(this.CurrentPlayer));
            for (const remote of this.MapPlayersByKey.values()) remote.setGroundDrop(dropOf(remote));
            this.waterFlowView?.update(time);
            this.waterFlowOverlay?.update(time);
            this.aquaticLifeView?.update(time);
            this.frozenPoolsView?.update(time);
            this.gullLifeView?.update(time);
            this.landCompanions?.update(time);
            this.landLifeView?.update(time);
            this.updateLandCries();
            this.skyShadowManager?.update(time);
            this.skyWindowLightManager?.update(time);
            this.skyMovingShadows?.update();
            this.treeSway?.update(time, serverDate?.getTime() ?? time);
            // After the swaying: the bare image over a snowy tree bends as its tree does.
            this.treeSeasonEffects?.update(time, serverDate?.getTime() ?? time);
            this.updateFootsteps();
            this.updateOverheardLoudness();
            this.updateDiscussionMarks();
        }

        for (const addedPlayer of this.remotePlayersRepository.getAddedPlayers()) {
            debugAddPlayer("Player will be add to the GameScene", addedPlayer);
            this.doAddPlayer(addedPlayer);
            debugAddPlayer("Player has been added to the GameScene", addedPlayer);
        }
        for (const movedPlayer of this.remotePlayersRepository.getMovedPlayers()) {
            this.doUpdatePlayerPosition(movedPlayer);
        }
        for (const updatedPlayer of this.remotePlayersRepository.getUpdatedPlayers()) {
            debugUpdatePlayer("Player will be update from GameScene", updatedPlayer);
            this.doUpdatePlayerDetails(updatedPlayer);
            debugUpdatePlayer("Player has been updated from GameScene", updatedPlayer);
        }
        for (const removedPlayerId of this.remotePlayersRepository.getRemovedPlayers()) {
            debugRemovePlayer("Player will be remove from GameScene", removedPlayerId);
            this.doRemovePlayer(removedPlayerId);
            debugRemovePlayer("Player has been removed from GameScene", removedPlayerId);
        }

        if (
            !this.playersDebugLogAlreadyDisplayed &&
            this.remotePlayersRepository.getPlayers().size !== this.MapPlayersByKey.size
        ) {
            console.error(
                "Not the same count of players",
                this.remotePlayersRepository.getPlayers(),
                this.MapPlayersByKey,
                "Added players:",
                this.remotePlayersRepository.getAddedPlayers(),
                "Moved players:",
                this.remotePlayersRepository.getMovedPlayers(),
                "Updated players:",
                this.remotePlayersRepository.getUpdatedPlayers(),
                "Removed players:",
                this.remotePlayersRepository.getRemovedPlayers(),
            );
            this.playersDebugLogAlreadyDisplayed = true;
        }

        this.remotePlayersRepository.reset();

        // Let's handle all events
        while (this.pendingEvents.length !== 0) {
            this.dirty = true;
            const event = this.pendingEvents.dequeue();
            switch (event.type) {
                /*case "AddPlayerEvent":
                    this.doAddPlayer(event.event);
                    break;
                case "RemovePlayerEvent":
                    this.doRemovePlayer(event.userId);
                    break;
                case "UserMovedEvent": {
                    this.doUpdatePlayerPosition(event.event);
                    const remotePlayer = this.MapPlayersByKey.get(event.event.userId);
                    if (remotePlayer) {
                        this.activatablesManager.updateDistanceForSingleActivatableObject(remotePlayer);
                        this.activatablesManager.deduceSelectedActivatableObjectByDistance();
                    }
                    break;
                }*/
                case "GroupCreatedUpdatedEvent":
                    this.doShareGroupPosition(event.event);
                    break;
                /*case "PlayerDetailsUpdated":
                    this.doUpdatePlayerDetails(event.details);
                    break;*/
                case "DeleteGroupEvent": {
                    this.doDeleteGroup(event.groupId);
                    if (this.currentPlayerGroupId === event.groupId) {
                        this.currentPlayerGroupId = undefined;
                        currentPlayerGroupIdStore.set(undefined);
                        currentPlayerGroupLockStateStore.set(undefined);
                    }
                    break;
                }
                case "GroupUsersUpdatedEvent": {
                    this.doUpdateGroupUsers(event.event.groupId, event.event.userIds);
                    break;
                }
                default: {
                    const _exhaustiveCheck: never = event;
                }
            }
        }
        // Let's move all users
        const updatedPlayersPositions = this.playersPositionInterpolator.getUpdatedPositions(time);
        const conversationBubblesToUpdate = new Set<ConversationBubble>();
        updatedPlayersPositions.forEach((moveEvent: HasPlayerMovedInterface, userId: number) => {
            this.dirty = true;
            const player: RemotePlayer | undefined = this.MapPlayersByKey.get(userId);
            if (player === undefined) {
                throw new Error('Cannot find player with ID "' + userId + '"');
            }
            const previousPosition = { x: player.x, y: player.y };
            player.updatePosition(moveEvent);
            this.addConversationBubblesAffectedByPlayerMove(
                userId,
                previousPosition,
                player,
                conversationBubblesToUpdate,
            );
            // If the camera is following the player, we need to update the viewport
            if (this.cameraManager?.playerFollowing === player) {
                this._sendViewportToServer();
            }
        });

        if (this.hasMovedThisFrame && currentPlayerPreviousPosition !== undefined) {
            this.addConversationBubblesAffectedByPlayerMove(
                this.connection?.getUserId(),
                currentPlayerPreviousPosition,
                this.CurrentPlayer,
                conversationBubblesToUpdate,
            );
        }

        // If a user close to a bubble has moved, we need to recompute that bubble shape.
        for (const group of this.groups.values()) {
            if (group.needsStep || group.isAnimating || conversationBubblesToUpdate.has(group)) {
                group.step(this.getConversationBubbleAvatars(group));
            }
        }
        this.hasMovedThisFrame = false;

        if (DEBUG_MODE) {
            this.updateServerViewportDebugOverlay();
        }
    }

    private addConversationBubblesAffectedByPlayerMove(
        userId: number | undefined,
        previousPosition: PositionCoordinates,
        currentPosition: PositionCoordinates,
        conversationBubblesToUpdate: Set<ConversationBubble>,
    ): void {
        for (const group of this.groups.values()) {
            if (
                (userId !== undefined && group.containsUserId(userId)) ||
                this.isPointInConversationBubbleInfluence(group, previousPosition) ||
                this.isPointInConversationBubbleInfluence(group, currentPosition)
            ) {
                conversationBubblesToUpdate.add(group);
            }
        }
    }

    private getConversationBubbleAvatars(group: ConversationBubble): Avatar[] {
        const remotePlayers = new Map<number, RemotePlayer>();
        for (const remotePlayer of this.remotePlayersSpatialIndex.queryCircle(
            group.x,
            group.y,
            group.getInfluenceRadius(),
        )) {
            remotePlayers.set(remotePlayer.userId, remotePlayer);
        }
        for (const userId of group.getUserIds()) {
            const remotePlayer = this.MapPlayersByKey.get(userId);
            if (remotePlayer !== undefined) {
                remotePlayers.set(userId, remotePlayer);
            }
        }

        const avatars: Avatar[] = [];
        for (const remotePlayer of remotePlayers.values()) {
            const avatar = group.turnInAvatar(remotePlayer);
            if (avatar !== undefined) {
                avatars.push(avatar);
            }
        }

        const currentUserId = this.connection?.getUserId();
        if (
            currentUserId !== undefined &&
            (group.containsUserId(currentUserId) ||
                this.isPointInConversationBubbleInfluence(group, this.CurrentPlayer))
        ) {
            const avatar = group.turnInAvatar(this.CurrentPlayer);
            if (avatar !== undefined) {
                avatars.push(avatar);
            }
        }

        return avatars;
    }

    private isPointInConversationBubbleInfluence(group: ConversationBubble, position: PositionCoordinates): boolean {
        const influenceRadius = group.getInfluenceRadius();
        const dx = position.x - group.x;
        const dy = position.y - group.y;
        return dx * dx + dy * dy <= influenceRadius * influenceRadius;
    }

    private updateServerViewportDebugOverlay(): void {
        const viewport = this.calculateViewport();
        if (!viewport) {
            this.serverViewportDebugGraphics?.clear();
            return;
        }
        if (!this.serverViewportDebugGraphics) {
            this.serverViewportDebugGraphics = this.add.graphics();
            this.serverViewportDebugGraphics.setDepth(DEPTH_DEBUG_SERVER_VIEWPORT);
        }
        const g = this.serverViewportDebugGraphics;
        g.clear();
        g.lineStyle(30, 0x00ffaa, 0.92);
        g.strokeRect(viewport.left, viewport.top, viewport.right - viewport.left, viewport.bottom - viewport.top);
    }

    deleteGroup(groupId: number): void {
        this.pendingEvents.enqueue({
            type: "DeleteGroupEvent",
            groupId,
        });
    }

    doDeleteGroup(groupId: number): void {
        const group = this.groups.get(groupId);
        if (!group) {
            return;
        }
        group.destroy();
        this.groups.delete(groupId);
    }

    doUpdateGroupUsers(groupId: number, userIds: number[]): void {
        const group = this.groups.get(groupId);
        if (!group) {
            console.warn("Could not find group with ID", groupId);
            return;
        }
        group.updateUsers(userIds);
    }

    doUpdatePlayerDetails(update: PlayerDetailsUpdate): void {
        const character = this.MapPlayersByKey.get(update.player.userId);
        if (character === undefined) {
            console.info(
                "Could not set new details to character with ID ",
                update.player.userId,
                ". Did he/she left before te message was received?",
            );
            return;
        }

        if (update.updated.availabilityStatus) {
            character.setAvailabilityStatus(update.player.availabilityStatus);
        }
        character.setVehicles(update.player.variables);
        character.setNerfEquipped(update.player.variables.get(NERF_EQUIPPED_VARIABLE));
        character.setNerfHearts(update.player.variables.get(NERF_HEARTS_VARIABLE));
        character.setTorchEquipped(update.player.variables.get(TORCH_EQUIPPED_VARIABLE));
        character.setPerception(update.player.variables.get(PERCEPTION_VARIABLE));
        this._perceptionManager?.refresh(character);
        character.setRodEquipped(update.player.variables.get(ROD_EQUIPPED_VARIABLE));
        character.setFloorZ(decodeFloorZ(update.player.variables.get(FLOOR_Z_VARIABLE)));
        character.setTorchIntensity(update.player.variables.get(TORCH_INTENSITY_VARIABLE));
        character.setAvatarAction(update.player.variables.get(AVATAR_ACTION_VARIABLE));
        character.setSwimwear(update.player.variables.get(SWIMWEAR_VARIABLE));
        character.setSwimwearColor(update.player.variables.get(SWIMWEAR_COLOR_VARIABLE));
        if (update.updated.chatID) {
            character.setChatID(update.player.chatID);
        }
        if (update.updated.outlineColor) {
            if (update.player.outlineColor === undefined) {
                character.removeApiOutlineColor();
            } else {
                character.setApiOutlineColor(update.player.outlineColor);
            }
        }
        if (update.updated.showVoiceIndicator) {
            character.toggleTalk(update.player.showVoiceIndicator);
        }
        if (update.updated.sayMessage) {
            character.say(update.player.sayMessage?.message ?? "", update.player.sayMessage?.type ?? 0);
        }
    }

    /**
     * Shows/hides the raised-hand indicator above a remote player's woka, resolving the woka from the
     * numeric player id (derived from the SpaceUser's spaceUserId). The raise-hand state lives on the
     * SpaceUser (see SpacePeerManager), so this also covers participants who joined the meeting after the
     * hand was raised.
     */
    /**
     * Shares the local user's Spotify listening in the world space, and shows a music note on the woka of everyone
     * who listens to something or takes part in a Jam.
     */
    private startSpotifyListening(worldSpace: SpaceInterface): Unsubscriber[] {
        const sharer = new SpotifyListeningSharer(
            (spotifyListening) => {
                worldSpace.emitUpdateUser({ spotifyListening });
                desktopApi.reportListening(spotifyListening);
            },
            spotifyAccount,
            spotifySharingEnabledStore,
            joinedJamStore,
            undefined,
            undefined,
            desktopSpotifyPlayer(),
            // Only while the local Spotify app really plays along: a follow paused without the extension does not count.
            derived([followedUserUuidStore, listenAlongAvailableStore], ([followed, available]) =>
                available ? followed : undefined,
            ),
            // The confirmed audio session drives presence too: opening the Spotify invite is not required.
            derived(
                [allJamRoomsStore, jamAudioSession.listeningSpaceName],
                ([rooms, spaceName]): JoinedJam | undefined => {
                    const room =
                        spaceName &&
                        rooms.find(
                            (candidate) =>
                                jamAudioSession.spaceNameOf({
                                    areaId: candidate.zone.areaId,
                                    propertyId: candidate.zone.propertyId,
                                    hostUuid: candidate.jam.hostUuid,
                                }) === spaceName,
                        );
                    return room
                        ? {
                              areaId: room.zone.areaId,
                              areaName: room.zone.areaName,
                              hostUuid: room.jam.hostUuid,
                              url: listeningZoneJamKey(room.jam),
                          }
                        : undefined;
                },
            ),
        );
        return [
            bindListeningDirectory(worldSpace.usersStore),
            () => sharer.destroy(),
            startListeningFollower(followedUserUuidStore, listeningByUserUuidStore),
            syncJoinedJam(),
            this.startHomeJam(),
            listeningByUserUuidStore.subscribe((listeningByUuid) => this.updateListeningWokas(listeningByUuid)),
        ];
    }

    private startHomeJam(): Unsubscriber {
        const connection = this.connection;
        if (!connection) {
            return () => undefined;
        }
        const context: HomeJamContext = {
            rooms: allJamRoomsStore,
            joined: joinedJamStore,
            listeningByUserUuid: listeningByUserUuidStore,
            localUuid: () => localUserStore.getLocalUser()?.uuid,
            userByUuid: (uuid) => {
                const player = playersStore.getPlayerByUuid(uuid);
                return player && { id: player.userId, name: player.name };
            },
            userById: (id) => {
                const player = playersStore.getPlayerById(id);
                return player && { uuid: player.userUuid, name: player.name };
            },
            send: (name, data, userIds) => {
                connection.emitScriptableEvent(name, data, userIds).catch((error) => {
                    console.warn("Could not send a Jukebox event", error);
                });
            },
            onEvent: (listener) => {
                const subscription = connection.receivedEventMessageStream.subscribe(({ name, data, senderId }) =>
                    listener(name, data, senderId),
                );
                return () => subscription.unsubscribe();
            },
            desktop: window.WAD,
        };
        const stopHomeJam = startHomeJam(context);
        const stopStage = startKaraokeStage(context);
        const stopKaraoke = startJamKaraoke({
            ...context,
            account: spotifyAccount,
            sharingEnabled: spotifySharingEnabledStore,
        });
        const stopJamLinkRequests = startJamLinkRequests({
            ...context,
            // Like a wave: a sound muted in "do not disturb" and a system notification only out of it.
            alert: ([latest = "", ...others]) => {
                this.playBubbleInSound();
                const texts = get(LL).spotify.listeningZone.jamLinkRequest;
                notifySystem({
                    kind: "jamLinkRequest",
                    title:
                        others.length === 0
                            ? texts.one({ name: latest })
                            : texts.many({ name: latest, count: others.length }),
                    body: "",
                    tag: "jam-link-request",
                    // The card is already in the page: bringing the tab to the front is enough.
                    onClick: () => {},
                });
            },
        });
        return () => {
            stopHomeJam();
            stopKaraoke();
            stopStage();
            stopJamLinkRequests();
        };
    }

    private updateListeningWokas(listeningByUuid: ListeningByUserUuid): void {
        this.listeningUserUuids = new Set(listeningByUuid.keys());
        for (const player of this.MapPlayersByKey.values()) {
            player.setListeningMusic(this.listeningUserUuids.has(player.userUuid));
        }
        const localUuid = localUserStore.getLocalUser()?.uuid;
        this.CurrentPlayer?.setListeningMusic(localUuid !== undefined && this.listeningUserUuids.has(localUuid));
    }

    private setRemotePlayerRaisedHand(playerId: number, raised: boolean): void {
        this.MapPlayersByKey.get(playerId)?.setRaisedHand(raised);
    }

    /**
     * Sends to the server an event emitted by one of the ActionableItems.
     */
    emitActionableEvent(itemId: number, eventName: string, state: unknown, parameters: unknown) {
        this.connection?.emitActionableEvent(itemId, eventName, state, parameters);
    }

    public onResize(): void {
        super.onResize();
        this.reposition(true);

        this.throttledSendViewportToServer_();
    }

    /**
     * Calculates the viewport including nearby areas with maxUsersInAreaPropertyData.
     * Only areas within MAX_AREA_EXTENSION_DISTANCE from the camera viewport are included.
     * The viewport is also capped to MAX_VIEWPORT_SIZE to prevent performance issues.
     * @param margin - Margin to add around the camera viewport
     * @returns The calculated viewport or null if invalid
     */
    private calculateViewport(margin = 300): ViewportInterface | null {
        if (!this.scene.scene.renderer) {
            // The camera's worldView is empty without a renderer: sending it would replace the viewport of the
            // joinRoom message with a 300 px square at the map origin.
            return this.CurrentPlayer === undefined ? null : this.getHeadlessViewport();
        }
        const camera = this.cameras.main;
        if (!camera) {
            return null;
        }

        const worldView = camera.worldView;

        // Base viewport from camera
        const baseLeft = Math.max(0, worldView.x - margin);
        const baseTop = Math.max(0, worldView.y - margin);
        const baseRight = worldView.right + margin;
        const baseBottom = worldView.bottom + margin;

        const viewport = this.intersectViewportWithMapBounds(
            { left: baseLeft, top: baseTop, right: baseRight, bottom: baseBottom },
            this.Map.widthInPixels,
            this.Map.heightInPixels,
        );

        return viewport;
    }

    /**
     * Intersects the viewport with the map rectangle [0, mapWidth] × [0, mapHeight] in world pixels.
     */
    private intersectViewportWithMapBounds(
        viewport: ViewportInterface,
        mapWidth: number,
        mapHeight: number,
    ): ViewportInterface | null {
        if (mapWidth <= 0 || mapHeight <= 0) {
            return null;
        }
        const left = Math.max(0, viewport.left);
        const top = Math.max(0, viewport.top);
        const right = Math.min(mapWidth, viewport.right);
        const bottom = Math.min(mapHeight, viewport.bottom);
        if (right <= left || bottom <= top) {
            return null;
        }
        return { left, top, right, bottom };
    }

    /**
     * Checks if two viewports are equal.
     * @param viewport1 - First viewport
     * @param viewport2 - Second viewport
     * @returns true if viewports are equal, false otherwise
     */
    private areViewportsEqual(viewport1: ViewportInterface, viewport2: ViewportInterface): boolean {
        return (
            viewport1.left === viewport2.left &&
            viewport1.top === viewport2.top &&
            viewport1.right === viewport2.right &&
            viewport1.bottom === viewport2.bottom
        );
    }

    private _sendViewportToServer(margin = 300): void {
        const newViewport = this.calculateViewport(margin);
        if (!newViewport) {
            return;
        }

        // Only send viewport if it has changed
        if (this.lastSentViewport && this.areViewportsEqual(this.lastSentViewport, newViewport)) {
            return;
        }

        this.lastSentViewport = newViewport;
        this.connection?.setViewport(newViewport);
    }

    public get sendViewportToServer() {
        return this.throttledSendViewportToServer_;
    }

    private updateCameraOffsetFromBiggestAvailableArea(instant = false): void {
        biggestAvailableAreaStore.recompute();
        if (this.cameraManager != undefined) {
            this.cameraManager.updateCameraOffset(get(biggestAvailableAreaStore), instant);
        }
    }

    public reposition(instant = false): void {
        // Recompute camera offset if needed
        this.time.delayedCall(0, () => {
            this.updateCameraOffsetFromBiggestAvailableArea(instant);
        });
    }

    public createSuccessorGameScene(autostart: boolean, reconnecting: boolean) {
        const gameSceneKey = "somekey" + Math.round(Math.random() * 10000);
        const game = new GameScene(this._room, gameSceneKey);
        this.scene.add(gameSceneKey, game, autostart, {
            initPosition: this.CurrentPlayer
                ? {
                      x: this.CurrentPlayer.x,
                      y: this.CurrentPlayer.y,
                  }
                : undefined,
            reconnecting: reconnecting,
        } satisfies GameSceneInitInterface);

        // Register the new scene as current when not autostarting (so GameManager can start it) or when
        // reconnecting (so getCurrentGameScene() returns the new scene during teardown and store subscriptions work).
        if (!autostart || reconnecting) {
            gameManager.gameSceneIsCreated(game);
        }

        this.scene.stop(this.scene.key);
        this.scene.remove(this.scene.key);
    }

    public getNightActive(): boolean {
        return (this.nightManager?.isNight() ?? false) && !this.mapEditorModeManager?.isActive();
    }

    /** Server (Paris) time shared by every client, undefined until the clock is synchronised. */
    public getServerDate(): Date | undefined {
        return this.nightManager?.serverDate();
    }

    /** The time of the sky this player sees: the server's, ahead of it while they speed the day up (FastDayClock). */
    public getSkyDate(): Date | undefined {
        return this.nightManager?.skyDate();
    }

    /**
     * A state of the water from the server: unzipped (that takes a moment), then shown. The states are taken one
     * after the other, in the order they came: a change applies to the state just before it.
     */
    private receiveAquaticLife(message: AquaticLifeMessage): void {
        this.aquaticLife.receive(message.animals, this.time.now);
        this.gullLife.receive(message.animals, this.time.now);
        this.landLife.receive(message.animals, this.time.now);
        // The dashboard of the life tool: nothing to show on a map that never had any life.
        this.aquaticLifeStats.receive(
            message.animals,
            message.stats ? withoutSpeciesCounts(message.stats) : undefined,
            Date.now(),
        );
        aquaticLifeStatsStore.set(
            message.stats || message.animals.length > 0 ? this.aquaticLifeStats.view(Date.now()) : undefined,
        );
        this.aquaticLifeSpecies.receive(
            message.animals,
            message.stats ? { ...message.stats, species: message.species } : undefined,
            Date.now(),
        );
        aquaticLifeSpeciesStore.set(message.stats ? this.aquaticLifeSpecies.view(Date.now()) : undefined);
    }

    /**
     * The meadow and the water the room sent on joining are unzipped asynchronously: the map waits for them before
     * being shown, so its grass, snow and water do not pop in after it. Never longer than FIRST_GROUND_WAIT_MS.
     */
    private groundStatesOfJoinApplied(): Promise<void> {
        return Promise.race([
            Promise.all([this.meadowQueue, this.terrainWaterQueue]).then(() => undefined),
            new Promise<void>((resolve) => {
                setTimeout(resolve, FIRST_GROUND_WAIT_MS);
            }),
        ]);
    }

    private receiveTerrainWater(message: TerrainWaterMessage): void {
        this.terrainWaterQueue = this.terrainWaterQueue
            .then(async () => {
                const depths = await gunzip(message.depths);
                const speeds = message.speeds ? await gunzip(message.speeds) : undefined;
                const slowSpeeds = message.slowSpeeds ? await gunzip(message.slowSpeeds) : undefined;
                const state = { ...message, depths, speeds, slowSpeeds };
                // While this player lives their own ground, the server's is kept aside, not shown.
                if (this.localTerrain.fromServerWater(state)) return;
                this.terrainWater.receive(state, this.time.now);
                if (message.stats) terrainWaterStatsStore.set(message.stats);
            })
            .catch((error: unknown) => console.warn("A state of the water of the relief could not be read", error));
    }

    /** The conditions of the room: shown in the widget, and their wind, when set by hand, moves the whole scene. */
    private receiveFireConditions(conditions: FireConditionsMessage | undefined): void {
        fireConditionsStore.set(conditions);
        setRoomConditions(conditions);
    }

    private receiveMeadow(message: MeadowMessage): void {
        this.meadowQueue = this.meadowQueue
            .then(async () => {
                // The dryness, the fire and the ash are empty from a server that does not know them.
                const read = (bytes: Uint8Array): Promise<Uint8Array> =>
                    bytes.length > 0 ? gunzip(bytes) : Promise.resolve(new Uint8Array(0));
                const [grass, moisture, dryness, fire, ash, snow, ice] = await Promise.all([
                    gunzip(message.grass),
                    gunzip(message.moisture),
                    read(message.dryness),
                    read(message.fire),
                    read(message.ash),
                    read(message.snow),
                    read(message.ice),
                ]);
                const state = {
                    width: message.width,
                    height: message.height,
                    grass,
                    moisture,
                    dryness,
                    fire,
                    ash,
                    snow,
                    ice,
                    catchingUp: message.catchingUp,
                };
                // While this player lives their own ground, the server's is kept aside, not shown.
                if (this.localTerrain.fromServerMeadow(state)) return;
                this.meadow.receive(state);
            })
            .catch((error: unknown) => console.warn("A state of the meadow of the map could not be read", error));
    }

    /**
     * The season of the ground of the map, by the calendar of its place like the meadow of the server (not the personal
     * theme: the snow of the heights slows everyone alike). Unknown until the time of the server is.
     */
    public getGroundSeason(): Season | undefined {
        const date = this.nightManager?.serverDate();
        return date && Number.isFinite(date.getTime()) ? seasonAt(date, this.getMapPlace()) : undefined;
    }

    /**
     * The place saved with the map (Paris without one): its seasons and its day, the same for every player and for the
     * server. Not the place a person tries in the weather settings, nor the city of the sky of the world they follow.
     */
    public getMapPlace(): WeatherLocation | undefined {
        return this.getGameMap().getWamFile()?.getWam().settings?.weatherLocation;
    }

    /** The meadow of the map, for what reads its grass and the moisture of its soil. */
    public getMeadow(): MeadowState {
        return this.meadow;
    }

    /** The fire of the map as its walking animals see it, rebuilt four times a second at most while it burns. */
    private lifeFire: { at: number; fire: LifeFire } | undefined;

    /**
     * The fire of the map as the animals that walk on it see it: the grass that burns and the trees on fire, by
     * their foot. Undefined while nothing burns: nothing is then looked at.
     */
    public getLifeFire(): LifeFire | undefined {
        const burning = this.treeFire.burning();
        if (burning.length === 0 && !this.meadow.isBurning()) {
            this.lifeFire = undefined;
            return undefined;
        }
        const now = this.time.now;
        if (this.lifeFire && now - this.lifeFire.at < 250) return this.lifeFire.fire;
        const entities = this.gameMapFrontWrapper?.getEntitiesManager()?.getEntities();
        const trees: { x: number; y: number }[] = [];
        for (const { id } of burning) {
            const tree = entities?.get(id);
            if (tree) trees.push({ x: tree.x + tree.displayWidth / 2, y: tree.y + tree.displayHeight });
        }
        this.lifeFire = { at: now, fire: lifeFireOf(this.meadow, () => trees) };
        return this.lifeFire.fire;
    }

    /** The fire of the trees of the map as the server tells it, for the trees that pick their image by it. */
    public getTreeFire(): TreeFireState {
        return this.treeFire;
    }

    /** How the tree `id` stands for its shadow when the wind laid it down (falling, lying, growing back). */
    private fallenTreePose(id: string): TreePose | undefined {
        const fallen = this.treeFire.fallenOf(id);
        if (!fallen) return undefined;
        // Along the ground as the tree lying is drawn: its shadow lies under it.
        const way = lyingVector(fallen.toward);
        if (fallen.lying) {
            return {
                towardX: way.x,
                towardY: way.y,
                tilt: this.fallenTreeView?.tiltOf(id) ?? Math.PI / 2,
                size: 1,
                // Bare branches, the fronds of a palm: their own shadow, as drawn.
                limbs: this.fallenTreeView?.limbsOf(id),
            };
        }
        return { towardX: way.x, towardY: way.y, tilt: 0, size: growShare(growStep(fallen.grown)) };
    }

    /** The trees the wind laid down, lying on the ground: the objects of the map show them there. */
    public getFallenTreeView(): FallenTreeView {
        this.fallenTreeView ??= new FallenTreeView(this);
        return this.fallenTreeView;
    }

    /** The server said how the trees burn: the ones it named show the image of their state. */
    private receiveTreeFire(message: TreeFireMessage): void {
        this.showTreeFireImages(this.treeFire.receive(message, this.time.now));
    }

    /** These trees pick their image again: charred as far as they burnt, or plain. */
    private showTreeFireImages(ids: readonly string[]): void {
        if (ids.length === 0) return;
        const entities = this.gameMapFrontWrapper?.getEntitiesManager()?.getEntities();
        for (const id of ids) entities?.get(id)?.showPrefabTexture();
        this.markDirty();
    }

    /**
     * How much lower the surface of the water under a point is drawn (a lake at the bottom of a hollow, in 3/4): fish,
     * floats and glints lie on it. Nothing on a bridge, nor while the relief is not shown in 3/4.
     */
    public surfaceDropAt(x: number, y: number): number {
        return this.pixelReliefShown() ? this.surfaceDropIn34(x, y) : 0;
    }

    /**
     * How much lower what stands or lies on the ground at a point is drawn (higher on a mount): an object, an animal,
     * a flame, a footprint. The ground alone, whatever water lies on it. Nothing while the relief is not shown in 3/4.
     */
    public groundDropAt(x: number, y: number): number {
        return this.pixelReliefShown() ? groundDropOf(this.reliefSeen(), x, y) : 0;
    }

    /**
     * Changes when what groundDropAt answers may have changed: another relief, or the 3/4 shown or not. For what keeps
     * the drop of things that do not move (the objects of the map).
     */
    public reliefDrawVersion(): number {
        const terrain = this.reliefSeen();
        const shown = this.pixelReliefShown();
        if (terrain !== this.reliefDrawn.terrain || shown !== this.reliefDrawn.shown) {
            this.reliefDrawn = { terrain, shown, version: this.reliefDrawn.version + 1 };
        }
        return this.reliefDrawn.version;
    }

    /**
     * What is drawn lower in a hollow and higher on a mount, only while the image is drawn (CharacterDrops): the
     * avatars and their companions, the wandering animals, the objects standing on a relief. Nobody else while the
     * relief is not shown in 3/4 (the drop of each is then nothing).
     */
    private *drawnLower(): Generator<DroppedCharacter> {
        const players = [...(this.CurrentPlayer ? [this.CurrentPlayer] : []), ...this.MapPlayersByKey.values()];
        yield* players;
        if (!this.pixelReliefShown()) return;
        for (const player of players) if (player.companion) yield player.companion;
        yield* this.placedDrops?.moved() ?? [];
        if (this.wanderingCharactersManager) {
            yield* this.wanderingCharactersManager.drawnLower((x, y) => this.groundDropAt(x, y));
        }
    }

    /**
     * The relief as it is seen in 3/4 (BuiltGround.ts): the relief of the map, flat under what is built (paved with
     * the Carte tool, inside a building, a pool), whose floors, walls and tiles are drawn at their place whatever the
     * relief under them. Everything drawn lower or higher reads this one: on a terrace laid on a mount, the avatar,
     * the furniture and the pool stay where they block.
     */
    private reliefSeen(): TerrainData | undefined {
        return this.seenRelief ? this.seenRelief.terrain() : this.terrainWater.relief();
    }

    /** The depth of the water at a point as the 3/4 raises or lowers its surface: none over what is built. */
    private seenDepthAt(x: number, y: number, now: number): number {
        return this.seenRelief?.isFlatAt(x, y) ? 0 : this.terrainWater.depthAt(x, y, now);
    }

    /** What is built on the map now, cell by cell (FlatGround). */
    private builtGround(): FlatGround {
        const grid = this.getOutdoorGrid();
        const entities = this.gameMapFrontWrapper.getEntitiesManager().getEntities().values();
        return FlatGround.of({
            columns: Math.ceil(this.Map.widthInPixels / TERRAIN_CELL),
            rows: Math.ceil(this.Map.heightInPixels / TERRAIN_CELL),
            pavedTiles: pavedTilesOf(this.getGameMap().getWamFile()?.getWam()),
            isIndoorAt: grid ? (x, y) => !grid.isOutdoorAt(x, y) : undefined,
            pools: imagePoolsOf(entities),
            terrain: this.terrainWater.relief(),
        });
    }

    /** Changes when a floor of the Carte tool, a wall or a pool placed as an image is added, moved or taken away. */
    private builtSignature(): string {
        let floors = 0;
        let pools = 0;
        let hash = 0;
        for (const entity of this.gameMapFrontWrapper.getEntitiesManager().getEntities().values()) {
            const prefab = entity.getPrefab();
            const pool = (prefab.water?.length ?? 0) > 0;
            if (prefab.collectionName !== "Carte Sols" && !pool) continue;
            if (pool) pools++;
            else floors++;
            hash = (hash * 31 + entity.x * 7 + entity.y * 13 + entity.displayWidth + entity.getElevation()) | 0;
        }
        return `${this.getOutdoorVersion()}:${floors}:${pools}:${hash}`;
    }

    /** The same, the relief being shown in 3/4 (asked many times for one point by hiddenOnWater). */
    private surfaceDropIn34(x: number, y: number): number {
        const now = this.time.now;
        return surfaceDropAt(
            this.reliefSeen(),
            waterDepthAtPoint((pointX, pointY) => this.seenDepthAt(pointX, pointY, now), x, y),
            x,
            y,
            // The water under the deck of a bridge (a raised floor) is drawn as low as the rest of its lake.
            false,
            false,
        );
    }

    /** Whether a point of the water is hidden by the south rim of its hollow, as the relief is drawn in 3/4. */
    public hiddenOnWater(x: number, y: number): boolean {
        if (!this.pixelReliefShown()) return false;
        return hiddenBehindRim(
            this.reliefSeen(),
            x,
            y,
            (pointX, pointY) => this.surfaceDropIn34(pointX, pointY),
            this.terrainWater.deepest(),
        );
    }

    /** The flat drawing of the relief, for the editor to show the bottom through the water while it is edited. */
    public getTerrainView(): TerrainView | undefined {
        return this.terrainView;
    }

    /** What decides which engine draws the ground (GroundEngineChoice). */
    private groundChoice(): { chosen: boolean; editorOpen: boolean; basic: boolean; shader: boolean } {
        return {
            chosen: get(pixelReliefStore),
            editorOpen: get(mapEditorModeStore),
            basic: isBasicActive(),
            shader: this.terrainView?.canProject() === true,
        };
    }

    /**
     * The engine that draws the ground now: the flat one, its shaders in 3/4, or the blocks in 3/4 where the shaders
     * cannot. Worked out once an image: every character, every animal of the water and the float of a line ask it.
     */
    private groundEngine(): GroundEngine {
        const frame = this.game.loop.frame;
        if (frame !== this.groundEngineAt) {
            this.groundEngineAt = frame;
            this.groundEngineNow = groundEngineOf(this.groundChoice());
        }
        return this.groundEngineNow;
    }

    /**
     * Whether the relief is shown in 3/4 now: the player chose it, the map is not edited and Basique does not apply.
     * Drawn so by the shaders of the flat engine, or by the blocks where they cannot (pixelBlocksShown). Else the ground
     * is flat, and nothing is drawn lower nor higher than its place.
     */
    public pixelReliefShown(): boolean {
        return this.groundEngine() !== "flat";
    }

    /**
     * Whether the blocks in pixel art (ReliefTiles) draw the ground now: the relief is shown in 3/4 and the shaders of
     * the flat engine cannot draw it on this graphics card. That engine hides then, and what goes with the blocks
     * applies (the pools placed as images keep their image, the leaves lie over the blocks, …).
     */
    public pixelBlocksShown(): boolean {
        return this.groundEngine() === "blocks";
    }

    /** The point of the ground drawn under a point of the map: itself, unless the relief is shown in 3/4. */
    public groundPointUnder(point: { x: number; y: number }): { x: number; y: number } {
        if (!this.pixelReliefShown()) return point;
        // The deck of a bridge is a raised floor, drawn at its place over the hollow under it: a click on it is on it.
        const now = this.time.now;
        return groundPointAt(
            this.reliefSeen(),
            point,
            (x, y) => this.terrainWater.isBridgeAt(x, y),
            // On the water where it is drawn: one swims at its surface.
            (x, y) => waterDepthAtPoint((pointX, pointY) => this.seenDepthAt(pointX, pointY, now), x, y),
        );
    }

    /** When the weather pipette last read a cell (ms of the scene), and where (map pixels). */
    private pipetteReadAt = -Infinity;
    private pipettePoint: { x: number; y: number } | undefined;

    /**
     * The weather pipette (Weather/CellProbeNow): while it is on, what goes on in the cell of the ground under the
     * pointer, read again when the pointer goes to another cell and four times a second at most. One cell is read,
     * nothing is sent; off, nothing is read.
     */
    private stepWeatherPipette(pointed: { x: number; y: number } | undefined, now: number): void {
        if (!isWeatherPipetteOn() || !pointed) {
            if (this.pipettePoint) {
                this.pipettePoint = undefined;
                weatherPipetteCellStore.set(undefined);
            }
            return;
        }
        const date = this.nightManager?.serverDate();
        if (!date) return;
        // On the ground drawn there: down in a hollow when the relief is seen in 3/4, as the figures under the clock.
        const point = this.groundPointUnder(pointed);
        const last = this.pipettePoint;
        const sameCell =
            last !== undefined &&
            Math.floor(last.x / TERRAIN_CELL) === Math.floor(point.x / TERRAIN_CELL) &&
            Math.floor(last.y / TERRAIN_CELL) === Math.floor(point.y / TERRAIN_CELL);
        if (sameCell && now - this.pipetteReadAt < 250) return;
        this.pipettePoint = point;
        this.pipetteReadAt = now;
        const wam = this.getGameMap().getWamFile()?.getWam();
        weatherPipetteCellStore.set(
            cellProbeNow(
                {
                    terrain: wam?.terrain,
                    settings: wam?.settings,
                    water: this.terrainWater,
                    meadow: this.meadow,
                    outdoorAt: (x, y) => this.getOutdoorGrid()?.isOutdoorAt(x, y) !== false,
                    iceUnderfoot: (at) => iceUnderfoot(this, at),
                    sunElevation: this.nightManager?.sunPosition()?.elevation,
                    poolAt: (at) => {
                        const pool = poolStyleUnder(wam, at);
                        return pool ? { hot: pool.hot === true } : undefined;
                    },
                    floorsOver: (seen) => this.floorSpike?.floorsOver(seen.x, seen.y) ?? [],
                    shadedAt: (at) => this.skyShadowManager?.shadedAt(at.x, at.y),
                    coldMasses: () => this.coldMasses(),
                    imagePoolAt: (at) =>
                        imagePoolsOf(this.gameMapFrontWrapper.getEntitiesManager().getEntities().values()).some(
                            (pool) =>
                                at.x >= pool.x &&
                                at.y >= pool.y &&
                                at.x < pool.x + pool.width &&
                                at.y < pool.y + pool.height,
                        ),
                },
                point,
                date,
                pointed,
            ),
        );
    }

    /**
     * The point of the map the eye sees under a point of the screen: itself, unless the relief is shown in 3/4. Then
     * the ground or the water drawn there (the rule of the shaders, ObliqueView.seenPoint): where a catastrophe aimed
     * with the pointer falls. (A click to walk goes to the ground instead, at the foot of a face: groundPointUnder.)
     */
    public seenPointUnder(point: { x: number; y: number }): { x: number; y: number } {
        if (!this.pixelReliefShown()) return point;
        const terrain = this.reliefSeen();
        const now = this.time.now;
        const surfaceAt = (y: number): number =>
            heightAtPoint(terrain, point.x, y) +
            Math.max(
                0,
                waterDepthAtPoint((pointX, pointY) => this.seenDepthAt(pointX, pointY, now), point.x, y),
            );
        return { x: point.x, y: seenPoint(surfaceAt, point.y, TERRAIN_CELL).y };
    }

    /** The season the relief in 3/4 is drawn in: the one of the theme this person forces (as their trees), else the map's. */
    private pixelGroundSeason(): Season | undefined {
        return forcedTreeSeason(this.getSeasonalTheme()) ?? this.getGroundSeason();
    }

    /** The relief in 3/4 and what goes with it: its blocks and their workers, the glints of its water, its footprints. */
    private createPixelRelief(): PixelRelief {
        const painters = createBlockPaintPool();
        const tiles = new ReliefTiles(this, {
            // Flat under what is built, as for the shaders.
            relief: () => this.reliefSeen(),
            water: this.terrainWater,
            meadow: this.meadow,
            season: () => this.pixelGroundSeason(),
            // The snow that fell, as the other engine shows it: none of the server's for who follows a weather of
            // their own (GroundSource).
            // All white for who chose the winter theme.
            snowCoverAt: (x, y) => (this.winterThemeShown() ? 1 : this.getSnowCoverAt(x, y)),
            groundVersion: () => (meadowHoldsSnow() ? 1 : 0) + (this.winterThemeShown() ? 2 : 0),
            layout: this.mapGroundLayout,
            snowLineSeason: () => this.getGroundSeason(),
            // Far out, the blocks are drawn no finer than the screen shows them.
            screenScale: () => this.cameras.main.zoom,
            // The rest of the map is drawn ahead, coarse: zooming out shows the ground at once.
            mapSize: () => ({ width: this.Map.widthInPixels, height: this.Map.heightInPixels }),
            // Painted by workers, off the thread of the game.
            painters,
        });
        const glints = new WaterGlints(this, {
            waterAt: (x, y) => this.terrainWater.depthAt(x, y, this.time.now),
            dropAt: (x, y) => this.surfaceDropAt(x, y),
            hiddenAt: (x, y) => this.hiddenOnWater(x, y),
            season: () => this.pixelGroundSeason(),
            reducedMotion: () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
            shown: () => this.pixelBlocksShown(),
        });
        const footprints = new GroundFootprints(
            this,
            (x, y) => footprintSurface(tiles.coverAt(x, y, this.time.now)),
            // As low as the ground is drawn.
            (x, y) => (this.pixelBlocksShown() ? shiftAt(this.reliefSeen(), x, y) : 0),
            (x, y) => this.terrainWater.isBridgeAt(x, y),
        );
        let hidden = false;
        return {
            tiles,
            setHidden: (next) => {
                hidden = next;
                tiles.setHidden(next);
                // The footprints of the terrain: none shown, none laid, while the relief is not seen in 3/4.
                footprints.setVisible(!next);
            },
            update: (now) => {
                if (!hidden) this.mapGroundLayout?.refresh(now);
                tiles.update(now);
                glints.update(now);
                if (footprints.update(now, hidden ? [] : this.seasonalWalkers())) this.markDirty();
            },
            destroy: () => {
                footprints.destroy();
                glints.destroy();
                tiles.destroy();
                painters?.destroy();
                this.markDirty();
            },
        };
    }

    /** Whether a point of the map (pixels) is in or near an open drain: the current carries no avatar there. */
    /**
     * The ice that cracks and gives way under the avatar, and the holes open in it (IceBreaks.ts): on the ice of the
     * server a hole stays open while the server keeps no ice there.
     */
    private readonly iceBreaks = new IceBreaks(() =>
        followsServerGround() ? (x, y) => this.meadow.iceAtPoint(x, y) : undefined,
    );
    /** The cracks and holes last given to the water shader: drawn again only when they change. */
    private shownIceBreaks = "";

    public getIceBreaks(): IceBreaks {
        return this.iceBreaks;
    }

    /**
     * The ice under the avatar, once an image: thin ice cracks under them, then gives way (the room is told when it
     * is the ice of the server, the same for everyone); the water shader draws the cracks and the holes.
     */
    private stepIceBreaks(now: number): void {
        const foot = { x: this.CurrentPlayer.x, y: this.CurrentPlayer.y + BODY_CENTER_OFFSET_Y };
        const pool = getFrozenPoolRectangles(this).find((rectangle) => isPointInWater([rectangle], foot));
        const thin = pool ? poolIceState(this, pool) === "thin" : iceUnderfoot(this, foot) === "thin";
        const wasActive = this.iceBreaks.active();
        const broken = this.iceBreaks.step(now, foot, thin);
        if (broken && followsServerGround()) {
            this.connection?.emitLaunchCatastrophe(CatastropheKind.CATASTROPHE_ICE_BREAK, broken.x, broken.y, 1);
        }
        const active = this.iceBreaks.active();
        if (active || wasActive) {
            // A hole of the ice of the server may stay open for hours, still: the scene is drawn again only when the
            // cracks or the holes change, not at every image.
            const shown = this.iceBreaks.shown(now);
            const key = shown.map((piece) => `${piece.x},${piece.y},${piece.phase.toFixed(3)}`).join(";");
            if (key !== this.shownIceBreaks) {
                this.shownIceBreaks = key;
                this.terrainView?.setIceBreaks(shown);
                this.markDirty();
            }
        }
    }

    /** Whether the water of the relief is frozen there for this player (FrozenWater.ts): skated on, not swum in. */
    public isFrozenWaterAt(x: number, y: number): boolean {
        return isOnFrozenWater(this, { x, y });
    }

    /** Whether a pool of the ground is frozen for this player (FrozenWater.ts): its water is no water then. */
    public isPoolFrozen(pool: { x: number; y: number; width: number; height: number; entityId?: string }): boolean {
        return isPoolFrozen(this, pool);
    }

    /** Whether the water of this object (a pool) is frozen for this player: one walks onto its ice. */
    public isPoolEntityFrozen(entityId: string): boolean {
        return getFrozenPoolRectangles(this).some((pool) => pool.entityId === entityId);
    }

    /**
     * The masses of cold air lying on the map now (the cold snap of the catastrophes), as the server told them, those
     * let go warmed as the server warms them: what reads the air of a point gives them to coldAirOver. None while no
     * cold air lies on the map.
     */
    public coldMasses(): ColdMass[] {
        return this.coldView?.masses(this.time.now) ?? [];
    }

    public isDrainCalm(x: number, y: number): boolean {
        return this.drainView?.calms(x, y) ?? false;
    }

    /** The water of the hollows of the relief of the map (lakes), the same for everyone. */
    public getTerrainWater(): TerrainWater {
        return this.terrainWater;
    }

    /** The weather of the map shown now, the same for everyone (without one's own seasonal theme). */
    public getMapWeather(): WeatherType {
        const serverDate = this.nightManager?.serverDate();
        const settings = shownWeatherSettings(this.getGameMap().getWamFile()?.getWam().settings, serverDate);
        const configured = settings?.weather ?? WeatherType.Clear;
        return weatherAtTime(configured, serverDate, settings?.weatherAuto, settings?.weatherLocation);
    }

    /**
     * How much daylight the sky of the map gives at an instant (daylightOf), the same for everyone: the sun of the place
     * of the map (Paris when it has none) and the weather of the map at that instant, its clouds included. Nothing
     * personal: neither the night turned off nor the computer clock, neither the seasonal theme nor the clouds hidden,
     * nor the weather of the city a player follows on their clock. The energy saving of the lamps follows it (LampManager).
     */
    public mapDaylightAt(at: number): number {
        return mapDaylightAt(this.getGameMap().getWamFile()?.getWam().settings, new Date(at));
    }

    /**
     * How the horde of zombies shoves the avatar of this player whose body is at (x, y), px/s, added to what its keys
     * ask for (Player): the walls and the collisions of the map hold it as always; never into deep water.
     */
    public zombiePushAt(x: number, y: number): { x: number; y: number } | undefined {
        const view = this.zombieView;
        if (!view?.active()) return undefined;
        const shove = view.shoveAt(x, y);
        if (shove.x === 0 && shove.y === 0) return undefined;
        const length = Math.sqrt(shove.x * shove.x + shove.y * shove.y);
        // Half a tile ahead: no shove into water an avatar would swim in.
        const aheadX = x + (shove.x / length) * 16;
        const aheadY = y + (shove.y / length) * 16;
        if (this.terrainWater.depthAt(aheadX, aheadY, this.time.now) >= LIFE_DEPTHS_PX.deep) return undefined;
        return shove;
    }

    /**
     * The collisions of the map as this browser walks its avatar by, a byte a tile, the doors open: what the player
     * who sends a horde of zombies sends with it, so that it goes round the furniture and the walls of the map too.
     */
    public zombieCollisions(): { collisions: string; collisionsWidth: number; collisionsHeight: number } {
        return zombieCollisionsOf(
            this.gameMapFrontWrapper.getCollisionGrid({ emitMapChangedEvent: false }),
            doorLeavesOf(this.getGameMap().getWamFile()?.getWam()),
        );
    }

    /**
     * At each image, the horde of zombies of the room: stepped to the time of the server and drawn, and told to the
     * panel once a second. Nothing while there is none.
     */
    /**
     * Shoots a grenade of the launcher from the feet of this player to the pointer, within its range. The server puts
     * it in the horde; at most one a second for a player.
     */
    public fireZombieGrenade(): void {
        if (
            !get(grenadeLauncherEquippedStore) ||
            !this.zombieReceiver?.current() ||
            !this.userInputManager.isControlsEnabled ||
            this.time.now - this.zombieGrenadeShotAt < 1000
        ) {
            return;
        }
        this.zombieGrenadeShotAt = this.time.now;
        const horde = this.zombieReceiver.current()?.id ?? -1;
        if (this.zombieGrenadesShot.horde !== horde) this.zombieGrenadesShot = { horde, shot: 0 };
        this.zombieGrenadesShot.shot++;
        if (this.zombieGrenadesShot.shot >= ZOMBIE_GRENADES_A_PLAYER) grenadeLauncherEquippedStore.set(false);
        const pointer = new Phaser.Math.Vector2();
        this.input.activePointer.positionToCamera(this.cameras.main, pointer);
        const aim = zombieGrenadeAim({
            fromX: this.CurrentPlayer.x,
            fromY: this.CurrentPlayer.y,
            toX: pointer.x,
            toY: pointer.y,
        });
        this.connection?.emitLaunchZombies(
            {
                count: 0,
                minutes: 0,
                heading: 0,
                seed: 0,
                startedAt: 0,
                durationMs: 0,
                dirX: 0,
                dirY: 0,
                anchorX: 0,
                anchorY: 0,
                widthCells: 0,
                heightCells: 0,
                terrain: "",
                terrainHash: 0,
                collisions: "",
                collisionsWidth: 0,
                collisionsHeight: 0,
                anchorStep: 0,
                anchorAt: 0,
                msPerStep: 0,
                avatars: "",
                safeStep: 0,
                grenade: {
                    fromX: Math.round(aim.fromX),
                    fromY: Math.round(aim.fromY),
                    toX: Math.round(aim.toX),
                    toY: Math.round(aim.toY),
                },
            },
            false,
        );
    }

    private updateZombies(time: number, epoch: number | undefined): void {
        const view = this.zombieView;
        if (!view?.active()) return;
        view.update(
            epoch,
            time,
            !isBasicActive(),
            window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
        );
        if (time - this.zombieToldAt < 1000) return;
        this.zombieToldAt = time;
        const walking = view.walking();
        const horde = this.zombieReceiver?.current();
        zombieShownStore.set(
            horde && walking !== undefined && epoch !== undefined
                ? {
                      count: horde.count,
                      durationMs: horde.durationMs,
                      startedAt: horde.startedAt,
                      heading: horde.heading,
                      walking,
                      secondsLeft: Math.max(0, Math.round((horde.startedAt + horde.durationMs - epoch) / 1000)),
                  }
                : undefined,
        );
    }

    /** The wind of the hurricane of the room at a map point now; undefined while none crosses the map. */
    private hurricaneWindAt(x: number, y: number): { speed: number; from: number } | undefined {
        const hurricane = getRoomHurricane();
        const at = hurricane ? this.nightManager?.serverDate()?.getTime() : undefined;
        if (!hurricane || at === undefined) return undefined;
        // The wind of its air where the server simulates it; of its formula otherwise.
        const air = roomHurricaneAir.windAt(hurricane.id, x, y);
        if (air) {
            const wind = windOfAir(air);
            return { speed: wind.windSpeed, from: wind.windFrom };
        }
        const here = hurricaneHere(hurricane, at, x, y);
        // Past half of its fade, as the weather shown (withHurricane).
        if (!here || here.share < 0.5) return undefined;
        return { speed: here.windSpeed, from: here.windFrom };
    }

    /** The map weather as it is shown now, with its wind. */
    private shownWeather(): ReturnType<typeof shownWeatherSettings> {
        return shownWeatherSettings(this.getGameMap().getWamFile()?.getWam().settings, this.nightManager?.serverDate());
    }

    /**
     * The share of the precipitation shown that falls as snow, 0 to 1, from the temperature and the humidity of the
     * air it falls through (precipitationAirNow). Rain while they are not known.
     */
    public getSnowShare(): number {
        return snowShareOf(
            precipitationAirNow(this.getGameMap().getWamFile()?.getWam().settings, this.nightManager?.serverDate()),
        );
    }

    /**
     * How much snow lies on the map for this player, 0 to 1 (the snow the server keeps, see GroundSource): the trees
     * and the ice whiten with it.
     */
    public getMapSnowCoverage(): number {
        return this.winterThemeShown() ? 1 : snowCoverOfMap(this.meadow, this.ownSnowCover());
    }

    /**
     * The cover of the snowiest place of the map for this player, 0 to 1: the snow that fell (GroundSource.snowPeakOfMap)
     * or the snow of its heights.
     */
    public getMapSnowPeak(): number {
        if (this.winterThemeShown()) return 1;
        const fallen = snowPeakOfMap(this.meadow, this.ownSnowCover());
        return Math.max(fallen, snowLinePeak(this.terrainWater.relief(), this.getGroundSeason()));
    }

    /** How white the ground is at a point of the map for this player, 0 to 1: the snow that fell, or that of the heights. */
    public getGroundSnowAt(x: number, y: number): number {
        return groundSnowAt(this.terrainWater.relief(), x, y, {
            fallen: this.getSnowCoverAt(x, y),
            season: this.getGroundSeason(),
            outdoors: this.getOutdoorGrid()?.isOutdoorAt(x, y) ?? true,
        });
    }

    /**
     * Whether this player chose the winter theme: for them alone it snows, and the ground, the trees and what stands
     * outdoors are snowy. A decor: the walk is not slowed, nothing lies on the ground of the map.
     */
    public winterThemeShown(): boolean {
        return this.getSeasonalTheme() === SeasonalTheme.Christmas;
    }

    /** The snow of their own city on the ground of a player who follows one (Frost.ts), 0 to 1; none otherwise. */
    private ownSnowCover(): number {
        return snowCoverOf(waterCycleNow(this.getGameMap().getWamFile()?.getWam().settings).snowMm);
    }

    /** How much the snow that fell whitens the ground at a point of the map for this player, 0 to 1: it slows the walk. */
    public getSnowCoverAt(x: number, y: number): number {
        return snowCoverHere(this.meadow, x, y, {
            cover: this.ownSnowCover(),
            outdoors: this.getOutdoorGrid()?.isOutdoorAt(x, y) ?? true,
        });
    }

    public getGameMap(): GameMap {
        return this.gameMapFrontWrapper.getGameMap();
    }

    public get knockManager(): KnockManager | undefined {
        return this._knockManager;
    }

    public get waveManager(): WaveManager | undefined {
        return this._waveManager;
    }

    /** How many animals the local player tamed: wandering ones (see JungleCompanions) and those of the life. */
    public tamedAnimalCount(): number {
        return (this.gameJungle?.tamedAnimalCount() ?? 0) + this.landTamedCount();
    }

    /** How many lions and tigers of the life of the map follow the local player (see LandCompanions). */
    public landTamedCount(): number {
        return this.landCompanions?.tamedCount ?? 0;
    }

    /** Lets every animal the local player tamed go back to its wandering. */
    public releaseTamedAnimals(): void {
        this.gameJungle?.releaseTamedAnimals();
        this.landCompanions?.releaseAll();
    }

    public get torchManager(): TorchManager | undefined {
        return this._torchManager;
    }

    public get iceShackManager(): IceShackManager | undefined {
        return this._iceShackManager;
    }

    public get fishingManager(): FishingManager | undefined {
        return this._fishingManager;
    }

    public get nerfManager(): NerfManager | undefined {
        return this._nerfManager;
    }

    public get coffeeManager(): CoffeeManager | undefined {
        return this._coffeeManager;
    }

    /** The space of every user connected to the world, once joined. */
    public get worldSpace(): SpaceInterface | undefined {
        return this.allUserSpace;
    }

    public getWanderingCharactersManager(): WanderingCharactersManager | undefined {
        return this.wanderingCharactersManager;
    }

    public getGameMapFrontWrapper(): GameMapFrontWrapper {
        return this.gameMapFrontWrapper;
    }

    public getCameraManager(): CameraManager {
        return this.cameraManager;
    }

    public getRemotePlayersRepository(): RemotePlayersRepository {
        return this.remotePlayersRepository;
    }

    public getMapEditorModeManager(): MapEditorModeManager | undefined {
        return this.mapEditorModeManager;
    }

    public getEntitiesCollectionsManager(): EntitiesCollectionsManager {
        return this.entitiesCollectionsManager;
    }

    public getPathfindingManager(): PathfindingManager {
        return this.pathfindingManager;
    }

    /**
     * The pathfinding manager, fed with the current collisions and walls of the map.
     */
    public getUpToDatePathfindingManager(): PathfindingManager {
        this.pathfindingManager.setCollisionGrid(
            this.gameMapFrontWrapper.getCollisionGrid({ emitMapChangedEvent: false }),
        );
        this.pathfindingManager.setBarriers(this.gameMapFrontWrapper.getWallBarriers());
        this.pathfindingManager.setObstacles(this.gameMapFrontWrapper.getPathObstacles(this.CurrentPlayer));
        return this.pathfindingManager;
    }

    public getPlayerVariablesManager(): PlayerVariablesManager | undefined {
        return this.playerVariablesManager;
    }

    public getActivatablesManager(): ActivatablesManager {
        return this.activatablesManager;
    }

    public getOutlineManager(): OutlineManager {
        return this.outlineManager;
    }

    public getEntityAudioManager(): EntityAudioManager {
        return this.entityAudioManager;
    }

    /**
     * Quickfix for phaser last version breaking the outline on
     * objects and characters
     * TODO: Remove this function after the bug correction on phaser
     */
    public refreshSceneForOutline(): void {
        this.events.once(Phaser.Scenes.Events.POST_UPDATE, () => {
            this.markDirty();
        });
        this.markDirty();
    }

    private loadEntityCollections() {
        const customEntityCollectionUrl = this.getCustomEntityCollectionUrl();
        // The floor and wall catalogs of the map tool are offered in every room, old maps included.
        const collectionUrls = mergeEntityCollectionUrls(
            this.wamFile.entityCollections.map((collection) => collection.url),
            [
                ...(this._room.entityCollectionsUrls ?? []),
                ...MAP_LAYER_CATALOG_URLS,
                new URL("collections/NatureCollection.json", window.location.origin).toString(),
            ],
        );
        const collectionDescriptors: { url: string; type: EntityPrefabType }[] = collectionUrls.map((url) => ({
            url,
            type: "Default",
        }));
        collectionDescriptors.push({ url: customEntityCollectionUrl, type: "Custom" });

        this.entitiesCollectionsManager.loadCollections(collectionDescriptors, this.wamFile.settings?.prefabOverrides);
    }

    private doLoadTMJFile(mapUrlFile: string): void {
        this.load.on("filecomplete-tilemapJSON-" + mapUrlFile, (key: string, type: string, data: unknown) => {
            this.onMapLoad(data).catch((e) => console.error(e));
        });
        this.load.tilemapTiledJSON(mapUrlFile, mapUrlFile);
        // If the map has already been loaded as part of another GameScene, the "on load" event will not be triggered.
        // In this case, we check in the cache to see if the map is here and trigger the event manually.
        if (this.cache.tilemap.exists(mapUrlFile)) {
            const data = this.cache.tilemap.get(mapUrlFile);
            this.onMapLoad(data.data).catch((e) => console.error(e));
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async onMapLoad(data: any): Promise<void> {
        // Triggered when the map is loaded
        // Load tiles attached to the map recursively
        // The map file can be modified by the scripting API and we don't want to tamper the Phaser cache (in case we come back on the map after visiting other maps)
        // So we are doing a deep copy
        this.mapFile = structuredClone(data);

        const exteriorTexture = PropertyUtils.findStringProperty("exteriorTexture", this.mapFile.properties);
        this.exteriorTextureKey =
            exteriorTexture === undefined ? undefined : new URL(exteriorTexture, this.mapUrlFile).toString();
        if (this.exteriorTextureKey !== undefined) {
            this.load.image(this.exteriorTextureKey, this.exteriorTextureKey);
        }

        // Safe parse can take up to 600ms on a 17MB map.
        // TODO: move safeParse to a "map" page and display details of what is going wrong there.
        /*const parseResult = ITiledMap.safeParse(this.mapFile);
        if (!parseResult.success) {
            console.warn("Your map file seems to be invalid. Errors: ", parseResult.error);
        }*/

        const url = this.mapUrlFile.substring(0, this.mapUrlFile.lastIndexOf("/"));
        this.mapFile.tilesets.forEach((tileset) => {
            if ("source" in tileset) {
                throw new Error(
                    `Tilesets must be embedded in a map. The tileset "${tileset.source}" must be embedded in the Tiled map "${this.mapUrlFile}".`,
                );
            }
            if (typeof tileset.name === "undefined" || !("image" in tileset)) {
                console.warn("Don't know how to handle tileset ", tileset);
                return;
            }
            //TODO strategy to add access token
            if (tileset.image.includes(".svg")) {
                this.load.svg(`${url}/${tileset.image}`, `${url}/${tileset.image}`, {
                    width: tileset.imagewidth,
                    height: tileset.imageheight,
                });
            } else {
                this.load.image(`${url}/${tileset.image}`, `${url}/${tileset.image}`);
            }
        });

        // Scan the object layers for objects to load and load them.
        this.objectsByType = new Map<string, ITiledMapObject[]>();

        for (const layer of this.mapFile.layers) {
            if (layer.type === "objectgroup") {
                for (const object of layer.objects) {
                    let objectsOfType: ITiledMapObject[] | undefined;
                    if (object.class) {
                        if (!this.objectsByType.has(object.class)) {
                            objectsOfType = new Array<ITiledMapObject>();
                        } else {
                            objectsOfType = this.objectsByType.get(object.class);
                            if (objectsOfType === undefined) {
                                throw new Error("Unexpected object type not found");
                            }
                        }
                        objectsOfType.push(object);
                        this.objectsByType.set(object.class, objectsOfType);
                    }
                }
            }
        }

        // TODO: remove support for these objects. They have been superseded by variables and scripting and entities for a long time.
        for (const [itemType, objectsOfType] of this.objectsByType) {
            // FIXME: we would ideally need for the loader to WAIT for the import to be performed, which means writing our own loader plugin.

            let itemFactory: ItemFactoryInterface;

            switch (itemType) {
                case "computer": {
                    //eslint-disable-next-line no-await-in-loop
                    const module = await import("@wa/front/Phaser/Items/Computer/computer");
                    itemFactory = module.default;
                    break;
                }
                default:
                    continue;
                //throw new Error('Unsupported object type: "'+ itemType +'"');
            }

            itemFactory.preload(this.load);
            this.load.start(); // Let's manually start the loader because the import might be over AFTER the loading ends.

            // Note: the code below is probably wrong, but not used anymore.
            // eslint-disable-next-line listeners/no-missing-remove-event-listener,listeners/no-inline-function-event-listener
            this.load.on("complete", () => {
                // FIXME: the factory might fail because the resources might not be loaded yet...
                // We would need to add a loader ended event in addition to the createPromise
                this.createPromiseDeferred.promise
                    .then(async () => {
                        itemFactory.create(this);

                        const roomJoinedAnswer = await this.roomJoinedPromiseDeferred.promise;

                        for (const object of objectsOfType) {
                            // TODO: we should pass here a factory to create sprites (maybe?)

                            // Do we have a state for this object?
                            const state = roomJoinedAnswer.items[object.id];

                            const actionableItem = itemFactory.factory(this, object, state);
                            this.actionableItems.set(actionableItem.getId(), actionableItem);
                        }
                    })
                    .catch((e) => console.error(e));
            });
        }
    }

    private initUserPermissionsOnEntity() {
        if (!this.connection) {
            throw new Error("This should never happen");
        }
        const userCanEdit = this.connection.userCanEdit;
        const gameMapAreas = this.getGameMap().getWamFile()?.getGameMapAreas();
        if (gameMapAreas !== undefined) {
            this.entityPermissions = new EntityPermissions(
                gameMapAreas,
                this.connection.getAllTags() ?? [],
                userCanEdit,
                localUserStore.getLocalUser()?.uuid,
            );
            this.entityPermissionsDeferred.resolve(this.entityPermissions);
        }
    }

    /**
     * Whether the current user may stand at this position, i.e. it is not inside an area they do not have access to.
     * Like AreaPermissions, users allowed to edit the map may go anywhere. Unlike the areas manager, this works as soon
     * as the pusher answered, which is when the start position is chosen.
     */
    public isPositionAllowedForCurrentUser(position: PositionInterface): boolean {
        const gameMapAreas = this.getGameMap().getWamFile()?.getGameMapAreas();
        if (!this.connection || this.connection.userCanEdit || !gameMapAreas) {
            return true;
        }
        return gameMapAreas.getForbiddenAreasOnPosition(position, this.connection.getAllTags()).length === 0;
    }

    private initializeAreaManager() {
        if (!this.connection) {
            throw new Error("This should never happen");
        }
        const userCanEdit = this.connection.userCanEdit;
        const userConnectedTags = this.connection.getAllTags() ?? [];
        this.gameMapFrontWrapper.initializeAreaManager(userConnectedTags, userCanEdit);
    }

    private hide(hide = true): void {
        this.scene.setVisible(!hide);
        iframeListener?.hideIFrames(hide);
    }

    /**
     * Initializes the connection to Pusher.
     */
    private connect(): void {
        connectionManager
            .connectToRoomSocket(
                this.roomUrl,
                this.playerName,
                gameManager.getCharacterTextureIds() ?? [],
                gameManager.getCompanionTextureId(),
                this.getGameMap().getWamFile()?.getLastCommandId(),
            )
            .then(async (onConnect: OnConnectInterface) => {
                this.connection = onConnect.connection;

                // Subscribed before any await: the admin messages of the login come right after the connection.
                // These streams are completed in the RoomConnection. No need to unsubscribe.
                //eslint-disable-next-line rxjs/no-ignored-subscription, svelte/no-ignored-unsubscribe
                this.connection.sendUserMessageStream.subscribe((message) => this.showUserMessage(message));
                //eslint-disable-next-line rxjs/no-ignored-subscription, svelte/no-ignored-unsubscribe
                this.connection.banUserMessageStream.subscribe((message) => this.ejectedUser(message));

                // The serverDisconnected stream is completed in the RoomConnection. No need to unsubscribe.
                //eslint-disable-next-line rxjs/no-ignored-subscription, svelte/no-ignored-unsubscribe
                this.connection.serverDisconnected.subscribe(() => {
                    showConnectionIssueMessage();
                    console.info("Player disconnected from server. Waiting for pusher ping.");
                    connectionManager
                        .waitForPusherPing()
                        .then(async () => {
                            // A deployment restarts the pusher: load its new build now, in this same interruption,
                            // rather than reconnecting the old page and asking for a refresh a minute later.
                            const loadedVersion = getLoadedBuildVersion();
                            const servedNotes =
                                loadedVersion === undefined ? undefined : await findNewerBuild(loadedVersion);
                            if (servedNotes !== undefined) {
                                console.info("Pusher reachable again with a new build. Reloading the page.");
                                // The reloaded page tells the user what changed.
                                rememberUpdateForReload(getNewReleaseNotes(servedNotes, releaseNotes));
                                window.location.reload();
                                return;
                            }
                            console.info("Pusher reachable again. Reloading scene.");
                            this.cleanupClosingScene();
                            this.createSuccessorGameScene(true, true);
                        })
                        .catch((e) => {
                            console.error(
                                `Error while waiting for Pusher to come back online: ${asError(e).message}`,
                                e,
                            );
                            Sentry.captureException(e);
                            this.handleErrorAndCleanup(
                                e,
                                "CONNECTION_BROKEN",
                                "Unable to reconnect",
                                "Error when trying to reconnect after the connection was lost",
                            );
                            hideConnectionIssueMessage();
                            return;
                        });
                });
                hideConnectionIssueMessage();

                const commandsToApply = onConnect.roomConnectedMessage.editMapCommandsArrayMessage?.editMapCommands;
                if (commandsToApply) {
                    try {
                        await this.mapEditorModeManager?.updateMapToNewest(commandsToApply);
                    } catch (e) {
                        Sentry.captureException(e);
                        console.error("Error while updating map to newest", e);
                    }
                }

                const lastPosition = readLastPlayerPosition(this.roomUrl, localUserStore.getLocalUser()?.uuid);
                const startPosition = computeStartPosition(
                    this.gameMapFrontWrapper,
                    this.mapFile,
                    this.initPosition ?? lastPosition,
                    urlManager.getStartPositionNameFromUrl(),
                    (position) => this.isPositionAllowedForCurrentUser(position),
                );

                this.createCurrentPlayer(startPosition);
                // Back where they were before a reload (a deployment): also on the raised floor they stood on.
                this.floorToRestore =
                    lastPosition?.floorZ !== undefined &&
                    lastPosition.x === startPosition.x &&
                    lastPosition.y === startPosition.y
                        ? lastPosition.floorZ
                        : undefined;
                this.saveCurrentPosition();

                this.activatablesManager = new ActivatablesManager(this.CurrentPlayer);
                this.cameraManager.startFollowPlayer(this.CurrentPlayer, 0);

                this.mapEditorModeManager?.subscribeToRoomConnection(this.connection);

                this.enterLeaveScriptingService = new EnterLeaveScriptingService(this.gameMapFrontWrapper, this);

                this._spaceRegistry = new SpaceRegistry(this.connection);
                this.spaceScriptingBridgeService = new SpaceScriptingBridgeService(this._spaceRegistry);

                videoStreamStore.forward(this._spaceRegistry.videoStreamStore);
                screenShareStreamStore.forward(this._spaceRegistry.screenShareStreamStore);
                raisedHandSectionsStore.forward(this._spaceRegistry.raisedHandSectionsStore);
                mediaSynchronizedSpacesStore.forward(this._spaceRegistry.spacesSynchronizingMedia);
                heardVideoBoxesStore.forward(this._spaceRegistry.heardVideoBoxesStore);
                bubbleListenersStore.forward(this._spaceRegistry.bubbleListenersStore);
                this.bubbleListeningManager = new BubbleListeningManager(this.connection, this._spaceRegistry);

                this.initExtensionModule();

                this.tryOpenMapEditorWithToolEditorParameter();

                playersStore.connectToRoomConnection(this.connection);
                userIsAdminStore.set(this.connection.hasTag("admin"));
                userIsEditorStore.set(this.connection.hasTag("editor"));

                // The userJoinedMessageStream stream is completed in the RoomConnection. No need to unsubscribe.
                //eslint-disable-next-line rxjs/no-ignored-subscription, svelte/no-ignored-unsubscribe
                this.connection.userJoinedMessageStream.subscribe((message) => {
                    this.remotePlayersRepository.addPlayer(message);

                    this.playersEventDispatcher.postMessage({
                        type: "addRemotePlayer",
                        data: {
                            playerId: message.userId,
                            name: message.name,
                            userUuid: message.userUuid,
                            outlineColor: message.outlineColor,
                            availabilityStatus: availabilityStatusToJSON(message.availabilityStatus),
                            position: message.position,
                            variables: message.variables,
                            chatID: message.chatID,
                        },
                    });
                });

                // The userMovedMessageStream stream is completed in the RoomConnection. No need to unsubscribe.
                //eslint-disable-next-line rxjs/no-ignored-subscription, svelte/no-ignored-unsubscribe
                this.connection.userMovedMessageStream.subscribe((message) => {
                    this.remotePlayersRepository.movePlayer(message);
                    const position = message.position;
                    if (position === undefined) {
                        throw new Error("Position missing from UserMovedMessage");
                    }

                    const messageUserMoved: MessageUserMovedInterface = {
                        userId: message.userId,
                        position: position,
                    };

                    this.updatePlayerPosition(messageUserMoved);
                });

                // The userLeftMessageStream stream is completed in the RoomConnection. No need to unsubscribe.
                //eslint-disable-next-line rxjs/no-ignored-subscription, svelte/no-ignored-unsubscribe
                this.connection.userLeftMessageStream.subscribe((message) => {
                    this.remotePlayersRepository.removePlayer(message.userId);
                    this.playersEventDispatcher.postMessage({
                        type: "removeRemotePlayer",
                        data: message.userId,
                    });
                });

                // The refreshRoomMessageStream stream is completed in the RoomConnection. No need to unsubscribe.
                //eslint-disable-next-line rxjs/no-ignored-subscription, svelte/no-ignored-unsubscribe
                this.connection.refreshRoomMessageStream.subscribe((message) => {
                    refreshPromptStore.set({
                        timeToRefresh: message.timeToRefresh,
                    });
                });

                // The deleteMapMessageStream stream is completed in the RoomConnection. No need to unsubscribe.
                //eslint-disable-next-line rxjs/no-ignored-subscription, svelte/no-ignored-unsubscribe
                this.connection.deleteMapMessageStream.subscribe(() => {
                    mapDeletedPromptStore.set(true);
                });

                // The playerDetailsUpdatedMessageStream stream is completed in the RoomConnection. No need to unsubscribe.
                //eslint-disable-next-line rxjs/no-ignored-subscription, svelte/no-ignored-unsubscribe
                this.connection.playerDetailsUpdatedMessageStream.subscribe((message) => {
                    // Is this message for me (exceptionally, we can use this stream to send messages to users
                    // who share the same UUID as us)
                    if (message.userId === this.connection?.getUserId() && message.details?.setVariable) {
                        this.playerVariablesManager.updateVariable(message.details?.setVariable);
                        return;
                    }

                    this.remotePlayersRepository.updatePlayer(message);
                });

                // The groupUpdateMessageStream stream is completed in the RoomConnection. No need to unsubscribe.
                //eslint-disable-next-line rxjs/no-ignored-subscription, svelte/no-ignored-unsubscribe
                this.connection.groupUpdateMessageStream.subscribe(
                    (groupPositionMessage: GroupCreatedUpdatedMessageInterface) => {
                        this.shareGroupPosition(groupPositionMessage);
                    },
                );

                // The groupDeleteMessageStream stream is completed in the RoomConnection. No need to unsubscribe.
                //eslint-disable-next-line rxjs/no-ignored-subscription, svelte/no-ignored-unsubscribe
                this.connection.groupDeleteMessageStream.subscribe((message) => {
                    try {
                        this.deleteGroup(message.groupId);
                    } catch (e) {
                        console.error(e);
                    }
                });

                // The itemEventMessageStream stream is completed in the RoomConnection. No need to unsubscribe.
                //eslint-disable-next-line rxjs/no-ignored-subscription, svelte/no-ignored-unsubscribe
                this.connection.itemEventMessageStream.subscribe((message) => {
                    const item = this.actionableItems.get(message.itemId);
                    if (item === undefined) {
                        console.warn(
                            'Received an event about object "' +
                                message.itemId +
                                '" but cannot find this item on the map.',
                        );
                        return;
                    }
                    item.fire(message.event, message.state, message.parameters);
                });

                // The groupUsersUpdateMessageStream stream is completed in the RoomConnection. No need to unsubscribe.
                //eslint-disable-next-line rxjs/no-ignored-subscription, svelte/no-ignored-unsubscribe
                this.connection.groupUsersUpdateMessageStream.subscribe((message) => {
                    const userId = this.connection?.getUserId();
                    if (userId && message.userIds.includes(userId)) {
                        this.currentPlayerGroupId = message.groupId;
                        currentPlayerGroupIdStore.set(message.groupId);
                    } else if (this.currentPlayerGroupId === message.groupId) {
                        this.currentPlayerGroupId = undefined;
                        currentPlayerGroupIdStore.set(undefined);
                        currentPlayerGroupLockStateStore.set(undefined);
                    }

                    this.pendingEvents.enqueue({
                        type: "GroupUsersUpdatedEvent",
                        event: message,
                    });
                });

                // The worldFullMessageStream stream is completed in the RoomConnection. No need to unsubscribe.

                this.messageSubscription = this.connection.worldFullMessageStream.subscribe((message) => {
                    this.showWorldFullError(message);
                });

                batchGetUserMediaStore.startBatch();
                mediaManager.enableMyCamera();
                mediaManager.enableMyMicrophone();
                batchGetUserMediaStore.commitChanges();

                // Set up manager of audio streams received by the scripting API (useful for bots)

                this.scriptingVideoManager = new ScriptingVideoManager();

                this._sayManager = new SayManager(this.connection, this.CurrentPlayer);

                this.CurrentPlayer.on(hasMovedEventName, (event: HasPlayerMovedInterface) => {
                    this.handleCurrentPlayerHasMovedEvent(event);
                });

                // Set up events manager
                this.scriptingEventsManager = new ScriptingEventsManager(this.connection);

                // Set up follow manager
                this.followManager = new FollowManager(this.connection, this.remotePlayersRepository);

                this.inviteManager = new InviteManager(this.connection);

                // Set up locate manager
                this.locateManager = new LocateManager(this, this.cameraManager, this.connection);

                // The errorMessageStream is completed in the RoomConnection. No need to unsubscribe.

                // this.connection.errorMessageStream.subscribe((errorMessage) => {
                //     console.error("An error occurred server side: " + errorMessage.message);
                //     //warningMessageStore.addWarningMessage(errorMessage.message);
                // });

                this.connectionAnswerPromiseDeferred.resolve();
                // Analyze tags to find if we are admin. If yes, show console.

                const error = get(errorScreenStore);
                if (error && error?.type === "reconnecting") errorScreenStore.delete();
                //this.scene.stop(ReconnectingSceneName);

                this.landingAreas =
                    this.getGameMap().getWamFile()?.getGameMapAreas().getAreasOnPosition({
                        x: this.CurrentPlayer.x,
                        y: this.CurrentPlayer.y,
                    }) || [];

                this.gameMapFrontWrapper.setPosition(
                    this.CurrentPlayer.x,
                    this.CurrentPlayer.y,
                    this.CurrentPlayer.getFloorZ(),
                );

                this.emoteManager = new EmoteManager(this, this.connection);
                this.duckRushManager = new DuckRushManager(this);
                // Its listeners are on the scene: never two of them at once. The jungle gives it its animals.
                this.gameJungle?.destroy();
                this.wanderingCharactersManager?.destroy();
                this.wanderingCharactersManager = new WanderingCharactersManager(this);
                this.gameJungle = new GameJungle(this, this.wanderingCharactersManager);
                // One veil at a time.
                this.nightManager?.destroy();
                this.nightManager = new NightManager(this, () => this.skyWeatherFactor());
                this.perfMonitor?.destroy();
                this.perfMonitor = new PerfMonitor(this.events, this.game.events);
                // The highlight of an area, dropped while inside it: the rest of the map is lit again at once.
                this.unsubscribeAreaHighlight?.();
                this.unsubscribeAreaHighlight = areaHighlightHiddenStore.subscribe((hidden) => {
                    if (hidden) this._focusFx?.hide();
                });
                // The objects of the map that are lamps; `?lampDemo` lights them with a made-up beat. One set at a time.
                this.lampManager?.destroy();
                const lampDemo = parseLampDemo(window.location.search);
                this.lampManager = new LampManager(this, { demo: lampDemo });
                // The switches of the map: what a press does, and the small light each one carries.
                this.gameSwitches?.destroy();
                this.gameSwitches = new GameSwitches(this);
                this.weatherManager?.destroy();
                this.skateboardSounds?.destroy();
                this.airplaneSounds?.destroy();
                this.outdoorTracker = new OutdoorTracker(
                    () =>
                        Array.from(this.gameMapFrontWrapper.getEntitiesManager().getEntities().values(), (entity) =>
                            entityOutdoorRect(entity, (imagePath) =>
                                this.textures.exists(imagePath) ? this.textures.getFrame(imagePath) : undefined,
                            ),
                        ),
                    () => {
                        const map = this.gameMapFrontWrapper.getMap();
                        return {
                            width: (map.width ?? 0) * (map.tilewidth ?? 0),
                            height: (map.height ?? 0) * (map.tileheight ?? 0),
                        };
                    },
                );
                this.wallFade?.destroy();
                this.wallFade = new WallFade(
                    () => this.mapLayerWallEntities(),
                    () => this.getOutdoorGrid(),
                    // The feet, as the torch reads the outdoors. On a raised floor or a stair the avatar is in no room of
                    // the ground and behind none of its walls: they all stay opaque under it.
                    () =>
                        this.CurrentPlayer.getFloorZ() > 0
                            ? undefined
                            : { x: this.CurrentPlayer.x, y: this.CurrentPlayer.y + CHARACTER_BODY_OFFSET_Y },
                    () => this.mapEditorModeManager?.isActive() ?? false,
                    () => this.markDirty(),
                );
                this.fadedWallFloor?.destroy();
                this.fadedWallFloor = new FadedWallFloorView(
                    this,
                    () => this.mapLayerGroundFloors(),
                    () => this.markDirty(),
                );
                this.weatherManager = new WeatherManager(this, {
                    outdoorGrid: () => this.getOutdoorGrid(),
                    raisedCover: () => this.raisedWeatherCover(),
                    // Seen from far the fog passes over the buildings, never over the avatar's room (at its feet).
                    avatarRoom: () => {
                        const player = this.CurrentPlayer;
                        return player
                            ? this.getOutdoorGrid()?.roomAt(player.x, player.y + CHARACTER_BODY_OFFSET_Y)
                            : undefined;
                    },
                    seasonalTheme: () => this.getSeasonalTheme(),
                    snowShare: () => this.getSnowShare(),
                    precipitationAir: () =>
                        precipitationAirNow(
                            this.getGameMap().getWamFile()?.getWam().settings,
                            this.nightManager?.serverDate(),
                        ),
                });
                // The ground outdoors in pixel art, its relief and the water of its hollows: the soils, the meadow, the
                // grass tiles of the map and the snow of the winter, in the season of the theme.
                const exterior = PropertyUtils.findStringProperty(
                    "exteriorTexture",
                    this.getGameMap().getMap().properties,
                );
                const exteriorIsGrass = GRASS_NAME.test(exterior ?? "");
                this.mapGroundLayout = new MapGroundLayout({
                    grid: () => this.getOutdoorGrid(),
                    gridVersion: () => this.getOutdoorVersion(),
                    wam: () => this.getGameMap().getWamFile()?.getWam(),
                    isGrassTile: (x, y) => mapTileIsGrass(this.Map, exteriorIsGrass, x, y),
                    mapSize: () => ({
                        width: this.Map.width * this.Map.tileWidth,
                        height: this.Map.height * this.Map.tileHeight,
                    }),
                });
                // The ground, the relief and the water of its hollows, flat: unless the relief is shown in 3/4.
                this.terrainView?.destroy();
                this.terrainView = new TerrainView(
                    this,
                    this.terrainWater,
                    undefined,
                    this.meadow,
                    () => this.getGroundSeason(),
                    () => {
                        const weather = this.shownWeather();
                        return weather ? { speed: weather.windSpeed, from: weather.windFrom } : undefined;
                    },
                    () => this.pixelBlocksShown(),
                    () => this.groundEngine() === "oblique",
                    () => this.winterThemeShown(),
                    {
                        terrain: () => this.reliefSeen(),
                        isFlatAt: (x, y) => this.seenRelief?.isFlatAt(x, y) ?? false,
                    },
                );
                // Under a hurricane, the wind sea takes its wind at each point (seaWindHere): that of its air where the
                // server simulates it.
                this.terrainView.seaHurricaneWith(() => {
                    const hurricane = getRoomHurricane();
                    const sea = seaHurricaneOf(hurricane, this.nightManager?.serverDate());
                    const air = sea ? roomHurricaneAir.seaAir(hurricane?.id) : undefined;
                    return sea && air ? { ...sea, air } : sea;
                });
                // What is built stays flat where the relief is seen in 3/4: paved, indoors, a pool.
                this.seenRelief = new SeenRelief({
                    terrain: () => this.terrainWater.relief(),
                    signature: () => this.builtSignature(),
                    flat: () => this.builtGround(),
                });
                // The relief in 3/4, in pixel art: only for who chose it (nothing of it is made else).
                this.pixelRelief?.destroy();
                this.pixelRelief = new GroundEngines(() => this.createPixelRelief());
                tellPixelBlocksShown(() => this.pixelBlocksShown());
                this.characterDrops?.destroy();
                // The objects standing on the ground follow it too (trees, furniture): see PlacedDrops.
                this.placedDrops?.destroy();
                this.placedDrops = new PlacedDrops<Entity>({
                    things: () => this.gameMapFrontWrapper.getEntitiesManager().getEntities().values(),
                    version: () => this.reliefDrawVersion(),
                    shown: () => this.pixelReliefShown(),
                    dropAt: (x, y) => this.groundDropAt(x, y),
                });
                this.characterDrops = new CharacterDrops(this, () => this.drawnLower());
                // The water seen moving: foam on its current, whirls over the sinks, rings over the sources.
                this.waterFlowView?.destroy();
                this.waterFlowView = new WaterFlowView(this, {
                    water: this.terrainWater,
                    wam: () => this.getGameMap().getWamFile()?.getWam(),
                    view: () => this.cameras.main.worldView,
                    isFrozenAt: (x, y) => isOnFrozenWater(this, { x, y }),
                    dropAt: (x, y) => this.surfaceDropAt(x, y),
                });
                this.frozenPoolsView?.destroy();
                this.frozenPoolsView = new FrozenPoolsView(this);
                // The flows of that water drawn over the map, for whoever asked (apps menu, "Visualisation").
                this.waterFlowOverlay?.destroy();
                this.waterFlowOverlay = new WaterFlowOverlay(this, {
                    water: this.terrainWater,
                    inertia: () => waterHasInertia(this.getGameMap().getWamFile()?.getWam().settings?.water),
                    waves: () => this.getGameMap().getWamFile()?.getWam().settings?.water?.waves,
                    pace: () => this.getGameMap().getWamFile()?.getWam().settings?.water?.flowPace,
                    shown: () => get(waterFlowOverlayStore) && !isBasicActive(),
                    measured: (measured) => {
                        if (get(waterFlowMeasuredStore) !== measured) waterFlowMeasuredStore.set(measured);
                    },
                });
                // The fish and the dolphins of that water.
                this.aquaticLifeView?.destroy();
                this.aquaticLifeView = new AquaticLifeView(
                    this,
                    this.aquaticLife,
                    () => get(aquaticLifeShownStore) && !isBasicActive(),
                    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
                    (x, y) => isOnFrozenWater(this, { x, y }),
                    (x, y) => this.surfaceDropAt(x, y),
                    (x, y) => this.hiddenOnWater(x, y),
                );
                // The gulls over that water: shown and hidden with the fish.
                this.gullLifeView?.destroy();
                this.gullLifeView = new GullLifeView(
                    this,
                    this.gullLife,
                    () => get(aquaticLifeShownStore) && !isBasicActive(),
                    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
                    (x, y) => this.surfaceDropAt(x, y),
                );
                // The antelopes, the lions and the tigers of the land: hidden with the jungle.
                // The lions and the tigers the players tamed follow them.
                this.landCompanions?.destroy();
                this.landTamePrompt ??= new InteractionPrompt(this, "land-tame", () => get(LL).trigger.jungleTame());
                this.landReleasePrompt ??= new InteractionPrompt(this, "land-release", () =>
                    get(LL).trigger.jungleRelease(),
                );
                const tamePrompt = this.landTamePrompt;
                const releasePrompt = this.landReleasePrompt;
                const playerOf = (userId: number): Character | undefined =>
                    userId === joinedUserId(this.connection) ? this.CurrentPlayer : this.MapPlayersByKey.get(userId);
                const companions = new LandCompanions(this.landLife, {
                    localUserId: () => joinedUserId(this.connection),
                    playerFeet: (userId) => {
                        const player = playerOf(userId);
                        return player ? feetOf(player) : undefined;
                    },
                    playerInWater: (userId) => playerOf(userId)?.isInWater() ?? false,
                    // A tamed lion does not fly: left on the ground, it walks back to its master who landed.
                    playerFlying: (userId) => playerOf(userId)?.isFlying() ?? false,
                    groundPath: (from, to) =>
                        this.wanderingCharactersManager?.getWanderMap().findPath(from, to) ?? Promise.resolve([to]),
                    editorOpen: () => get(mapEditorModeStore),
                    playerOnGround: () => this.CurrentPlayer.isNearGround(),
                    shown: () => get(jungleEnabledStore),
                    otherCompanions: () => this.gameJungle?.tamedAnimalCount() ?? 0,
                    tame: (animalId) => this.connection?.emitTameAnimal(animalId),
                    release: (animalId) => this.connection?.emitReleaseAnimals(animalId),
                    showPrompt: (kind, action) => (kind === "tame" ? tamePrompt : releasePrompt).show(action),
                    hidePrompt: () => {
                        tamePrompt.hide();
                        releasePrompt.hide();
                    },
                });
                this.landCompanions = companions;
                this.landLifeView?.destroy();
                this.landLifeView = new LandLifeView(
                    this,
                    this.landLife,
                    () => get(jungleEnabledStore),
                    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
                    (species) => this.gameJungle?.sheetOf(species),
                    (animal, now) => {
                        const pose = companions.poseOf(animal.id, now);
                        if (!pose || pose === "hidden") return pose;
                        // With its master on a raised floor or the deck of a bridge, it passes over the relief as
                        // they do: drawn at its place, not as low as the ground under the deck.
                        const master = animal.owner === undefined ? undefined : playerOf(animal.owner);
                        const onFloor = master !== undefined && !master.isFlying() && master.getFloorZ() >= ON_A_FLOOR;
                        return onFloor ? { ...pose, drop: 0 } : pose;
                    },
                    (x, y) => this.meadow.coverAt(x, y) >= GRAZING_COVER,
                    (x, y) => this.getBridgeElevationAt(x, y),
                    (x, y) => this.groundDropAt(x, y),
                );
                // The shadows of the sun and of the moon, outdoors. One set at a time.
                this.skyShadowManager?.destroy();
                this.skyShadowManager = new SkyShadowManager(this, {
                    light: () => this.nightManager?.skyLight(),
                    entities: () => this.shadowSourceEntities(),
                    outdoorGrid: () => this.getOutdoorGrid(),
                    outdoorVersion: () => this.getOutdoorVersion(),
                    // Each body has its own switch, read with the light (NightManager.skyLight).
                    enabled: () => !get(mapEditorModeStore) && !isBasicActive(),
                    categories: () => this.skyShadowCategories,
                    // The shadows of the trees sway with them, unless turned off by this person.
                    swayVersion: () => (this.skyShadowCategories?.treeSway ? this.treeSway?.version : undefined),
                    treeBend: (id) =>
                        (this.treeSway?.poseOf(id) ?? 0) *
                        (this.gameMapFrontWrapper.getEntitiesManager().getEntities().get(id)?.scaleX ?? 1),
                    // A tree the wind laid down: its shadow falls, lies and grows back with it.
                    treePose: (id) => this.fallenTreePose(id),
                    fallenVersion: () => this.fallenTreeView?.version ?? 0,
                });
                // And under what walks: the silhouette of the avatars, an oval under the animals.
                this.unsubscribeSkyShadowCategories?.();
                this.unsubscribeSkyShadowCategories = skyShadowCategoriesStore.subscribe((categories) => {
                    this.skyShadowCategories = categories;
                });
                this.skyMovingShadows?.destroy();
                this.skyMovingShadows = new SkyMovingShadows(this, {
                    light: () => this.nightManager?.skyLight(),
                    avatars: () => this.shadowAvatars(),
                    animals: () => this.shadowAnimals(),
                    isOutdoorAt: (x, y) => this.getOutdoorGrid()?.isOutdoorAt(x, y) ?? true,
                    categories: () =>
                        this.skyShadowCategories ?? {
                            avatars: true,
                            animals: true,
                            avatarShape: "realistic",
                            animalShape: "oval",
                        },
                    enabled: () => !get(mapEditorModeStore),
                });
                // And the sun and the moon through the windows, with the switches of each body.
                this.skyWindowLightManager?.destroy();
                this.skyWindowLightManager = new SkyWindowLightManager(this, {
                    light: () => this.nightManager?.skyLight(),
                    entities: () => this.shadowSourceEntities(),
                    outdoorGrid: () => this.getOutdoorGrid(),
                    outdoorVersion: () => this.getOutdoorVersion(),
                    enabled: () => !get(mapEditorModeStore) && isEffectShown("windowLight"),
                    // The light of the sky comes in through the doors that are open now.
                    isDoorOpen: (entityId) => this.isDoorOpen(entityId),
                });
                this.treeSway?.destroy();
                this.treePoses?.destroy();
                const treePoses = new TreePoseTextures(this);
                this.treePoses = treePoses;
                this.treeSway = new TreeSway(this, {
                    trees: () => this.swayingTrees(),
                    windSpeed: () => this.shownWeather()?.windSpeed,
                    windFrom: () => this.shownWeather()?.windFrom,
                    // Under a hurricane each tree sways in its own wind: still in the eye.
                    windAt: (x, y) => this.hurricaneWindAt(x, y),
                    poseTexture: (key, pose) => treePoses.key(key, pose),
                    enabled: () =>
                        !get(mapEditorModeStore) && get(weatherEffectsEnabledStore) && isEffectShown("treeSway"),
                });
                // The raised floors: the ones placed on the map, or a trial layout asked by `?palier=`.
                if (!this.floorSpike) {
                    const entitiesManager = this.gameMapFrontWrapper.getEntitiesManager();
                    this.floorSpike = new FloorSpike(
                        this,
                        () => this.CurrentPlayer,
                        new URLSearchParams(window.location.search).get("palier") ?? undefined,
                        () => wallBarriers(readMapLayerEntityStates(entitiesManager)),
                        () => entitiesManager.getEntities().values(),
                        () => {
                            // The level shown in the editor: the one the map tool works on (it follows the pointer
                            // in "auto"); in the other tools the one chosen in the panel, every floor in "auto".
                            const choice = get(mapEditorPlacementLevelStore);
                            const level =
                                choice !== "auto"
                                    ? choice
                                    : get(mapEditorSelectedToolStore) === EditorToolName.MapLayerEditor
                                      ? get(mapLayerLevelStore)
                                      : Number.POSITIVE_INFINITY;
                            return { open: get(mapEditorModeStore), level };
                        },
                        (z) => {
                            // The areas only apply to their floor: a change of floor is a move for them.
                            this.gameMapFrontWrapper.setPosition(this.CurrentPlayer.x, this.CurrentPlayer.y, z);
                            return this.playerVariablesManager?.setVariableFromApp(FLOOR_Z_VARIABLE, z, {
                                public: true,
                                persist: false,
                                scope: "room",
                            });
                        },
                        (levels) => {
                            mapLayerBuiltLevelsStore.set(levels);
                            floorLevelsBuiltStore.set(levels);
                        },
                        () => this.floorOccupants(),
                        (x, y) => this.getOutdoorGrid()?.roomAt(x, y),
                    );
                    if (this.floorToRestore !== undefined) this.floorSpike.restore(this.floorToRestore);
                    this.floorToRestore = undefined;
                }
                this.treeSeasonEffects?.destroy();
                this.treeSeasonEffects = new TreeSeasonEffects(this, {
                    trees: () => this.swayingTrees(),
                    season: () => this.gameMapFrontWrapper.getEntitiesManager().getSeason(),
                    autumnProgress: () =>
                        autumnProgress(this.nightManager?.serverDate() ?? new Date(Number.NaN), this.getMapPlace()),
                    windSpeed: () => this.shownWeather()?.windSpeed,
                    windFrom: () => this.shownWeather()?.windFrom,
                    snowCoverage: () => this.getMapSnowCoverage(),
                    enabled: () => !get(mapEditorModeStore) && get(weatherEffectsEnabledStore) && !isBasicActive(),
                    isOutdoor: (x, y) => this.getOutdoorGrid()?.isOutdoorAt(x, y) ?? true,
                    isWet: (x, y) => isGroundUnderWater(this, this.terrainWater, x, y),
                    view: () => this.cameras.main.worldView,
                });
                this.seasonalThemeManager?.destroy();
                this.seasonalThemeManager = new SeasonalThemeManager(this, {
                    outdoorGrid: () => this.getOutdoorGrid(),
                    outdoorVersion: () => this.getOutdoorVersion(),
                    entities: () => this.gameMapFrontWrapper.getEntitiesManager().getEntities().values(),
                    markDirty: () => this.markDirty(),
                    serverDate: () => this.nightManager?.serverDate(),
                    place: () => this.getMapPlace(),
                    leafConditions: () => {
                        const weather = this.shownWeather();
                        return {
                            windSpeed: weather?.windSpeed,
                            windFrom: weather?.windFrom,
                            progress: autumnProgress(
                                this.nightManager?.serverDate() ?? new Date(Number.NaN),
                                this.getMapPlace(),
                            ),
                        };
                    },
                    // Frozen water takes the leaves and the footprints as the ground does.
                    isWet: (x, y) => isGroundUnderWater(this, this.terrainWater, x, y) && !this.isFrozenWaterAt(x, y),
                    waterVersion: () => this.terrainWater.version(),
                    dropAt: (x, y) => this.groundDropAt(x, y),
                    dropVersion: () => this.reliefDrawVersion(),
                    // No frost is drawn on the blocks of the relief: no footprint on it either (they have their own).
                    frost: () =>
                        this.pixelBlocksShown()
                            ? 0
                            : waterCycleNow(this.getGameMap().getWamFile()?.getWam().settings).frost,
                    // The same for the footprints in the snow: the blocks lay their own.
                    // The snowiest tile, not the mean: the snow of the heights alone gets its prints (snowAt says where).
                    snowCover: () => (this.pixelBlocksShown() ? 0 : this.getMapSnowPeak()),
                    snowAt: (x, y) => this.getGroundSnowAt(x, y),
                });
                // Same: one event subscription and one timer at a time.
                this._knockManager?.destroy();
                this._knockManager = new KnockManager(this);
                this._waveManager?.destroy();
                this._waveManager = new WaveManager(this);
                this._coffeeManager?.destroy();
                this._coffeeManager = new CoffeeManager(this);
                const connection = this.connection;
                this.konamiCodeDetector = new KonamiCodeDetector(() => {
                    this.duckRushManager?.start(connection.getUserId(), () => ({
                        x: this.CurrentPlayer.x,
                        y: this.CurrentPlayer.y,
                    }));
                    connection.emitDuckRush();
                });
                // The duckRushEventMessageStream stream is completed in the RoomConnection. No need to unsubscribe.
                // eslint-disable-next-line rxjs/no-ignored-subscription, svelte/no-ignored-unsubscribe
                this.connection.duckRushEventMessageStream.subscribe(({ actorUserId }) => {
                    this.duckRushManager?.start(actorUserId, () =>
                        this.MapPlayersByKey.get(actorUserId)?.getPosition(),
                    );
                });
                this.entityAudioManager = new EntityAudioManager(this, this.connection);
                this.CurrentPlayer.on(hasMovedEventName, () => this.entityAudioManager.onPlayerMoved());

                const context = audioContextManager.getContext();

                // Whether the context ever ran, not whether it ran just before: two output switches in a row make
                // Chrome report "suspended" several times in a row, and leave the context suspended.
                let hasRun = false;
                const onStateChange = () => {
                    const state = context.state;

                    // Note: some browsers (Vivaldi / Brave) will start in "running" state directly despite
                    // no user activation and this will not stop them from blocking WebRTC sound afterwards.
                    if (state === "suspended") {
                        audioInterruptedStore.setInterrupted(false);
                        const outputSwitch = hasRun ? pendingSinkRequests(context) : undefined;
                        if (outputSwitch) {
                            // Chrome suspends a running context while it switches the audio output, and resumes it
                            // after. Not blocked playback: flagging it sets the SOUND_BLOCKED status, which leaves the
                            // bubble. Resumed here too, in case the switch failed half way.
                            outputSwitch.then(() => context.resume()).catch((e) => console.error(e));
                        } else {
                            // Without the User Activation API (Safari < 16.4), a context that already ran had one.
                            const hasBeenActive =
                                "userActivation" in navigator ? navigator.userActivation.hasBeenActive : hasRun;
                            handleSuspendedAudioContext(context, hasBeenActive, () => {
                                // ??=: a second "suspended" in a row must not replace the registration, or the first
                                // one could never be removed and the status would stay SOUND_BLOCKED until a reload.
                                this.unregisterAudioContextPlaybackRetry ??= audioPlaybackStore.register(() => {
                                    context.resume().catch((e) => console.error(e));
                                });
                            });
                        }
                    } else if (state === "running") {
                        hasRun = true;
                        this.unregisterAudioContextPlaybackRetry?.();
                        this.unregisterAudioContextPlaybackRetry = undefined;
                        audioInterruptedStore.setInterrupted(false);
                        // Calling resume in case we are coming from interrupted (for iOS Safari)
                        context.resume().catch((e) => console.error(e));
                    } else if (state === "interrupted") {
                        this.unregisterAudioContextPlaybackRetry?.();
                        this.unregisterAudioContextPlaybackRetry = undefined;
                        audioInterruptedStore.setInterrupted(true);
                    } else if (state === "closed") {
                        audioInterruptedStore.setInterrupted(false);
                        console.log("AudioContext is closing");
                    }
                };
                // No need to unregister, we have a signal
                // eslint-disable-next-line listeners/no-missing-remove-event-listener
                context.addEventListener("statechange", onStateChange, {
                    signal: this.abortController.signal,
                });
                onStateChange();

                // Get position from UUID only after the connection to the pusher is established
                this.tryMovePlayerWithMoveToUserParameter();
            })
            .catch((e) => {
                Sentry.captureException(e);
                console.error("Error while connecting to pusher", e);
            });
    }

    /**
     * Send the emitJoinRoom message to the server, wait for the answer and initialize all objects depending on the server
     * answer.
     */
    private async joinRoom() {
        if (!this.connection) {
            throw new Error("No connection found when joining room");
        }

        if (gameManager.currentStartedRoom.backgroundColor != undefined) {
            this.cameras.main.setBackgroundColor(gameManager.currentStartedRoom.backgroundColor);
        }

        this.connection.emitJoinRoom(
            this.playerName,
            {
                x: this.CurrentPlayer.x,
                y: this.CurrentPlayer.y,
                direction: PositionMessage_Direction.DOWN,
                moving: false,
                running: false,
            },
            this.getViewport(true),
            get(availabilityStatusStore),
        );

        // TODO: what happens if we never receive the room joined message?
        // TODO: can we turn emitJoinRoom into a query?
        const room = await this.connection.roomJoinedPromise;
        this.hasJoinedRoom = true;

        const allPromises: PromiseLike<void>[] = [];

        // Initialize TURN credentials manager
        iceServersManager.init(this.connection, this.abortController.signal);

        gameManager.setCharacterTextureIds(room.characterTextures.map((texture) => texture.id));
        gameManager.setCompanionTextureId(room?.companionTexture?.id ?? null);

        this._applicationManager = new ApplicationManager(room.applications);

        allPromises.push(
            lazyLoadPlayerCharacterTextures(this.superLoad, room.characterTextures)
                .then((textures) => {
                    this.currentPlayerTexturesResolve(textures);
                })
                .catch((e) => {
                    this.currentPlayerTexturesReject(e);
                }),
        );

        if (room.companionTexture) {
            allPromises.push(
                lazyLoadPlayerCompanionTexture(this.superLoad, room.companionTexture)
                    .then((texture) => {
                        this.currentCompanionTextureResolve(texture);
                    })
                    .catch((e) => {
                        this.currentCompanionTextureReject(e);
                    }),
            );
        }

        // Set up variables manager
        this.sharedVariablesManager = new SharedVariablesManager(
            this.connection,
            this.gameMapFrontWrapper,
            room.variables,
        );

        // Set up area property variables manager
        this.areaPropertyVariablesManager = new AreaPropertyVariablesManager(
            this.connection,
            room.areaPropertyVariables,
        );
        areaPropertyVariablesManagerStore.set(this.areaPropertyVariablesManager);
        this.entityStatesManager?.destroy();
        this.entityStatesManager = new EntityStatesManager(this.connection, room.entityStates);
        // The water of the relief: what the room holds now, then every change.
        this.terrainWater.setTerrain(this.getGameMap().getWamFile()?.getWam().terrain);
        this.terrainWater.setPools(this.getGameMap().getWamFile()?.getWam().settings?.pools);
        if (room.terrainWater) this.receiveTerrainWater(room.terrainWater);
        this.terrainWaterSubscription?.unsubscribe();
        this.terrainWaterSubscription = this.connection.terrainWaterMessageStream.subscribe((message) => {
            this.receiveTerrainWater(message);
        });
        // The conditions the fire of the room goes by: what they are now, then every change.
        this.receiveFireConditions(room.fireConditions);
        this.fireConditionsSubscription?.unsubscribe();
        this.fireConditionsSubscription = this.connection.fireConditionsMessageStream.subscribe((message) => {
            this.receiveFireConditions(message);
        });
        // The meadow of the map: what the room holds now, then every change.
        if (room.meadow) this.receiveMeadow(room.meadow);
        this.meadowSubscription?.unsubscribe();
        this.meadowSubscription = this.connection.meadowMessageStream.subscribe((message) => {
            this.receiveMeadow(message);
        });
        // The fire of the trees: the ones that burn or are charred now, then every change.
        for (const id of this.treeFire.clear()) {
            this.gameMapFrontWrapper?.getEntitiesManager()?.getEntities().get(id)?.showPrefabTexture();
        }
        if (room.treeFire) this.receiveTreeFire(room.treeFire);
        this.treeFireSubscription?.unsubscribe();
        this.treeFireSubscription = this.connection.treeFireMessageStream.subscribe((message) => {
            this.receiveTreeFire(message);
        });
        // The wind of the air of a hurricane crossing the map, as the server simulates it: whole now, then twice a
        // second while it crosses.
        roomHurricaneAir.clear();
        if (room.hurricaneAir) roomHurricaneAir.receive(room.hurricaneAir);
        this.hurricaneAirSubscription?.unsubscribe();
        this.hurricaneAirSubscription = this.connection.hurricaneAirMessageStream.subscribe((message) => {
            roomHurricaneAir.receive(message);
            this.markDirty();
        });
        // The life of that water: the animals of the room now, then all of them every second.
        this.receiveAquaticLife(room.aquaticLife ?? { animals: [], species: [] });
        this.aquaticLifeSubscription?.unsubscribe();
        this.aquaticLifeSubscription = this.connection.aquaticLifeMessageStream.subscribe((message) => {
            this.receiveAquaticLife(message);
        });
        entityStatesManagerStore.set(this.entityStatesManager);
        listeningZoneNamesStore.set(
            new Map(
                [...(this.getGameMap().getWamFile()?.getGameMapAreas().getAreas().values() ?? [])]
                    .filter((area) => area.properties.some((property) => property.type === "listeningZonePropertyData"))
                    .map((area) => [area.id, area.name]),
            ),
        );

        const playerVariables: Map<string, unknown> = room.playerVariables;

        // If the user is not logged, we initialize the variables with variables from the local storage
        if (!localUserStore.isLogged()) {
            if (this._room.group) {
                for (const [key, { isPublic, value }] of localUserStore
                    .getAllUserProperties(this._room.group)
                    .entries()) {
                    if (isPublic) {
                        this.connection?.emitPlayerSetVariable({
                            key,
                            value,
                            persist: false,
                            public: true,
                            scope: "world",
                        });
                    }
                    playerVariables.set(key, value);
                }
            }

            for (const [key, { isPublic, value }] of localUserStore.getAllUserProperties(this._room.id).entries()) {
                if (isPublic) {
                    this.connection?.emitPlayerSetVariable({
                        key,
                        value,
                        persist: false,
                        public: true,
                        scope: "room",
                    });
                }
                playerVariables.set(key, value);
            }
        }
        this.playerVariablesManager = new PlayerVariablesManager(
            this.connection,
            this.playersEventDispatcher,
            playerVariables,
            this._room.id,
            this._room.group ?? undefined,
        );
        this._nerfManager?.destroy();
        this._nerfManager = new NerfManager(this);
        this._torchManager?.destroy();
        this._torchManager = new TorchManager(this);
        this._perceptionManager?.destroy();
        this._perceptionManager = new PerceptionManager(this);
        this._fishingManager?.destroy();
        this._fishingManager = new FishingManager(this, room.fishing);
        // The ice fishing shacks of the room: their smoke goes with the wind of the air of the map, as the snow.
        this._iceShackManager?.destroy();
        this._iceShackManager = new IceShackManager(this, room.iceShacks, () => {
            const weather = this.shownWeather();
            return groundWind(weather?.windFrom, weather?.windSpeed);
        });
        this.catastropheSubscription?.unsubscribe();
        this.meteorView?.destroy();
        const meteorView = new MeteorView(
            this,
            (x, y) => this.terrainWater.depthAt(x, y, this.time.now) >= METEOR_WET_DEPTH_PX,
            () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
            () => waterHasInertia(this.getGameMap().getWamFile()?.getWam().settings?.water),
            () => this.terrainView?.drawsWaterRings() === true && !this.pixelBlocksShown(),
            (x, y) => this.surfaceDropAt(x, y),
        );
        this.meteorView = meteorView;
        // The flames of the tiles on fire, laid by the wind of the scene.
        this.fireView?.destroy();
        this.fireView = new FireView(
            this,
            this.meadow,
            () => this.shownWeather(),
            () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
            (x, y) => this.groundDropAt(x, y),
        );
        // The flames in the trees on fire, and the embers that fly from them (after FireView: it draws their frames).
        this.treeFireView?.destroy();
        this.treeFireView = new TreeFireView(
            this,
            this.treeFire,
            (id) => this.gameMapFrontWrapper?.getEntitiesManager()?.getEntities().get(id),
            () => this.shownWeather(),
            () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
            // Hidden as the fire on the ground is: its own switch, or Basique.
            () => !get(mapEditorModeStore) && isEffectShown("fire"),
            (x, y) => this.groundDropAt(x, y),
        );
        this.downpourView?.destroy();
        const downpourView = new DownpourView(
            this,
            () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
            // In the cold of the room a downpour falls as snow, for everyone as for the server.
            () =>
                snowShareOf(
                    roomPrecipitationAir(
                        this.getGameMap().getWamFile()?.getWam().settings,
                        this.nightManager?.serverDate(),
                    ),
                ),
            (x, y) => this.surfaceDropAt(x, y),
        );
        this.downpourView = downpourView;
        this.drainView?.destroy();
        const drainView = new DrainView(
            this,
            () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
            (x, y) => this.surfaceDropAt(x, y),
        );
        this.drainView = drainView;
        this.ballView?.destroy();
        const ballView = new BallView(
            this,
            // The ground as the water of the server reads it, and the water it last told.
            (x, y) => ({
                groundPx: heightAt(
                    this.terrainWater.basin(),
                    Math.floor(x / TERRAIN_CELL),
                    Math.floor(y / TERRAIN_CELL),
                ),
                waterPx: this.terrainWater.settledDepthAt(x, y),
            }),
            () => this.terrainWater.version(),
            () => this.connection?.getUserId(),
            () => get(heldBallStore),
            // In 3/4 it is drawn as low as the water it floats on (not what lies under it: it pushes the water away),
            // and at its place over what is built.
            (ball) =>
                this.pixelReliefShown() && !this.seenRelief?.isFlatAt(ball.x, ball.y) ? shiftOfHeight(ball.levelPx) : 0,
        );
        this.ballView = ballView;
        this.coldView?.destroy();
        const coldView = new ColdView(
            this,
            () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
            // A mass let go comes back to the air of the room (sooner in its wind), at the clock of its ice and its
            // snow, as on the server; the frost it lays is the hoar frost of that air, cooled.
            () => {
                const air = roomPrecipitationAir(
                    this.getGameMap().getWamFile()?.getWam().settings,
                    this.nightManager?.serverDate(),
                );
                return air ? { ...air, windSpeed: get(fireConditionsStore)?.windSpeed } : undefined;
            },
            () => freezeThawTimesOf(this.getGameMap().getWamFile()?.getWam().settings?.water),
            (x, y) => this.surfaceDropAt(x, y),
            (lying) => coldLyingStore.set(lying),
        );
        this.coldView = coldView;
        this.fireTorchView?.destroy();
        const fireTorchView = new FireTorchView(
            this,
            () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
            (x, y) => this.surfaceDropAt(x, y),
        );
        this.fireTorchView = fireTorchView;
        this.hurricaneReceiver?.destroy();
        this.hurricaneView?.destroy();
        this.hurricaneDebris?.destroy();
        const hurricaneDebris = new HurricaneDebris(this);
        this.hurricaneDebris = hurricaneDebris;
        this.hurricaneFlood?.destroy();
        const hurricaneFlood = new HurricaneFloodView(this, this.terrainWater, (metres) =>
            hurricaneHighestRiseStore.set(metres),
        );
        this.hurricaneFlood = hurricaneFlood;
        // The hurricane of the room, reduced to the map: its weather (wind, rain) where this player looks takes the
        // place of the weather of the map, and its spiral of clouds that of the clouds of the sky, computed here from
        // it and the time of the server, as the server computes it for its ground.
        const hurricaneView = HurricaneView.create(this);
        this.hurricaneView = hurricaneView;
        const hurricaneReceiver = new HurricaneReceiver(
            () => this.nightManager?.serverDate()?.getTime(),
            (hurricane) => {
                setRoomHurricane(hurricane);
                hurricaneView?.setHurricane(hurricane);
                hurricaneDebris.setHurricane(hurricane);
                hurricaneFlood.setHurricane(hurricane, this.time.now);
                const at = this.nightManager?.serverDate()?.getTime();
                const look = this.cameras.main.midPoint;
                const formula = at === undefined ? undefined : hurricaneHere(hurricane, at, look.x, look.y);
                // Where the server simulates its air, the wind of that air where this player looks.
                const air = hurricane ? roomHurricaneAir.windAt(hurricane.id, look.x, look.y) : undefined;
                const wind = air && windOfAir(air);
                const here =
                    formula && wind ? { ...formula, ...wind, gust: wind.windSpeed * HURRICANE_GUST_FACTOR } : formula;
                hurricaneShownStore.set(hurricane ? { hurricane, here } : undefined);
                this.markDirty();
            },
        );
        this.hurricaneReceiver = hurricaneReceiver;
        // The tsunami of the room: its water comes with the water of the room; the panel says where it is.
        this.tsunamiReceiver?.destroy();
        const tsunamiReceiver = new TsunamiReceiver((tsunami) =>
            tsunamiShownStore.set(
                // The time of the server, or of this browser while it is not known.
                tsunami ? { tsunami, at: this.nightManager?.serverDate()?.getTime() ?? Date.now() } : undefined,
            ),
        );
        this.tsunamiReceiver = tsunamiReceiver;
        // The horde of zombies of the room: its crowd stepped here as on the server, from what it tells.
        this.zombieReceiver?.destroy();
        this.zombieView?.destroy();
        const zombieView = new ZombieView(this, (x, y) => this.groundDropAt(x, y));
        this.zombieView = zombieView;
        const zombieReceiver = new ZombieReceiver((horde) => {
            zombieView.setHorde(horde, this.time.now);
            if (!horde) {
                zombieShownStore.set(undefined);
                // The launcher exists for the horde only.
                grenadeLauncherEquippedStore.set(false);
            }
            this.markDirty();
        });
        this.zombieReceiver = zombieReceiver;
        this.catastropheSubscription = this.connection?.catastropheMessageStream.subscribe((message) => {
            // The water of this player, when it is their own, lives the catastrophes of the room too.
            this.localTerrain.fromCatastrophe(message);
            if (message.kind === CatastropheKind.CATASTROPHE_DOWNPOUR) downpourView.report(message, this.time.now);
            else if (message.kind === CatastropheKind.CATASTROPHE_DRAIN) drainView.report(message, this.time.now);
            else if (message.kind === CatastropheKind.CATASTROPHE_BALL) ballView.report(message, this.time.now);
            else if (message.kind === CatastropheKind.CATASTROPHE_COLD) coldView.report(message, this.time.now);
            else if (message.kind === CatastropheKind.CATASTROPHE_HURRICANE) hurricaneReceiver.report(message);
            else if (message.kind === CatastropheKind.CATASTROPHE_TSUNAMI) tsunamiReceiver.report(message);
            else if (message.kind === CatastropheKind.CATASTROPHE_ZOMBIES) zombieReceiver.report(message);
            else if (message.kind === CatastropheKind.CATASTROPHE_FIRE) fireTorchView.report(message, this.time.now);
            else if (message.kind === CatastropheKind.CATASTROPHE_ICE_BREAK) {
                // The ice another player broke (or ours, told back): the same hole for everyone.
                this.iceBreaks.addHole(message.x, message.y, this.time.now);
            } else meteorView.add(message, this.time.now);
        });
        this.karaokeSpotlight?.destroy();
        this.karaokeSpotlight = new KaraokeSpotlight(this);
        this.CurrentPlayer.setSwimwear(localUserStore.getSwimwear() ?? playerVariables.get(SWIMWEAR_VARIABLE));
        this.CurrentPlayer.setSwimwearColor(localUserStore.getSwimwearColor());

        if (this._spaceRegistry === undefined) {
            throw new Error("Space registry is undefined when joining room");
        }

        let worldUserProvider: WorldUserProvider | undefined;
        this._spaceRegistry
            .joinSpace(
                WORLD_SPACE_NAME,
                FilterType.ALL_USERS,
                ["availabilityStatus", "chatID", "spotifyListening"],
                this.abortController.signal,
            )
            .then((space) => {
                this.allUserSpace = space;
                this.unsubscribers.push(...this.startSpotifyListening(space));
                worldUserProvider = new WorldUserProvider(space);
                this._worldUserCounter.forward(worldUserProvider.userCount);
                return gameManager.getChatConnection();
            })
            .then((chatConnection) => {
                this._chatConnection = chatConnection;
                const connection = this.connection;
                const allUserSpace = this.allUserSpace;

                const userProviders: UserProviderInterface[] = [];

                if (ENABLE_CHAT_DISCONNECTED_LIST && this._room.isChatDisconnectedListEnabled) {
                    if (connection) {
                        userProviders.push(new AdminUserProvider(connection));
                    }
                    userProviders.push(new ChatUserProvider(chatConnection));
                }

                if (allUserSpace && this._room.isChatOnlineListEnabled && worldUserProvider) {
                    userProviders.push(worldUserProvider);
                }

                this._userProviderMergerDeferred.resolve(new UserProviderMerger(userProviders));
            })
            .catch((e) => {
                const errorMessage = "Failed to get chatConnection from gameManager : " + e;
                console.error(errorMessage, e);
                Sentry.captureException(e);
            });

        const connection = this.connection;
        const spaceRegistry = this._spaceRegistry;
        if (!spaceRegistry) {
            throw new Error("_spaceRegistry not yet initialized");
        }

        const createProximityChatRoom = (spaceName: string, displayName: string, kind: ProximityChatRoomKind) =>
            new ProximityChatRoom(
                spaceName,
                displayName,
                kind,
                connection.getSpaceUserId(),
                spaceRegistry,
                iframeListener,
                this.remotePlayersRepository,
                this,
                this.wamFile?.settings,
                connection.getAllTags(),
            );

        this._proximityChatRoomManager = new ProximityChatRoomManager(createProximityChatRoom);
        this._proximityChatRoom = this._proximityChatRoomManager.getOrCreateRoom(
            DEFAULT_PROXIMITY_SPACE_NAME,
            get(LL).chat.proximity(),
            "default",
        );
        this._proximityChatRoomManagerDeferred.resolve(this._proximityChatRoomManager);

        this._proximityChatRoomDeferred.resolve(this._proximityChatRoom);
        this.proximitySpaceManager = new ProximitySpaceManager(this.connection, this._proximityChatRoomManager);

        // Check WebRtc connection
        try {
            checkCoturnServer().catch((err) => {
                console.error("Check coturn server error: ", err);
            });
        } catch (err) {
            console.error("Check coturn server exception: ", err);
        }

        const broadcastService = new BroadcastService(
            this._spaceRegistry,
            this.wamFile?.settings,
            this.connection.getAllTags(),
            this.abortController.signal,
        );
        this._broadcastService = broadcastService;

        const megaphoneSpaceName = WAMSettingsUtils.getMegaphoneUrl(
            this.getGameMap().getWamFile()?.getWam()?.settings,
            new URL(this.roomUrl).host,
            this.roomUrl,
        );
        if (!megaphoneSpaceName) {
            megaphoneSpaceSettingsStore.set(undefined);
        } else {
            megaphoneSpaceSettingsStore.set({
                spaceName: megaphoneSpaceName,
                audienceVideoFeedbackActivated:
                    this.getGameMap().getWamFile()?.getWam()?.settings?.megaphone?.audienceVideoFeedbackActivated ??
                    false,
                canRecord: WAMSettingsUtils.canStartRecordingMegaphone(
                    this.getGameMap().getWamFile()?.getWam()?.settings,
                    this.connection.getAllTags(),
                    localUserStore.isLogged(),
                ),
            });
        }
        megaphoneCanBeUsedStore.set(
            WAMSettingsUtils.canUseMegaphone(
                this.getGameMap().getWamFile()?.getWam()?.settings,
                this.connection.getAllTags(),
            ),
        );

        this.subscribeToStores();

        await Promise.all(allPromises);

        this.roomJoinedPromiseDeferred.resolve(room);
        gameSceneStore.set(this);
    }

    private initExtensionModule() {
        if (this._room.modules) {
            for (const moduleName of this._room.modules) {
                const moduleFactory = findExternalModuleFactory(moduleName);

                if (!moduleFactory) {
                    console.warn(`Unable to find module "${moduleName}" inside external modules`);
                    continue;
                }
                (async () => {
                    const extensionModule = (await moduleFactory()) as { default: ExtensionModule };
                    const defaultExtensionModule = extensionModule.default;
                    // Check if the module is already initialized
                    if (get(extensionModuleStore).find((module) => module.id === defaultExtensionModule.id)) {
                        return;
                    }

                    const connection = this.connection;
                    if (!connection) {
                        throw new Error("Connection is undefined");
                    }

                    const authToken = localUserStore.getAuthToken();
                    if (!authToken) {
                        throw new Error("Auth token is undefined");
                    }

                    defaultExtensionModule.init(this._room.metadata, {
                        workadventureStatusStore: availabilityStatusStore,
                        userAccessToken: authToken,
                        roomId: this.roomUrl,
                        externalModuleMessage: connection.externalModuleMessage,
                        onExtensionModuleStatusChange: ExtensionModuleStatusSynchronization.onStatusChange,
                        calendarEventsStoreUpdate: calendarEventsStore.update,
                        todoListStoreUpdate: todoListsStore.update,
                        openCoWebSite: openCoWebSiteWithoutSource,
                        closeCoWebsite,
                        getOauthRefreshToken: connection.getOauthRefreshToken.bind(this.connection),
                        adminUrl: ADMIN_URL,
                        externalSvelteComponent: externalSvelteComponentService,
                        spaceRegistry: this._spaceRegistry,
                        logoutCallback: () => {
                            connectionManager.logout();
                        },
                        showComponentInChat(component, props?) {
                            navChat.switchToCustomComponent(component, props);
                            chatVisibilityStore.set(true);
                        },
                        openErrorScreen: (error: Error) => {
                            errorScreenStore.setException(error);
                            gameManager.closeGameScene();
                        },
                        onPlayerMovementEnded: this.onPlayerMovementEnded.bind(this),
                    });

                    if (defaultExtensionModule.calendarSynchronised) isCalendarActiveStore.set(true);
                    if (defaultExtensionModule.todoListSynchronized) isTodoListActiveStore.set(true);
                    extensionModuleStore.add(defaultExtensionModule);
                    console.info(`Extension module ${moduleName} initialization finished`);
                })().catch((error) => console.error(error));
            }
        }
    }

    private subscribeToStores(): void {
        if (this.storesSubscribed) {
            throw new Error("subscribeToStores: the stores are already subscribed.");
        }
        this.storesSubscribed = true;
        let previousMute = this.sound.mute;
        let focused = false;
        const stopAudioFocus = karaokeSingerActiveStore.subscribe((singing) => {
            if (singing && !focused) previousMute = this.sound.mute;
            this.sound.mute = singing ? true : previousMute;
            focused = singing;
        });
        this.unsubscribers = [
            ...this.unsubscribers,
            () => {
                stopAudioFocus();
                this.sound.mute = previousMute;
            },
        ];

        // While the map is edited the charred trees show their plain image: drawn again when the editor opens or closes.
        this.unsubscribers.push(mapEditorModeStore.subscribe(() => this.showTreeFireImages(this.treeFire.marked())));
        // Basique stands the trees the wind laid down back up: drawn again when it is turned on or off.
        this.unsubscribers.push(basicActiveStore.subscribe(() => this.showTreeFireImages(this.treeFire.marked())));

        this.unsubscribers.push(
            userIsJitsiDominantSpeakerStore.subscribe((dominantSpeaker) => {
                this.jitsiDominantSpeaker = dominantSpeaker;
                this.tryChangeShowVoiceIndicatorState(this.jitsiDominantSpeaker && this.jitsiParticipantsCount > 1);
            }),
        );

        this.unsubscribers.push(
            jitsiParticipantsCountStore.subscribe((participantsCount) => {
                this.jitsiParticipantsCount = participantsCount;
                this.tryChangeShowVoiceIndicatorState(this.jitsiDominantSpeaker && this.jitsiParticipantsCount > 1);
            }),
        );

        this.unsubscribers.push(
            availabilityStatusStore.subscribe((availabilityStatus) => {
                if (!this.connection) {
                    throw new Error("Connection is undefined");
                }
                this.connection.emitPlayerStatusChange(availabilityStatus);
                this.CurrentPlayer.setAvailabilityStatus(availabilityStatus);
                if (availabilityStatus === AvailabilityStatus.SILENT) {
                    this.CurrentPlayer.toggleTalk(false);
                }
            }),
        );

        this.unsubscribers.push(
            emoteStore.subscribe((emote) => {
                if (emote && get(enableUserInputsStore)) {
                    this.CurrentPlayer?.playEmote(emote.emoji);
                    this.connection?.emitEmoteEvent(emote.emoji);
                    emoteStore.set(null);
                }
            }),
        );

        this.unsubscribers.push(
            isHandRaisedStore.subscribe((raised) => {
                // Reflect the local user's raised hand on their own woka immediately. The state reaches the
                // other participants through the space state (see SpacePeerManager.synchronizeMediaState), which
                // drives both their video tile badge and the indicator above their woka on the map.
                this.CurrentPlayer?.setRaisedHand(raised);
            }),
        );

        // Drive the raised-hand indicator above REMOTE players' wokas from the raised-hands queue of the space state.
        // The store is keyed by numeric player id (derived from each participant's spaceUserId).
        this.unsubscribers.push(
            raisedHandPlayerIdsStore.subscribe((raisedPlayerIds) => {
                for (const playerId of raisedPlayerIds) {
                    if (!this.previousRaisedHandPlayerIds.has(playerId)) {
                        this.setRemotePlayerRaisedHand(playerId, true);
                    }
                }
                for (const playerId of this.previousRaisedHandPlayerIds) {
                    if (!raisedPlayerIds.has(playerId)) {
                        this.setRemotePlayerRaisedHand(playerId, false);
                    }
                }
                this.previousRaisedHandPlayerIds = new Set(raisedPlayerIds);
            }),
        );

        // Automatically lower the hand when leaving the conversation: the raise-hand button is only shown during a
        // meeting, so a hand left raised on leave could otherwise no longer be lowered by the user.
        this.unsubscribers.push(
            isInRemoteConversation.subscribe((inConversation) => {
                if (!inConversation) {
                    requestedHandRaiseState.lowerAll();
                }
            }),
        );
        // A zone whose option says no needs no safety net: the hand is raised per space, so walking into such a
        // zone leaves the hand raised elsewhere (e.g. in the bubble) alone, and a space the hand is up in stays
        // offered by the button so it can still be lowered (see raiseHandSpacesStore).

        this.unsubscribers.push(
            followUsersColorStore.subscribe((color) => {
                if (color !== undefined) {
                    this.CurrentPlayer.setFollowOutlineColor(color);
                    this.connection?.emitPlayerOutlineColor(color);
                } else {
                    this.CurrentPlayer.removeFollowOutlineColor();
                    this.connection?.emitPlayerOutlineColor(null);
                }
            }),
        );

        this.unsubscribers.push(
            highlightedEmbedScreen.subscribe((value) => {
                //this.reposition();
            }),
        );

        this.unsubscribers.push(
            embedScreenLayoutStore.subscribe((layout) => {
                //this.reposition();
            }),
        );

        this.unsubscribers.push(
            mapEditorModeStore.subscribe((isOn) => {
                if (isOn) {
                    this.activatablesManager.deactivateSelectedObject();
                    this.activatablesManager.handlePointerOutActivatableObject();
                    this.activatablesManager.disableSelectingByDistance();
                } else {
                    this.activatablesManager.handlePointerOutActivatableObject();
                    this.activatablesManager.enableSelectingByDistance();
                    // make sure all entities are non-interactive
                    this.gameMapFrontWrapper.getEntitiesManager().makeAllEntitiesNonInteractive();
                    // add interactions back only for activatables
                    this.gameMapFrontWrapper.getEntitiesManager().makeAllEntitiesInteractive(true);
                }
                this.markDirty();
            }),
        );

        this.unsubscribers.push(
            lastNewMediaDeviceDetectedStore.subscribe((newDevices) => {
                // Filtered first: the click handler below picks devices by label from this same list
                const devices = devicesToOffer(newDevices);
                if (devices.length === 0) return;
                const ignoredNewMediaDeviceIds = localUserStore.getIgnoredNewMediaDeviceIds();
                // filter device by name tu avoid multiple notification for the same device
                const devicesToNotify = devices.reduce((devices: MediaDeviceInfo[], currentDevice: MediaDeviceInfo) => {
                    if (ignoredNewMediaDeviceIds.has(currentDevice.deviceId)) {
                        return devices;
                    }
                    if (
                        devices.find((device_) => device_.label == currentDevice.label) != undefined ||
                        get(requestedCameraDeviceIdStore) == currentDevice.deviceId ||
                        get(requestedMicrophoneDeviceIdStore) == currentDevice.deviceId ||
                        get(speakerSelectedStore) == currentDevice.deviceId
                    )
                        return devices;

                    devices.push(currentDevice);
                    return devices;
                }, []);

                for (const device of devicesToNotify) {
                    const id = `${PLAYTEXT_NEW_MEDIA_DEVICE_PREFIX}${device.deviceId}`;
                    this.CurrentPlayer.destroyText(id);
                    this.CurrentPlayer.playText(
                        id,
                        get(LL).camera.webrtc.newDeviceDetected({ device: device.label }),
                        5000,
                        () => {
                            this.CurrentPlayer.destroyText(id);

                            // get all devices with the same label
                            const devicesToUse = devices.filter((device_) => device_.label === device.label);

                            for (const deviceToUse of devicesToUse) {
                                switch (deviceToUse.kind) {
                                    case "videoinput":
                                        requestedCameraDeviceIdStore.set(deviceToUse.deviceId);
                                        localUserStore.setPreferredVideoInputDevice(deviceToUse.deviceId);
                                        break;
                                    // use the new device
                                    case "audioinput":
                                        requestedMicrophoneDeviceIdStore.set(deviceToUse.deviceId);
                                        localUserStore.setPreferredAudioInputDevice(deviceToUse.deviceId);
                                        break;

                                    case "audiooutput":
                                        localUserStore.setSpeakerDeviceId(deviceToUse.deviceId);
                                        speakerSelectedStore.set(deviceToUse.deviceId);
                                        break;
                                    default:
                                        console.warn("Unknown device kind: ", deviceToUse.kind);
                                }
                            }
                        },
                        true,
                        "message",
                        () => {
                            localUserStore.addIgnoredNewMediaDeviceId(device.deviceId);
                            this.CurrentPlayer.destroyText(id);
                        },
                    );
                }
            }),
        );

        const NO_MICROPHONE_SOUND_TOAST_ID = "no-microphone-sound-toast";
        this.unsubscribers.push(
            noMicrophoneSoundWarningVisibleStore.subscribe((show) => {
                if (show) {
                    toastStore.addToast(NoMicrophoneSoundToast, {}, NO_MICROPHONE_SOUND_TOAST_ID);
                } else {
                    toastStore.removeToast(NO_MICROPHONE_SOUND_TOAST_ID);
                }
            }),
        );

        const LOUD_ENVIRONMENT_TOAST_ID = "loud-environment-toast";
        this.unsubscribers.push(
            loudEnvironmentWarningStore.subscribe((show) => {
                if (show) {
                    toastStore.addToast(LoudEnvironmentToast, {}, LOUD_ENVIRONMENT_TOAST_ID);
                } else {
                    toastStore.removeToast(LOUD_ENVIRONMENT_TOAST_ID);
                }
            }),
        );

        this.isLiveStreamingUnsubscriber = this.spaceRegistry.isLiveStreamingAudioStore.subscribe((isStreaming) => {
            if (isStreaming) {
                this.enableVoiceIndicator();
            } else {
                this.disableVoiceIndicator();
            }
        });

        this.shouldPublishScreenShareUnsubscriber = this.spaceRegistry.shouldPublishScreenShareStore.subscribe(
            (shouldPublish) => {
                if (!shouldPublish && get(requestedScreenSharingState)) {
                    requestedScreenSharingState.disableScreenSharing();
                }
            },
        );

        // Subscribe to bubble sound changes
        this.unsubscribers.push(
            bubbleSoundStore.subscribe((soundType) => {
                this.load.audio(`audio-webrtc-in-${soundType}`, `/resources/objects/webrtc-in-${soundType}.mp3`);
                this.load.audio(`audio-webrtc-out-${soundType}`, `/resources/objects/webrtc-out-${soundType}.mp3`);
                this.load.start();
            }),
        );
    }

    private listenToIframeEvents(): void {
        this.iframeSubscriptionList.push(
            iframeListener.openPopupStream.subscribe((openPopupEvent) => {
                let objectLayerSquare: ITiledMapObject;
                const targetObjectData = this.gameMapFrontWrapper.findObject(openPopupEvent.targetObject);
                if (targetObjectData !== undefined) {
                    objectLayerSquare = targetObjectData;
                } else {
                    console.error(
                        "Error while opening a popup. Cannot find an object on the map with name '" +
                            openPopupEvent.targetObject +
                            "'. The first parameter of WA.openPopup() must be the name of a rectangle object in your map.",
                    );
                    return;
                }
                const escapedMessage = HtmlUtils.escapeHtml(openPopupEvent.message);
                let html =
                    '<div id="container" class="relative bg-contrast/80 backdrop-blur pt-4 overflow-hidden rounded-lg text-white" hidden>';
                if (escapedMessage) {
                    html += `<div class="text-xxs text-center px-2">
${escapedMessage}
 </div> `;
                }

                const buttonContainer =
                    '<div class="buttonContainer flex flex-wrap gap-2 bg-contrast py-2 px-2 mt-2"</div>';
                html += buttonContainer;
                let id = 0;
                for (const button of openPopupEvent.buttons) {
                    html += `<div class="flex w-full"><button type="button" class="btn btn-xs hover:bg-contrast-600/50 justify-center w-full pb-4 ${HtmlUtils.escapeHtml(
                        button.className ?? "",
                    )}" id="popup-${openPopupEvent.popupId}-${id}">${HtmlUtils.escapeHtml(button.label)}</button>`;
                    id++;
                }
                html += "</div></div>";
                const domElement = this.add.dom(objectLayerSquare.x, objectLayerSquare.y).createFromHTML(html);

                const container = z.instanceof(HTMLDivElement).parse(domElement.getChildByID("container"));
                container.style.width = objectLayerSquare.width + "px";
                domElement.scale = 0;
                domElement.setClassName("popUpElement");

                setTimeout(() => {
                    container.hidden = false;
                }, 100);

                id = 0;
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                for (const button of openPopupEvent.buttons) {
                    const button = HtmlUtils.getElementByIdOrFail<HTMLButtonElement>(
                        `popup-${openPopupEvent.popupId}-${id}`,
                    );
                    const btnId = id;
                    button.onclick = () => {
                        iframeListener.sendButtonClickedEvent(openPopupEvent.popupId, btnId);
                        // Disable for a short amount of time to let time to the script to remove the popup
                        button.disabled = true;
                        setTimeout(() => {
                            button.disabled = false;
                        }, 100);
                    };
                    id++;
                }
                this.tweens.add({
                    targets: domElement,
                    scale: 1,
                    ease: "EaseOut",
                    duration: 400,
                });

                this.popUpElements.set(openPopupEvent.popupId, domElement);

                // Analytics tracking for popups
                analyticsClient.trackAdminEvent("popup.opened", {
                    targetRectangle: openPopupEvent.targetObject,
                    id: openPopupEvent.popupId,
                });
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.closePopupStream.subscribe((closePopupEvent) => {
                const popUpElement = this.popUpElements.get(closePopupEvent.popupId);
                if (popUpElement === undefined) {
                    console.error(
                        "Could not close popup with ID ",
                        closePopupEvent.popupId,
                        ". Maybe it has already been closed?",
                    );
                }

                this.tweens.add({
                    targets: popUpElement,
                    scale: 0,
                    ease: "EaseOut",
                    duration: 400,
                    onComplete: () => {
                        popUpElement?.destroy();
                        this.popUpElements.delete(closePopupEvent.popupId);
                    },
                });
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.openChatStream.subscribe(() => {
                chatVisibilityStore.set(true);
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.closeChatStream.subscribe(() => {
                chatVisibilityStore.set(false);
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.turnOffMicrophoneStream.subscribe(() => {
                requestedMicrophoneState.disableMicrophone();
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.turnOffWebcamStream.subscribe(() => {
                requestedCameraState.disableWebcam();
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.disableMicrophoneStream.subscribe(() => {
                myMicrophoneBlockedStore.set(true);
                mediaManager.disableMyMicrophone();
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.restoreMicrophoneStream.subscribe(() => {
                myMicrophoneBlockedStore.set(false);
                mediaManager.enableMyMicrophone();
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.disableWebcamStream.subscribe(() => {
                myCameraBlockedStore.set(true);
                mediaManager.disableMyCamera();
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.restoreWebcamStream.subscribe(() => {
                myCameraBlockedStore.set(false);
                mediaManager.enableMyCamera();
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.setStatusStream.subscribe((statusValue) => {
                switch (statusValue) {
                    case "ONLINE":
                        resetAllStatusStoreExcept(null);
                        break;
                    case "BUSY":
                        resetAllStatusStoreExcept(AvailabilityStatus.BUSY);
                        break;
                    case "DO_NOT_DISTURB":
                        resetAllStatusStoreExcept(AvailabilityStatus.DO_NOT_DISTURB);
                        break;
                    case "BACK_IN_A_MOMENT":
                        resetAllStatusStoreExcept(AvailabilityStatus.BACK_IN_A_MOMENT);
                        break;
                    default: {
                        // Exhaustive check: if a new status is added, TypeScript will error here
                        const _exhaustiveCheck: never = statusValue;
                        console.error(`Unhandled status value: ${_exhaustiveCheck}`);
                    }
                }
            }),
        );

        this.iframeSubscriptionList.push(
            // FIXME: aren't we making a weird loop here?
            iframeListener.addPersonnalMessageStream.subscribe((text) => {
                iframeListener.sendUserInputChat(text, undefined);
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.chatMessageStream.subscribe((chatMessage) => {
                this.proximityChatRoomPromise()
                    .then((room) => {
                        switch (chatMessage.options.scope) {
                            case "local": {
                                room.addExternalMessage("local", chatMessage.message, chatMessage.options.author);
                                selectedRoomStore.set(room);
                                chatVisibilityStore.set(true);

                                break;
                            }
                            case "bubble": {
                                room.addExternalMessage("bubble", chatMessage.message);
                                selectedRoomStore.set(room);
                                chatVisibilityStore.set(true);
                            }
                        }
                    })
                    .catch((error) => {
                        console.error("Error while sending proximity chat message", error);
                        Sentry.captureException(error);
                    });
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.startTypingProximityMessageStream.subscribe((sartWriting) => {
                this.proximityChatRoomPromise()
                    .then((room) => {
                        room.addExternalTypingUser(
                            btoa(sartWriting.author ?? "unknow"),
                            sartWriting.author ?? "unknow",
                            null,
                        );
                    })
                    .catch((error) => {
                        console.error("Error while starting typing proximity message", error);
                        Sentry.captureException(error);
                    });
            }),
        );
        this.iframeSubscriptionList.push(
            iframeListener.stopTypingProximityMessageStream.subscribe((stopWriting) => {
                this.proximityChatRoomPromise()
                    .then((room) => {
                        room.removeExternalTypingUser(btoa(stopWriting.author ?? "unknow"));
                    })
                    .catch((error) => {
                        console.error("Error while stopping typing proximity message", error);
                        Sentry.captureException(error);
                    });
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.newChatMessageWritingStatusStream.subscribe((status) => {
                const room = this.getDefaultProximityChatRoom();
                if (status === ChatMessageTypes.userWriting) {
                    room.startTyping().catch((e) => {
                        console.error("Error while sending typing status", e);
                    });
                } else if (status === ChatMessageTypes.userStopWriting) {
                    room.stopTyping().catch((e) => {
                        console.error("Error while sending typing status", e);
                    });
                }
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.disablePlayerControlStream.subscribe((messageEventSource) => {
                if (messageEventSource) {
                    this.userInputManager.disableControls(messageEventSource);
                    this.userInputManager.disableRightClick();
                    iframeListener.onIframeCloseEvent(messageEventSource, () => {
                        this.userInputManager.restoreControls(messageEventSource);
                        this.userInputManager.restoreRightClick();
                    });
                }
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.enablePlayerControlStream.subscribe((messageEventSource) => {
                if (messageEventSource) {
                    this.userInputManager.restoreControls(messageEventSource);
                    this.userInputManager.restoreRightClick();
                }
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.disablePlayerProximityMeetingStream.subscribe(() => {
                mediaManager.disableProximityMeeting();
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.enablePlayerProximityMeetingStream.subscribe(() => {
                mediaManager.enableProximityMeeting();
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.cameraSetStream.subscribe((cameraSetEvent) => {
                const duration = cameraSetEvent.smooth ? (cameraSetEvent.duration ?? 1000) : 0;
                if (cameraSetEvent.lock) {
                    this.cameraManager.enterFocusMode({ ...cameraSetEvent }, undefined, duration);
                } else {
                    this.cameraManager.setPosition({ ...cameraSetEvent }, duration);
                }
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.cameraFollowPlayerStream.subscribe((cameraFollowPlayerEvent) => {
                const duration = cameraFollowPlayerEvent.smooth ? (cameraFollowPlayerEvent.duration ?? 1000) : 0;
                this.cameraManager.leaveFocusMode(this.CurrentPlayer, duration);
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.playSoundStream.subscribe((playSoundEvent) => {
                const url = new URL(playSoundEvent.url, this.mapUrlFile);
                soundManager
                    .playSound(this.load, this.sound, url.toString(), playSoundEvent.config)
                    .catch((e) => console.error(e));
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.stopSoundStream.subscribe((stopSoundEvent) => {
                const url = new URL(stopSoundEvent.url, this.mapUrlFile);
                soundManager.stopSound(this.sound, url.toString());
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.addActionsMenuKeyToRemotePlayerStream.subscribe((data) => {
                this.MapPlayersByKey.get(data.id)?.registerWokaMenuAction({
                    actionName: data.actionKey,
                    callback: () => {
                        iframeListener.sendActionsMenuActionClickedEvent({ actionName: data.actionKey, id: data.id });
                    },
                });
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.removeActionsMenuKeyFromRemotePlayerEvent.subscribe((data) => {
                this.MapPlayersByKey.get(data.id)?.unregisterWokaMenuAction(data.actionKey);
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.trackCameraUpdateStream.subscribe(() => {
                if (!this.firstCameraUpdateSent) {
                    this.cameraManager.on(
                        CameraManagerEvent.CameraUpdate,
                        (data: CameraManagerEventCameraUpdateData) => {
                            const cameraEvent: WasCameraUpdatedEvent = {
                                x: data.x,
                                y: data.y,
                                width: data.width,
                                height: data.height,
                                zoom: data.zoom,
                            };
                            if (
                                this.lastCameraEvent?.x == cameraEvent.x &&
                                this.lastCameraEvent?.y == cameraEvent.y &&
                                this.lastCameraEvent?.width == cameraEvent.width &&
                                this.lastCameraEvent?.height == cameraEvent.height &&
                                this.lastCameraEvent?.zoom == cameraEvent.zoom
                            ) {
                                return;
                            }

                            this.lastCameraEvent = cameraEvent;
                            iframeListener.sendCameraUpdated(cameraEvent);
                            this.firstCameraUpdateSent = true;
                        },
                    );
                }
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.loadSoundStream.subscribe((loadSoundEvent) => {
                const url = new URL(loadSoundEvent.url, this.mapUrlFile);
                soundManager.loadSound(this.load, this.sound, url.toString()).catch((e) => console.error(e));
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.loadPageStream.subscribe((url: string) => {
                this.loadNextGameFromExitUrl(url)
                    .then(() => {
                        this.events.once(Phaser.Scenes.Events.POST_UPDATE, () => {
                            this.onMapExit(Room.getRoomPathFromExitUrl(url, window.location.toString())).catch((e) =>
                                console.error(e),
                            );
                        });
                    })
                    .catch((e) => console.error(e));
            }),
        );
        let scriptedBubbleSprite: Sprite;
        this.iframeSubscriptionList.push(
            iframeListener.displayBubbleStream.subscribe(() => {
                scriptedBubbleSprite = new Sprite(
                    this,
                    this.CurrentPlayer.x + 25,
                    this.CurrentPlayer.y,
                    "circleSprite-white",
                );
                scriptedBubbleSprite.setDisplayOrigin(48, 48).setDepth(DEPTH_BUBBLE_CHAT_SPRITE);
                this.add.existing(scriptedBubbleSprite);
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.removeBubbleStream.subscribe(() => {
                scriptedBubbleSprite.destroy();
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.showLayerStream.subscribe((layerEvent) => {
                this.gameMapFrontWrapper.setLayerVisibility(layerEvent.name, true);
                this.markDirty();
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.hideLayerStream.subscribe((layerEvent) => {
                this.gameMapFrontWrapper.setLayerVisibility(layerEvent.name, false);
                this.markDirty();
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.setPropertyStream.subscribe((setProperty) => {
                this.setPropertyLayer(setProperty.layerName, setProperty.propertyName, setProperty.propertyValue);
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.setAreaPropertyStream.subscribe((setProperty) => {
                this.setAreaProperty(setProperty.areaName, setProperty.propertyName, setProperty.propertyValue);
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.banPlayerIframeEvent.subscribe((banPlayerEvent) => {
                this.connection?.emitBanPlayerMessage(banPlayerEvent.uuid, banPlayerEvent.name);
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.mapEditorStream.subscribe((isActivated: boolean) => {
                mapManagerActivated.set(isActivated);
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.screenSharingStream.subscribe((isActivated: boolean) => {
                screenSharingActivatedStore.set(isActivated);
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.rightClickStream.subscribe((isRestore: boolean) => {
                if (isRestore) this.userInputManager.restoreRightClick();
                else this.userInputManager.disableRightClick();
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.wheelZoomStream.subscribe((isRestore: boolean) => {
                if (isRestore) this.cameraManager.unlockZoom();
                else this.cameraManager.lockZoom();
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.inviteUserButtonStream.subscribe((isActivated: boolean) => {
                inviteUserActivated.set(isActivated);
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.roomListButtonStream.subscribe((isActivated: boolean) => {
                roomListActivated.set(isActivated);
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.addButtonActionBarStream.subscribe((event) => {
                registerAdditionalMenuItem(event);
            }),
        );

        this.iframeSubscriptionList.push(
            iframeListener.removeButtonActionBarStream.subscribe((event) => {
                unregisterAdditionalMenuItem(event);
            }),
        );

        iframeListener.registerAnswerer("openCoWebsite", (openCoWebsite, source) => {
            return openCoWebSite(openCoWebsite, source);
        });

        iframeListener.registerAnswerer("getCoWebsites", () => {
            return getCoWebSite();
        });

        iframeListener.registerAnswerer("closeCoWebsite", (coWebsiteId) => {
            return closeCoWebsite(coWebsiteId);
        });

        iframeListener.registerAnswerer("closeCoWebsites", () => {
            return coWebsites.removeAll();
        });

        iframeListener.registerAnswerer("openUIWebsite", (websiteConfig) => {
            return uiWebsiteManager.open(websiteConfig);
        });

        iframeListener.registerAnswerer("getUIWebsites", () => {
            return uiWebsiteManager.getAll();
        });

        iframeListener.registerAnswerer("getUIWebsiteById", (websiteId) => {
            const website = uiWebsiteManager.getById(websiteId);
            if (!website) {
                throw new Error("Unknown ui-website");
            }
            return website;
        });

        iframeListener.registerAnswerer("closeUIWebsite", (websiteId) => {
            return uiWebsiteManager.close(websiteId);
        });

        iframeListener.registerAnswerer("getMapData", () => {
            return {
                data: this.gameMapFrontWrapper.getMap(),
            };
        });

        iframeListener.registerAnswerer("getWamMapData", () => {
            return {
                data: this.gameMapFrontWrapper.getGameMap().getWamFile()?.getWam(),
            };
        });

        iframeListener.registerAnswerer("getState", async (query, source): Promise<GameStateEvent> => {
            // The sharedVariablesManager is not instantiated before the connection is established. So we need to wait
            // for the connection to send back the answer.
            await this.roomJoinedPromiseDeferred.promise;
            return {
                playerId: this.connection?.getUserId(),
                mapUrl: this.mapUrlFile,
                hashParameters: urlManager.getHashParameters(),
                startLayerName: urlManager.getStartPositionNameFromUrl(),
                uuid: localUserStore.getLocalUser()?.uuid,
                nickname: this.playerName,
                language: get(locale),
                roomId: this.roomUrl,
                tags: this.connection ? this.connection.getAllTags() : [],
                variables: this.sharedVariablesManager.variables,
                //playerVariables: localUserStore.getAllUserProperties(),
                playerVariables: this.playerVariablesManager.variables,
                userRoomToken: this.connection ? this.connection.userRoomToken : "",
                metadata: this._room.metadata,
                iframeId: source ? iframeListener.getUIWebsiteIframeIdFromSource(source) : undefined,
                isLogged: this.room.isLogged,
            };
        });
        this.iframeSubscriptionList.push(
            iframeListener.setTilesStream.subscribe((eventTiles) => {
                for (const eventTile of eventTiles) {
                    this.gameMapFrontWrapper.putTile(eventTile.tile, eventTile.x, eventTile.y, eventTile.layer);
                }
                // Tiles changed by a script must repaint even when nothing else moves (the render loop
                // skips frames until a scene is dirty; without this, script-driven tile changes only
                // became visible on the next local player input).
                this.markDirty();
            }),
        );
        iframeListener.registerAnswerer("enablePlayersTracking", (enablePlayersTrackingEvent, source) => {
            if (source === null) {
                throw new Error('Missing source in "enablePlayersTracking" query. This should never happen.');
            }

            if (enablePlayersTrackingEvent.movement === true && enablePlayersTrackingEvent.players === false) {
                throw new Error("Cannot enable movement without enabling players first");
            }

            let sendPlayers = false;

            if (enablePlayersTrackingEvent.players) {
                sendPlayers = this.playersEventDispatcher.addIframe(source);
            } else {
                this.playersEventDispatcher.removeIframe(source);
            }
            if (enablePlayersTrackingEvent.movement) {
                this.playersMovementEventDispatcher.addIframe(source);
            } else {
                this.playersMovementEventDispatcher.removeIframe(source);
            }

            const addPlayerEvents: AddPlayerEvent[] = [];
            if (sendPlayers) {
                if (enablePlayersTrackingEvent.players) {
                    for (const player of this.remotePlayersRepository.getPlayers().values()) {
                        addPlayerEvents.push(RemotePlayersRepository.toIframeAddPlayerEvent(player));
                    }
                }
            }
            return addPlayerEvents;
        });
        iframeListener.registerAnswerer("loadTileset", (eventTileset) => {
            return this.connectionAnswerPromiseDeferred.promise.then(() => {
                const jsonTilesetDir = eventTileset.url.substring(0, eventTileset.url.lastIndexOf("/"));
                //Initialise the firstgid to 1 because if there is no tileset in the tilemap, the firstgid will be 1
                let newFirstgid = 1;
                const lastTileset = this.mapFile.tilesets[this.mapFile.tilesets.length - 1];
                if (
                    lastTileset &&
                    lastTileset.firstgid !== undefined &&
                    "tilecount" in lastTileset &&
                    lastTileset.tilecount !== undefined
                ) {
                    //If there is at least one tileset in the tilemap then calculate the firstgid of the new tileset
                    newFirstgid = lastTileset.firstgid + lastTileset.tilecount;
                }

                return new Promise((resolve, reject) => {
                    const errorHandler = (file: Phaser.Loader.File) => {
                        if (file.src === eventTileset.url) {
                            console.error("Error while loading " + eventTileset.url + ".");
                            reject(new Error("Error while loading " + eventTileset.url + "."));
                        }
                        this.load.off("loaderror", errorHandler);
                    };

                    this.load.once("filecomplete-json-" + eventTileset.url, () => {
                        let jsonTileset = this.cache.json.get(eventTileset.url);
                        const imageUrl = jsonTilesetDir + "/" + jsonTileset.image;

                        this.load.image(imageUrl, imageUrl);
                        this.load.once("filecomplete-image-" + imageUrl, () => {
                            //Add the firstgid of the tileset to the json file
                            jsonTileset = { ...jsonTileset, firstgid: newFirstgid };
                            this.mapFile.tilesets.push(jsonTileset);
                            this.Map.tilesets.push(
                                new Tileset(
                                    jsonTileset.name,
                                    jsonTileset.firstgid,
                                    jsonTileset.tileWidth,
                                    jsonTileset.tileHeight,
                                    jsonTileset.margin,
                                    jsonTileset.spacing,
                                    jsonTileset.tiles,
                                ),
                            );
                            const tilesetImage = this.Map.addTilesetImage(
                                jsonTileset.name,
                                imageUrl,
                                jsonTileset.tilewidth,
                                jsonTileset.tileheight,
                                jsonTileset.margin,
                                jsonTileset.spacing,
                            );
                            if (tilesetImage) {
                                this.Terrains.push(tilesetImage);
                            } else {
                                console.warn(`Failed to add TilesetImage ${jsonTileset.name}: ${imageUrl}`);
                            }
                            //destroy the tilemaplayer because they are unique and we need to reuse their key and layerData
                            for (const layer of this.Map.layers) {
                                layer.tilemapLayer.destroy(false);
                            }
                            this.gameMapFrontWrapper?.close();
                            //Create a new GameMap with the changed file
                            this.gameMapFrontWrapper = new GameMapFrontWrapper(
                                this,
                                new GameMap(this.mapFile, this.wamFile),
                                this.Map,
                                this.Terrains,
                            );
                            // Unsubscribe if needed and subscribe to GameMapChanged event again
                            this.subscribeToGameMapChanged();
                            this.subscribeToEntitiesManagerObservables();
                            //Destroy the colliders of the old tilemapLayer
                            this.physics.add.world.colliders.destroy();
                            //Create new colliders with the new GameMap
                            this.createCollisionWithPlayer();
                            //Destroy old GameMapPropertiesListener and create new one
                            this.gameMapPropertiesListener?.destroy();
                            this.gameMapPropertiesListener = new GameMapPropertiesListener(
                                this,
                                this.gameMapFrontWrapper,
                            );
                            this.gameMapPropertiesListener.register();
                            this.configureTileAnimations();
                            resolve(newFirstgid);
                        });
                        this.load.off("loaderror", errorHandler);
                    });
                    this.load.on("loaderror", errorHandler);

                    this.load.json(eventTileset.url, eventTileset.url);
                    this.load.start();
                });
            });
        });

        iframeListener.registerAnswerer("triggerActionMessage", (message) =>
            popupStore.addPopup(
                PopUpTriggerActionMessage,
                {
                    message: message.message,
                    onclick: () => {
                        popupStore.removePopup(message.uuid);
                        iframeListener.sendActionMessageTriggered(message.uuid);
                    },
                    userInputManager: this.userInputManager,
                },
                message.uuid,
            ),
        );

        iframeListener.registerAnswerer("triggerPlayerMessage", (message) =>
            this.CurrentPlayer.playText(message.uuid, message.message, undefined, () => {
                this.CurrentPlayer.destroyText(message.uuid);
                iframeListener.sendActionMessageTriggered(message.uuid);
            }),
        );

        iframeListener.registerAnswerer("setVariable", (event, source) => {
            // TODO: "setVariable" message has a useless "target"
            // TODO: "setVariable" message has a useless "target"
            // TODO: "setVariable" message has a useless "target"
            // TODO: design another message when sending from iframeAPI to front

            this.sharedVariablesManager.setVariable(event, source);
            /*switch (event.target) {
                case "global": {
                    break;
                }
                case "player": {
                    localUserStore.setUserProperty(event.key, event.value);
                    break;
                }
                case "sharedPlayer": {
                    this.connection?.emitPlayerSetVariable(event.key, event.value);
                    // const clientToServerMessage = new ClientToServerMessage();
                    // clientToServerMessage.setSetplayerdetailsmessage(message);
                    // this.socket.send(clientToServerMessage.serializeBinary().buffer);
                    break;
                }
                default: {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const _exhaustiveCheck: never = event.target;
                }
            }*/
        });

        iframeListener.registerAnswerer("removeActionMessage", (message) => {
            popupStore.removePopup(message.uuid);
        });

        iframeListener.registerAnswerer("removePlayerMessage", (message) => {
            this.CurrentPlayer.destroyText(message.uuid);
        });

        iframeListener.registerAnswerer("setPlayerOutline", (message) => {
            const normalizeColor = (color: number) => Math.min(Math.max(0, Math.round(color)), 255);
            const red = normalizeColor(message.red);
            const green = normalizeColor(message.green);
            const blue = normalizeColor(message.blue);
            const color = (red << 16) | (green << 8) | blue;
            this.CurrentPlayer.setApiOutlineColor(color);
            this.connection?.emitPlayerOutlineColor(color);
        });

        iframeListener.registerAnswerer("removePlayerOutline", () => {
            this.CurrentPlayer.removeApiOutlineColor();
            this.connection?.emitPlayerOutlineColor(null);
        });

        iframeListener.registerAnswerer("getPlayerPosition", () => {
            return {
                x: this.CurrentPlayer.x,
                y: this.CurrentPlayer.y,
            };
        });

        iframeListener.registerAnswerer("movePlayerTo", async (message) => {
            return this.moveTo({ x: message.x, y: message.y }, true, message.speed);
        });

        iframeListener.registerAnswerer("teleportPlayerTo", (message) => {
            // Teleporting skips the colliders: check the access rights of the areas at the destination ourselves.
            if (!this.isPositionAllowedForCurrentUser(message)) {
                throw new Error(
                    "WA.player.teleport: the target position is inside an area the user does not have access to.",
                );
            }
            this.CurrentPlayer.teleportTo(message.x, message.y);
        });

        iframeListener.registerAnswerer("getWoka", () => {
            return new Promise((res, rej) => {
                const woka = get(currentPlayerWokaStore);
                if (woka) {
                    res(woka);
                    return;
                }

                // If we could not get the Woka right away (because it is not available yet), let's subscribe to the update
                // and resolve as soon as we have a value
                let unsubscribe: (() => void) | undefined;
                //eslint-disable-next-line prefer-const
                unsubscribe = currentPlayerWokaStore.subscribe((woka) => {
                    if (woka !== undefined) {
                        if (unsubscribe) {
                            unsubscribe();
                        }
                        res(woka);
                    }
                });
            });
        });

        iframeListener.registerAnswerer("goToLogin", () => {
            if (!ENABLE_OPENID) {
                throw new Error("Cannot access login page. OpenID connect must configured first.");
            }
            scriptUtils.goToPage("/login");
        });

        iframeListener.registerAnswerer("playSoundInBubble", async (message) => {
            const soundUrl = new URL(message.url, this.mapUrlFile);
            try {
                await this.getDefaultProximityChatRoom().dispatchSound(soundUrl);
            } catch (error) {
                console.error("Error playing sound in bubble:", error);
            }
        });

        iframeListener.registerAnswerer("playSoundInMeeting", async (message) => {
            const soundUrl = new URL(message.url, this.mapUrlFile);
            await this.getMeetingProximityChatRoom(message.meetingId).dispatchSound(soundUrl);
        });

        iframeListener.registerAnswerer("startStreamInBubble", async (message) => {
            await this.getDefaultProximityChatRoom().startScriptingAudioStream(message.sampleRate);
        });

        iframeListener.registerAnswerer("startStreamInMeeting", async (message) => {
            await this.getMeetingProximityChatRoom(message.meetingId).startScriptingAudioStream(message.sampleRate);
        });

        iframeListener.registerAnswerer("appendPCMData", async (message) => {
            await this.getDefaultProximityChatRoom().appendScriptingAudioData(message.data);
        });

        iframeListener.registerAnswerer("appendPCMDataToMeeting", async (message) => {
            await this.getMeetingProximityChatRoom(message.meetingId).appendScriptingAudioData(message.data);
        });

        iframeListener.registerAnswerer("resetAudioBuffer", async () => {
            await this.getDefaultProximityChatRoom().resetScriptingAudioBuffer();
        });

        iframeListener.registerAnswerer("resetMeetingAudioBuffer", async (message) => {
            await this.getMeetingProximityChatRoom(message.meetingId).resetScriptingAudioBuffer();
        });

        iframeListener.registerAnswerer("stopStreamInBubble", () => {
            this.getDefaultProximityChatRoom().stopScriptingAudioStream();
        });

        iframeListener.registerAnswerer("stopStreamInMeeting", (message) => {
            this.getMeetingProximityChatRoom(message.meetingId).stopScriptingAudioStream();
        });

        const startListeningToStreamInBubbleSubscription =
            iframeListener.startListeningToStreamInBubbleStream.subscribe((message) => {
                this.getDefaultProximityChatRoom()
                    .startListeningToScriptingAudioStream(message.sampleRate)
                    .catch((error) => {
                        console.error("Error while starting listening to streams", error);
                        Sentry.captureException(error);
                    });
            });
        this.unsubscribers.push(() => startListeningToStreamInBubbleSubscription.unsubscribe());

        const stopListeningToStreamInBubbleSubscription = iframeListener.stopListeningToStreamInBubbleStream.subscribe(
            () => {
                this.getDefaultProximityChatRoom().stopListeningToScriptingAudioStream();
            },
        );
        this.unsubscribers.push(() => stopListeningToStreamInBubbleSubscription.unsubscribe());

        const startListeningToStreamInMeetingSubscription =
            iframeListener.startListeningToStreamInMeetingStream.subscribe((message) => {
                try {
                    this.getMeetingProximityChatRoom(message.meetingId)
                        .startListeningToScriptingAudioStream(message.sampleRate, message.meetingId)
                        .catch((error) => {
                            console.error("Error while starting listening to meeting streams", error);
                            Sentry.captureException(error);
                        });
                } catch (error) {
                    console.error("Error while starting listening to meeting streams", error);
                    Sentry.captureException(error);
                }
            });
        this.unsubscribers.push(() => startListeningToStreamInMeetingSubscription.unsubscribe());

        const stopListeningToStreamInMeetingSubscription =
            iframeListener.stopListeningToStreamInMeetingStream.subscribe((message) => {
                try {
                    this.getMeetingProximityChatRoom(message.meetingId).stopListeningToScriptingAudioStream();
                } catch (error) {
                    console.error("Error while stopping listening to meeting streams", error);
                    Sentry.captureException(error);
                }
            });
        this.unsubscribers.push(() => stopListeningToStreamInMeetingSubscription.unsubscribe());
    }

    private setPropertyLayer(
        layerName: string,
        propertyName: string,
        propertyValue: string | number | boolean | undefined,
    ): void {
        if (propertyName === GameMapProperties.EXIT_URL && typeof propertyValue === "string") {
            this.loadNextGameFromExitUrl(propertyValue).catch((e) => console.error(e));
        }
        this.gameMapFrontWrapper.setLayerProperty(layerName, propertyName, propertyValue);
    }

    private setAreaProperty(areaName: string, propertyName: string, propertyValue: unknown): void {
        this.gameMapFrontWrapper.setDynamicAreaProperty(areaName, propertyName, propertyValue);
    }

    public setTileAnimationsPaused(paused: boolean): void {
        this.gameMapFrontWrapper?.setTileAnimationsPaused(paused);
        if (!paused) {
            this.markDirty();
        }
    }

    private configureTileAnimations(): void {
        this.tileAnimationRefreshEvent?.remove(false);
        this.tileAnimationRefreshEvent = undefined;

        this.setTileAnimationsPaused(localUserStore.getDisableAnimations());

        const refreshDelay = this.gameMapFrontWrapper.getTileAnimationRefreshDelay();
        if (refreshDelay === undefined) {
            return;
        }

        this.tileAnimationRefreshEvent = this.time.addEvent({
            delay: refreshDelay,
            loop: true,
            callback: () => {
                if (!localUserStore.getDisableAnimations()) {
                    this.markDirty();
                }
            },
        });
    }

    private removeAllRemotePlayers(): void {
        this.MapPlayersByKey.forEach((player: RemotePlayer) => {
            player.destroy();

            if (player.companion) {
                player.companion.destroy();
            }
        });
        this.MapPlayersByKey.clear();
        this.remotePlayersSpatialIndex.clear();
    }

    private tryOpenMapEditorWithToolEditorParameter(): void {
        const toolEditorParam = urlManager.getHashParameter("mapEditor");
        if (toolEditorParam) {
            if (!get(mapEditorActivated)) {
                popupStore.addPopup(
                    PopUpMapEditorNotEnabled,
                    {
                        message: get(LL).warning.mapEditorNotEnabled(),
                        onclick: () => {
                            popupStore.removePopup("mapEditorNotEnabled");
                        },
                        userInputManager: this.userInputManager,
                    },
                    "mapEditorNotEnabled",
                );

                setTimeout(() => popupStore.removePopup("mapEditorNotEnabled"), 6_000);
            } else {
                switch (toolEditorParam) {
                    case "wamSettingsEditorTool": {
                        mapEditorModeStore.switchMode(true);
                        mapEditorSelectedToolStore.set(EditorToolName.WAMSettingsEditor);
                        const menuItem = urlManager.getHashParameter("menuItem");
                        if (menuItem) {
                            switch (menuItem) {
                                case "megaphone": {
                                    mapEditorWamSettingsEditorToolCurrentMenuItemStore.set(
                                        WAM_SETTINGS_EDITOR_TOOL_MENU_ITEM.Megaphone,
                                    );
                                    break;
                                }
                                default: {
                                    mapEditorWamSettingsEditorToolCurrentMenuItemStore.set(undefined);
                                    break;
                                }
                            }
                        }
                        break;
                    }
                    case "floor": {
                        mapEditorModeStore.switchMode(true);
                        mapEditorSelectedToolStore.set(EditorToolName.MapLayerEditor);
                        break;
                    }
                    case "entity": {
                        mapEditorModeStore.switchMode(true);
                        mapEditorSelectedToolStore.set(EditorToolName.EntityEditor);
                        break;
                    }
                    case "area": {
                        mapEditorModeStore.switchMode(true);
                        mapEditorSelectedToolStore.set(EditorToolName.AreaEditor);
                        break;
                    }
                    default: {
                        popupStore.addPopup(
                            PopUpMapEditorShortcut,
                            {
                                message: get(LL).warning.mapEditorShortCut(),
                                onclick: () => {
                                    popupStore.removePopup("mapEditorShortCut");
                                },
                                userInputManager: this.userInputManager,
                            },
                            "mapEditorShortCut",
                        );

                        setTimeout(() => popupStore.removePopup("mapEditorShortCut"), 6_000);
                        break;
                    }
                }
            }
            urlManager.clearHashParameter();
        }
    }

    /**
     * Analyze the #moveTo parameter in the URL and walk the player there (see walkToMoveTarget).
     */
    private tryMovePlayerWithMoveToParameter(): void {
        const moveToParam = urlManager.getHashParameter("moveTo");
        if (moveToParam && this.walkToMoveTarget(moveToParam)) {
            urlManager.clearHashParameter();
        }
    }

    /**
     * Walk the player to a #moveTo target:
     *
     * - to the X,Y coordinates if this is X,Y coordinates
     * - if not, to the WAM area with the given name
     * - if not found, to the Tiled area with the given name
     * - if not found, to the Tiled layer with the given name
     *
     * Returns false when the target cannot be found. Also used by the agenda's "Go there", for a meeting in the
     * current map, without going through the URL.
     */
    public walkToMoveTarget(target: string): boolean {
        try {
            let endPos: { x: number; y: number };
            const posFromParam = StringUtils.parsePointFromParam(target);
            if (posFromParam) {
                endPos = posFromParam;
            } else {
                // First, try by id
                let areaData = this.gameMapFrontWrapper.getAreas()?.get(target);
                if (!areaData) {
                    areaData = this.gameMapFrontWrapper.getAreaByName(target);
                }
                if (areaData) {
                    endPos = MathUtils.randomPositionFromRect(areaData);
                } else {
                    const destinationObject = this.gameMapFrontWrapper.getObjectWithName(target);
                    if (destinationObject) {
                        endPos = destinationObject;
                    } else {
                        endPos = this.pathfindingManager.mapTileUnitToPixels(
                            this.gameMapFrontWrapper.getRandomPositionFromLayer(target),
                        );
                    }
                }
            }

            this.moveTo(endPos, false, WOKA_SPEED * 2.5).catch((e) => console.warn(e));
            return true;
        } catch (err) {
            console.warn(`Cannot proceed with moveTo command:\n\t-> ${err}`);
            return false;
        }
    }

    private tryMovePlayerWithMoveToUserParameter(): void {
        const uuidParam = urlManager.getHashParameter("moveToUser");
        if (uuidParam) {
            this.connection?.emitAskPosition(uuidParam, this.roomUrl);
            urlManager.clearHashParameter();
        }
    }

    /**
     * Walk the player to position x,y expressed in Game pixels.
     */
    /**
     * @param stopDistance Stop this many pixels before the destination (going to a colleague: next to them, not on
     * them). Only applied when the path does reach the destination.
     */
    public async moveTo(
        position: { x: number; y: number },
        tryFindingNearestAvailable = false,
        speed: number | undefined = undefined,
        stopDistance: number | undefined = undefined,
    ): Promise<{ x: number; y: number; cancelled: boolean }> {
        // Through the raised floors and their stairs, when the walk starts from one or ends on one.
        const floorWalk = this.floorWalkTo(position);
        if (floorWalk) {
            const result = await this.CurrentPlayer.setPathToFollow(
                floorWalk,
                speed ?? this.CurrentPlayer.walkingSpeed,
            );
            return { x: result.x, y: result.y, cancelled: result.cancelled };
        }
        const pathfindingManager = this.getPathfindingManager();

        // The collision grid can change while the path is followed (an area gets locked or full...): the
        // player then aborts right before walking onto a blocking tile (see Player.onPathWaypointReached)
        // and we compute a new route to the destination.
        for (let attempt = 0; attempt <= MAX_PATH_REROUTES; attempt += 1) {
            this.preparePathfinding(pathfindingManager);
            // Each attempt must fully complete (walk, then maybe reroute) before the next one starts.
            // eslint-disable-next-line no-await-in-loop
            const foundPath = await pathfindingManager.findPathFromGameCoordinates(
                {
                    x: this.CurrentPlayer.x,
                    y: this.CurrentPlayer.y,
                },
                position,
                tryFindingNearestAvailable,
            );
            const path = this.stopShortOfDestination(foundPath, position, stopDistance);
            if (foundPath.length > 0 && path.length < 2) {
                // Already next to the destination.
                return { x: this.CurrentPlayer.x, y: this.CurrentPlayer.y, cancelled: false };
            }
            if (path.length === 0) {
                if (attempt === 0) {
                    // The destination is unreachable from the start (typically an already locked area):
                    // still walk towards it instead of silently doing nothing.
                    return this.walkTowardsBlockedDestination(position, tryFindingNearestAvailable, speed);
                }
                break;
            }
            if (!this.gameMapFrontWrapper.isTileCollisionPathClear(this.CurrentPlayer, path)) {
                throw new Error("No path found around partial tile collisions");
            }
            // eslint-disable-next-line no-await-in-loop
            const result = await this.CurrentPlayer.setPathToFollow(path, speed ?? this.CurrentPlayer.walkingSpeed);
            if (!result.blocked) {
                // Normal arrival, or cancellation by the user taking over: never reroute in that case.
                return { x: result.x, y: result.y, cancelled: result.cancelled };
            }
        }

        // The path got blocked mid-walk and the destination is not reachable anymore. The woka already
        // stands right before the blocking tile: warn about the area blocking the destination.
        this.displayPathBlockedWarning(position);
        return { x: this.CurrentPlayer.x, y: this.CurrentPlayer.y, cancelled: true };
    }

    /** The floor drawn at a point of the screen (0: the ground): what stands on another one is out of reach there. */
    public floorLevelAt(point: { x: number; y: number }): number {
        const floors = this.floorSpike?.walkContext();
        return floors ? levelUnderPoint(floors.model, point.x, point.y) : 0;
    }

    /**
     * The walk to a point through the raised floors (see `floorPath`); undefined for a walk that stays on the ground,
     * from a stair, or when no stair leads there: the ordinary walk of the ground then applies.
     */
    private floorWalkTo(position: { x: number; y: number }): { x: number; y: number }[] | undefined {
        const floors = this.floorSpike?.walkContext();
        if (!floors || floors.state.stair !== undefined) return undefined;
        if (floors.state.elevation < 2 && levelUnderPoint(floors.model, position.x, position.y) === 0) {
            return undefined;
        }
        const grid = this.gameMapFrontWrapper.getSharedCollisionGrid();
        // The walls of each floor, read once per walk (a door is passable: it opens when the avatar comes near).
        const placed = Array.from(this.gameMapFrontWrapper.getEntitiesManager().getEntities().values(), (entity) => {
            const prefab = entity.getPrefab();
            return {
                x: entity.x,
                y: entity.y,
                collectionName: prefab.collectionName,
                prefabId: prefab.id,
                elevation: entity.getElevation(),
            };
        });
        const barriers = new Map<number, TileBarriers>();
        const barriersOf = (level: number): TileBarriers => {
            let found = barriers.get(level);
            if (!found) {
                found = wallBarriers(levelItems(placed, level));
                barriers.set(level, found);
            }
            return found;
        };
        return floorPath({
            model: floors.model,
            blocked: (level, from, to) => barriersOf(level).blocksMove(from, to),
            groundWalkable: (x, y) => {
                const cell = grid[y]?.[x];
                return cell !== undefined && cell !== PathTileType.Collider;
            },
            from: { x: this.CurrentPlayer.x, y: this.CurrentPlayer.y, elevation: floors.state.elevation },
            to: position,
        });
    }

    /** The live collisions of the map for a computed walk of the player: tiles, walls, and object hitboxes. */
    private preparePathfinding(pathfindingManager: PathfindingManager): void {
        pathfindingManager.setCollisionGrid(this.gameMapFrontWrapper.getCollisionGrid({ emitMapChangedEvent: false }));
        pathfindingManager.setBarriers(this.gameMapFrontWrapper.getWallBarriers());
        pathfindingManager.setObstacles(this.gameMapFrontWrapper.getPathObstacles(this.CurrentPlayer));
    }

    /**
     * The free point of a rectangle (an area) nearest to a target point that the player can walk to now, without
     * walking (see PathfindingManager.nearestReachablePointIn). Undefined when no point of it can be reached.
     */
    public nearestReachablePointIn(
        rectangle: { x: number; y: number; width: number; height: number },
        target: { x: number; y: number },
    ): { x: number; y: number } | undefined {
        const pathfindingManager = this.getPathfindingManager();
        this.preparePathfinding(pathfindingManager);
        return pathfindingManager.nearestReachablePointIn(
            { x: this.CurrentPlayer.x, y: this.CurrentPlayer.y },
            rectangle,
            target,
        );
    }

    /**
     * The path cut `stopDistance` before its end, when that end is the destination itself. A nearest free spot found
     * instead (the destination tile is taken) is already next to it: kept as is.
     */
    private stopShortOfDestination(
        path: { x: number; y: number }[],
        destination: { x: number; y: number },
        stopDistance: number | undefined,
    ): { x: number; y: number }[] {
        const end = path.at(-1);
        if (
            stopDistance === undefined ||
            end === undefined ||
            path.length < 2 ||
            Math.hypot(end.x - destination.x, end.y - destination.y) > stopDistance
        ) {
            return path;
        }
        return stopShortOf(path, end, stopDistance);
    }

    /**
     * The destination is not reachable right now (typically inside an already locked area). Rather than
     * doing nothing, walks towards it on a path computed as if the blocking areas were walkable: the live
     * next-waypoint check (see Player.onPathWaypointReached) stops the woka right before the first tile
     * that really collides, where the blocked-area warning is displayed. If the area gets unlocked while
     * the woka is walking, it simply reaches the destination.
     */
    private async walkTowardsBlockedDestination(
        position: { x: number; y: number },
        tryFindingNearestAvailable: boolean,
        speed: number | undefined,
    ): Promise<{ x: number; y: number; cancelled: boolean }> {
        const areasManager = this.gameMapFrontWrapper.areasManager;
        if (!areasManager) {
            throw new Error("No path found");
        }

        // Suggestion grid only: real walls stay, and reality is enforced tile by tile while walking.
        const pathfindingManager = this.getPathfindingManager();
        const liveGrid = this.gameMapFrontWrapper.getCollisionGrid({ emitMapChangedEvent: false });
        const tileDimensions = this.gameMapFrontWrapper.getTileDimensions();
        const suggestionGrid = liveGrid.map((row) => [...row]);
        for (const area of areasManager.getCollidingAreas()) {
            const xStart = Math.max(0, Math.floor(area.x / tileDimensions.width));
            const xEnd = Math.ceil((area.x + area.width) / tileDimensions.width);
            const yStart = Math.max(0, Math.floor(area.y / tileDimensions.height));
            const yEnd = Math.ceil((area.y + area.height) / tileDimensions.height);
            for (let y = yStart; y < Math.min(yEnd, suggestionGrid.length); y += 1) {
                suggestionGrid[y].fill(PathTileType.Walkable, xStart, xEnd);
            }
        }

        pathfindingManager.setCollisionGrid(suggestionGrid);
        const path = await pathfindingManager
            .findPathFromGameCoordinates(
                {
                    x: this.CurrentPlayer.x,
                    y: this.CurrentPlayer.y,
                },
                position,
                tryFindingNearestAvailable,
            )
            .finally(() => pathfindingManager.setCollisionGrid(liveGrid));
        if (path.length === 0) {
            throw new Error("No path found");
        }
        if (!this.gameMapFrontWrapper.isTileCollisionPathClear(this.CurrentPlayer, path)) {
            throw new Error("No path found around partial tile collisions");
        }

        const result = await this.CurrentPlayer.setPathToFollow(path, speed ?? this.CurrentPlayer.walkingSpeed);
        if (!result.blocked) {
            // The area got unlocked while walking and the woka arrived, or the user took over.
            return { x: result.x, y: result.y, cancelled: result.cancelled };
        }
        this.displayPathBlockedWarning(position);
        return { x: this.CurrentPlayer.x, y: this.CurrentPlayer.y, cancelled: true };
    }

    /**
     * Displays the blocked-area warning above the woka when a pathfinding move had to stop short of its
     * unreachable destination, reusing the same message (and admin unlock affordance) as a physical
     * collision with the area.
     */
    private displayPathBlockedWarning(destination: { x: number; y: number }): void {
        const areasManager = this.gameMapFrontWrapper.areasManager;
        if (!areasManager) {
            return;
        }
        const blockingArea = areasManager
            .getCollidingAreas()
            .find((area) => MathUtils.isOverlappingWithRectangle(destination, area));
        if (!blockingArea) {
            // Blocked by something else than an area (an entity, a layer change...): stay silent.
            return;
        }
        areasManager.getAreaById(blockingArea.id)?.displayBlockedWarningMessage();
    }

    /**
     * Teleports next to a point (the caller of an accepted invitation): on the free tile nearest to the one `gap`
     * pixels in front of it, within a few tiles; on the point itself when none can be reached. Not where the user may
     * not go.
     */
    public teleportNextTo(position: { x: number; y: number }, gap: number): void {
        const reach = 3 * 32;
        const spot =
            this.nearestReachablePointIn(
                { x: position.x - reach, y: position.y - reach, width: 2 * reach, height: 2 * reach },
                { x: position.x, y: position.y + gap },
            ) ?? position;
        if (!this.isPositionAllowedForCurrentUser(spot)) {
            warningMessageStore.addWarningMessage(get(LL).chat.meetingInvitation.cannotJoin(), { closable: true });
            return;
        }
        this.CurrentPlayer.teleportTo(spot.x, spot.y);
        this.getCameraManager().resumePlayerFollow();
    }

    /** The Home action is explicit: a reload or server restart must never teleport to the personal desk. */
    public teleportToPersonalDesk(): void {
        const desk = get(personalAreaDataStore);
        if (!desk) return;
        const position = { x: desk.x + desk.width * 0.5, y: desk.y + desk.height * 0.5 };
        if (!this.isPositionAllowedForCurrentUser(position)) {
            warningMessageStore.addWarningMessage(get(LL).actionbar.personalDesk.errorMoving(), { closable: true });
            return;
        }
        this.CurrentPlayer.teleportTo(position.x, position.y);
        this.getCameraManager().resumePlayerFollow();
    }

    /**
     * Walk the player to their personal desk and sit on its seat (see DeskSeat.walkToDesk).
     */
    public async walkToPersonalDesk(): Promise<void> {
        const isInsidePersonalArea = get(this._isInsidePersonalAreaStore);
        const userUUID = localUserStore.getLocalUser()?.uuid;
        if (!userUUID) {
            warningMessageStore.addWarningMessage(get(LL).actionbar.personalDesk.errorNoUser(), { closable: true });
            return;
        }

        const gameMapFrontWrapper = this.getGameMapFrontWrapper();
        const personalAreas =
            gameMapFrontWrapper.areasManager?.getAreasByPropertyType("personalAreaPropertyData") ?? [];

        // Find the user's personal area
        let personalAreaData: AreaData | null = null;
        for (const area of personalAreas) {
            const property = area.areaData.properties.find((property) => property.type === "personalAreaPropertyData");
            if (property && property.type === "personalAreaPropertyData" && property.ownerId === userUUID) {
                personalAreaData = area.areaData;
                break;
            }
        }

        if (!personalAreaData) {
            warningMessageStore.addWarningMessage(get(LL).actionbar.personalDesk.errorNotFound(), { closable: true });
            return;
        }

        const player = this.CurrentPlayer;
        try {
            const outcome = await walkToDesk(personalAreaData, {
                seats: getSeats(this),
                isFree: (seat) => !isSeatTaken(this, seat),
                seatedSeatId: player.isSeated() ? findSeatOfCharacter(this, player)?.id : undefined,
                inside: isInsidePersonalArea,
                moveTo: (target) => this.moveTo(target, true, WOKA_SPEED * 2.5),
                sitOnSeat: (seatId) => player.sitOnSeat(seatId),
            });
            if (outcome !== "none" && !isInsidePersonalArea) analyticsClient.trackAdminEvent("personal_desk.entered");
        } catch (error) {
            console.warn("Error while moving to personal desk", error);
            warningMessageStore.addWarningMessage(get(LL).actionbar.personalDesk.errorMoving(), { closable: true });
        }
    }

    private getExitUrl(layer: ITiledMapLayer): string | undefined {
        const property = PropertyUtils.findStringProperty(GameMapProperties.EXIT_URL, layer.properties);
        return property;
    }

    /**
     * @deprecated the map property exitSceneUrl is deprecated
     */
    private getExitSceneUrl(layer: ITiledMapLayer): string | undefined {
        const property = PropertyUtils.findStringProperty(GameMapProperties.EXIT_SCENE_URL, layer.properties);
        return property;
    }

    private getScriptUrls(map: ITiledMap): string[] {
        const script = PropertyUtils.findStringProperty(GameMapProperties.SCRIPT, map.properties);

        if (!script) {
            return [];
        }

        return script.split("\n").map((scriptSplit) => new URL(scriptSplit, this.mapUrlFile).toString());
    }

    private loadNextGameFromExitUrl(exitUrl: string): Promise<void> {
        return this.loadNextGame(Room.getRoomPathFromExitUrl(exitUrl, window.location.toString()));
    }

    //todo: push that into the gameManager
    private async loadNextGame(exitRoomPath: URL): Promise<void> {
        try {
            const room = await Room.createRoom(exitRoomPath);
            return gameManager.loadMap(room);
        } catch (e /*: unknown*/) {
            console.warn('Error while pre-loading exit room "' + exitRoomPath.toString() + '"', e);
        }
    }

    private handleCurrentPlayerHasMovedEvent(event: HasPlayerMovedInterface): void {
        //listen event to share position of user
        this.pushPlayerPosition(event);
        this.gameMapFrontWrapper.setPosition(event.x, event.y, this.CurrentPlayer.getFloorZ());
        this.activatablesManager.updateActivatableObjectsDistances([
            ...Array.from(this.MapPlayersByKey.values()),
            ...this.actionableItems.values(),
            ...this.gameMapFrontWrapper.getActivatableEntities(),
        ]);
        this.activatablesManager.deduceSelectedActivatableObjectByDistance();

        // Call movement ended callbacks if movement just ended
        for (const cb of this.onPlayerMovementEndedCallbacks) {
            cb(event);
        }
        this.hasMovedThisFrame = true;
    }

    private createCollisionWithPlayer() {
        this.gameMapFrontWrapper.setTileCollisionPlayer(this.CurrentPlayer);
        //add collision layer
        for (const phaserLayer of this.gameMapFrontWrapper.phaserLayers) {
            // Area blocking is handled by Area game objects/colliders.
            // Keep the synthetic areas tile layer out of Arcade player-vs-tile collisions.
            if (phaserLayer.layer.name === "__areasCollisionLayer") {
                continue;
            }

            this.physics.add.collider(
                this.CurrentPlayer,
                phaserLayer,
                (
                    object1: Body | StaticBody | Tile | Phaser.Types.Physics.Arcade.GameObjectWithBody,
                    object2: Body | StaticBody | Tile | Phaser.Types.Physics.Arcade.GameObjectWithBody,
                ) => {},
                // SPIKE (floors study): the ground does not block an avatar on a raised floor.
                () => this.CurrentPlayer.isNearGround(),
            );
            this.gameMapFrontWrapper.configureTileCollisions(phaserLayer);
            if (DEBUG_MODE) {
                //debug code to see the collision hitbox of the object in the top layer
                phaserLayer.renderDebug(this.add.graphics(), {
                    tileColor: null, //non-colliding tiles
                    collidingTileColor: new Color(243, 134, 48, 200), // Colliding tiles,
                    faceColor: new Color(40, 39, 37, 255), // Colliding face edges
                });
            }
            //});
        }
    }

    private createCurrentPlayer(startPosition: PositionInterface) {
        //TODO create animation moving between exit and start
        try {
            this.CurrentPlayer = new Player(
                this,
                // We start creating the player before we know its exact position in order to start lazy loading the texture.
                startPosition.x,
                startPosition.y,
                this.playerName,
                this.currentPlayerTexturesPromise,
                PositionMessage_Direction.DOWN,
                false,
                gameManager.getCompanionTextureId() != undefined ? this.currentCompanionTexturePromise : undefined,
            );
            this.CurrentPlayer.on(Phaser.Input.Events.POINTER_OVER, (pointer: Pointer) => {
                this.CurrentPlayer.pointerOverOutline(PHASER_COLOR_DESIGN_SYSTEM_SECONDARY);
            });
            this.CurrentPlayer.on(Phaser.Input.Events.POINTER_OUT, (pointer: Pointer) => {
                this.CurrentPlayer.pointerOutOutline();
            });
            this.CurrentPlayer.on(requestEmoteEventName, (emoteKey: string) => {
                this.connection?.emitEmoteEvent(emoteKey);
            });
        } catch (error) {
            if (error instanceof CharacterTextureError) {
                console.warn("Error while loading current player character texture", error.message);
                gameManager.leaveGame(SelectCharacterSceneName, new SelectCharacterScene());
            } else if (error instanceof CompanionTextureError) {
                console.warn("Error while loading current player companion texture", error.message);
                gameManager.leaveGame(SelectCompanionSceneName, new SelectCompanionScene());
            }
            throw error;
        }

        //create collision
        this.createCollisionWithPlayer();
    }

    private pushPlayerPosition(event: HasPlayerMovedInterface) {
        if (this.lastMoveEventSent === event) {
            return;
        }

        // If the player is not moving, let's send the info right now.
        if (event.moving === false) {
            this.doPushPlayerPosition(event);
            return;
        }

        // If the player is moving, and if it changed direction or started/stopped running, let's send an event
        if (event.direction !== this.lastMoveEventSent.direction || event.running !== this.lastMoveEventSent.running) {
            this.doPushPlayerPosition(event);
            return;
        }

        // If more than 200ms happened since last event sent
        if (this.currentTick - this.lastSentTick >= POSITION_DELAY) {
            this.doPushPlayerPosition(event);
            return;
        }

        // Otherwise, do nothing.
    }

    private doPushPlayerPosition(event: HasPlayerMovedInterface): void {
        this.saveLastPosition(event);
        this.lastMoveEventSent = event;
        this.lastSentTick = this.currentTick;

        this.connection?.sharePosition(
            event.x,
            event.y,
            event.direction,
            event.moving,
            event.running,
            this.getViewport(),
        );
        iframeListener.hasPlayerMoved(event);
    }

    /**
     * In the very special case where we have no renderer (bots run Phaser headless), the camera never follows the
     * Woka: its worldView stays empty at the map origin. We set the viewport to something very large around the Woka
     * to make sure it sees everything around (useful for bots, even if so far, it is a trick).
     * The Woka's position, not lastMoveEventSent: that one is a placeholder at (-1000, -1000) until the first move,
     * and a bot that never moves would only ever see the top-left corner of the map.
     */
    private getHeadlessViewport(): ViewportInterface {
        const { x, y } = this.CurrentPlayer;
        return {
            left: x - 3_000,
            top: y - 3_000,
            right: x + 3_000,
            bottom: y + 3_000,
        };
    }

    private getViewport(forceRecomputeCamera = false): ViewportInterface {
        if (!this.scene.scene.renderer) {
            return this.getHeadlessViewport();
        }

        const camera = this.cameras.main;

        if (forceRecomputeCamera) {
            // When calling this before the first render, camera.preRender() must be called before accessing worldView to ensure it's up to date.
            // See: https://docs.phaser.io/phaser/concepts/cameras#world-view
            camera.preRender();
        }

        const worldView = camera.worldView;
        return {
            left: worldView.x,
            top: worldView.y,
            right: worldView.right,
            bottom: worldView.bottom,
        };
    }

    private doAddPlayer(addPlayerData: AddPlayerInterface): void {
        //check if exist player, if exist, move position
        // Can this really happen? yes..
        if (this.MapPlayersByKey.has(addPlayerData.userId)) {
            console.warn("Got instructed to add a player that already exists: ", addPlayerData.userId);
            console.error(
                "Players status",
                this.remotePlayersRepository.getPlayers(),
                this.MapPlayersByKey,
                "Added players:",
                this.remotePlayersRepository.getAddedPlayers(),
                "Moved players:",
                this.remotePlayersRepository.getMovedPlayers(),
                "Updated players:",
                this.remotePlayersRepository.getUpdatedPlayers(),
                "Removed players:",
                this.remotePlayersRepository.getRemovedPlayers(),
            );
            return;
        }

        let player: RemotePlayer;

        try {
            player = new RemotePlayer(
                addPlayerData.userId,
                addPlayerData.userUuid,
                this,
                addPlayerData.position.x,
                addPlayerData.position.y,
                addPlayerData.name,
                lazyLoadPlayerCharacterTextures(this.superLoad, addPlayerData.characterTextures),
                addPlayerData.position.direction,
                addPlayerData.position.moving,
                addPlayerData.visitCardUrl,
                addPlayerData.companionTexture != undefined
                    ? lazyLoadPlayerCompanionTexture(this.superLoad, addPlayerData.companionTexture)
                    : undefined,
                undefined,
                addPlayerData.chatID,
                addPlayerData.sayMessage,
            );
        } catch (error) {
            if (error instanceof CharacterTextureError) {
                console.warn("Error while loading remote player character texture", error.message);
            } else if (error instanceof CompanionTextureError) {
                console.warn("Error while loading remote player companion texture", error.message);
            }
            throw error;
        }

        if (addPlayerData.outlineColor !== undefined) {
            player.setApiOutlineColor(addPlayerData.outlineColor);
        }
        if (addPlayerData.availabilityStatus !== 0) {
            player.setAvailabilityStatus(addPlayerData.availabilityStatus, true);
        }
        // If this player already had their hand raised before their woka was created (e.g. we just joined the
        // meeting, or the SpaceUser arrived before the woka), reflect it immediately.
        if (get(raisedHandPlayerIdsStore).has(player.userId)) {
            player.setRaisedHand(true);
        }
        player.setListeningMusic(this.listeningUserUuids.has(player.userUuid));
        this.MapPlayersByKey.set(player.userId, player);
        player.updatePosition(addPlayerData.position);
        player.setVehicles(this.remotePlayersRepository.getPlayers().get(player.userId)?.variables);
        player.setNerfEquipped(
            this.remotePlayersRepository.getPlayers().get(player.userId)?.variables.get(NERF_EQUIPPED_VARIABLE),
        );
        player.setNerfHearts(
            this.remotePlayersRepository.getPlayers().get(player.userId)?.variables.get(NERF_HEARTS_VARIABLE),
        );
        player.setTorchEquipped(
            this.remotePlayersRepository.getPlayers().get(player.userId)?.variables.get(TORCH_EQUIPPED_VARIABLE),
        );
        player.setTorchIntensity(
            this.remotePlayersRepository.getPlayers().get(player.userId)?.variables.get(TORCH_INTENSITY_VARIABLE),
        );
        player.setPerception(
            this.remotePlayersRepository.getPlayers().get(player.userId)?.variables.get(PERCEPTION_VARIABLE),
        );
        this._perceptionManager?.refresh(player);
        player.setRodEquipped(
            this.remotePlayersRepository.getPlayers().get(player.userId)?.variables.get(ROD_EQUIPPED_VARIABLE),
        );
        player.setFloorZ(
            decodeFloorZ(this.remotePlayersRepository.getPlayers().get(player.userId)?.variables.get(FLOOR_Z_VARIABLE)),
        );
        player.setAvatarAction(
            this.remotePlayersRepository.getPlayers().get(player.userId)?.variables.get(AVATAR_ACTION_VARIABLE),
        );
        player.setSwimwear(
            this.remotePlayersRepository.getPlayers().get(player.userId)?.variables.get(SWIMWEAR_VARIABLE),
        );
        player.setSwimwearColor(
            this.remotePlayersRepository.getPlayers().get(player.userId)?.variables.get(SWIMWEAR_COLOR_VARIABLE),
        );
        this.remotePlayersSpatialIndex.set(player.userId, player);

        player.on(Phaser.Input.Events.POINTER_OVER, () => {
            this.activatablesManager.handlePointerOverActivatableObject(player);
            this.markDirty();
        });

        player.on(Phaser.Input.Events.POINTER_OUT, () => {
            this.activatablesManager.handlePointerOutActivatableObject();
            this.markDirty();
        });
    }

    private tryChangeShowVoiceIndicatorState(show: boolean): void {
        this.CurrentPlayer.toggleTalk(show);
        if (this.showVoiceIndicatorChangeMessageSent && !show) {
            this.connection?.emitPlayerShowVoiceIndicator(false);
            this.showVoiceIndicatorChangeMessageSent = false;
        } else if (!this.showVoiceIndicatorChangeMessageSent && show) {
            this.connection?.emitPlayerShowVoiceIndicator(true);
            this.showVoiceIndicatorChangeMessageSent = true;
        }
    }

    /** Whether the door of the map layer this object is a piece of is open now (see DoorAnimator). */
    public isDoorOpen(entityId: string): boolean {
        return this.doorAnimator?.isDoorOpen(entityId) ?? false;
    }

    public isInOpenVerticalDoorPassage(x: number, y: number): boolean {
        const elevation = this.CurrentPlayer.getFloorZ();
        return elevation === 0
            ? (this.doorAnimator?.isInOpenVerticalPassage(x, y) ?? false)
            : (this.upperDoors?.isInOpenVerticalPassage(x, y, elevation) ?? false);
    }

    private subscribeToGameMapChanged(): void {
        this.gameMapChangedSubscription?.unsubscribe();
        this.gameMapChangedSubscription = this.gameMapFrontWrapper
            .getMapChangedObservable()
            .subscribe((collisionGrid) => {
                this.pathfindingManager.setCollisionGrid(collisionGrid);
                this.markDirty();
            });
    }

    private subscribeToEntitiesManagerObservables(): void {
        this.rxJsSubscriptions.push(
            this.gameMapFrontWrapper
                .getEntitiesManager()
                .getPointerOverEntityObservable()
                .subscribe((entity) => {
                    if (get(mapEditorModeStore)) {
                        return;
                    }
                    this.activatablesManager.handlePointerOverActivatableObject(entity);
                    this.markDirty();
                }),
        );
        this.rxJsSubscriptions.push(
            this.gameMapFrontWrapper
                .getEntitiesManager()
                .getPointerOutEntityObservable()
                .subscribe((entity) => {
                    if (get(mapEditorModeStore)) {
                        return;
                    }
                    this.activatablesManager.handlePointerOutActivatableObject();
                    this.markDirty();
                }),
        );
    }

    private doRemovePlayer(userId: number) {
        const player = this.MapPlayersByKey.get(userId);
        if (player === undefined) {
            console.error("Cannot find user with id ", userId);
        } else {
            player.destroy();

            if (player.companion) {
                player.companion.destroy();
            }
        }
        this.MapPlayersByKey.delete(userId);
        this.remotePlayersSpatialIndex.delete(userId);
        // console.debug("User removed in MapPlayersByKey in GameScene", userId);
        this.playersPositionInterpolator.removePlayer(userId);
    }

    private updatePlayerPosition(message: MessageUserMovedInterface): void {
        this.playersMovementEventDispatcher.postMessage({
            type: "remotePlayerChanged",
            data: {
                playerId: message.userId,
                position: {
                    x: message.position.x,
                    y: message.position.y,
                    // TODO: make sure we can also have the "running" and "position" info
                },
            },
        });
    }

    private doUpdatePlayerPosition(message: MessageUserMovedInterface): void {
        const player: RemotePlayer | undefined = this.MapPlayersByKey.get(message.userId);
        if (player === undefined) {
            //throw new Error('Cannot find player with ID "' + message.userId +'"');
            console.error('Cannot update position of player with ID "' + message.userId + '": player not found');
            return;
        }

        // We do not update the player position directly (because it is sent only every 200ms).
        // Instead we use the PlayersPositionInterpolator that will do a smooth animation over the next 200ms.
        const playerMovement = new PlayerMovement(
            { x: player.x, y: player.y },
            this.currentTick,
            {
                ...message.position,
            },
            this.currentTick + POSITION_DELAY,
        );
        this.playersPositionInterpolator.updatePlayerPosition(player.userId, playerMovement);
    }

    private shareGroupPosition(groupPositionMessage: GroupCreatedUpdatedMessageInterface) {
        this.pendingEvents.enqueue({
            type: "GroupCreatedUpdatedEvent",
            event: groupPositionMessage,
        });
    }

    private doShareGroupPosition(groupPositionMessage: GroupCreatedUpdatedMessageInterface): void {
        // NOTE: interestingly, the exact group position (x / y) is no longer used to draw the bubble.
        // The center of the bubble is recomputed inside the ConversationBubble which allows having the center
        // based on interpolated players position (so updated every frame and not every 200ms).
        // The message is still useful for the bubble status (whether it's locked or not)

        const userId = this.connection?.getUserId();
        if (userId && groupPositionMessage.userIds.includes(userId)) {
            this.currentPlayerGroupId = groupPositionMessage.groupId;
            currentPlayerGroupIdStore.set(groupPositionMessage.groupId);
        }

        if (this.currentPlayerGroupId === groupPositionMessage.groupId) {
            currentPlayerGroupLockStateStore.set(groupPositionMessage.locked);
        }

        // TODO: keep a reference to the group sprite in the conversationBubble
        const existingGroup = this.groups.get(groupPositionMessage.groupId);
        if (existingGroup) {
            existingGroup.setLocked(
                groupPositionMessage.groupSize === MAX_PER_GROUP || (groupPositionMessage.locked ?? false),
            );
            return;
        }

        // If we have a new group
        const conversationBubble = new ConversationBubble(
            this,
            Math.round(groupPositionMessage.position.x),
            Math.round(groupPositionMessage.position.y),
            groupPositionMessage.groupSize === MAX_PER_GROUP || (groupPositionMessage.locked ?? false),
            groupPositionMessage.userIds,
        );

        this.groups.set(groupPositionMessage.groupId, conversationBubble);
    }

    /**
     * Displays a text message sent by an admin. Audio messages are no longer supported and are ignored.
     */
    private showUserMessage({ type, message }: SendUserMessage) {
        if (type === "message") {
            textMessageStore.addMessage(message);
            this.playSound("new-message", 0.2);
        }
    }

    //todo: put this into an 'orchestrator' scene (EntryScene?)
    /**
     * A ban is persisted by the admin; a kick only ejects the user from the room, a reload brings them back.
     */
    private ejectedUser({ type, message: reason }: BanUserMessage) {
        const kind = type === "kicked" ? "kicked" : "banned";
        const texts = get(LL).report[kind];
        errorScreenStore.setError(
            ErrorScreenMessage.fromPartial({
                type: "error",
                code: kind === "banned" ? "USER_BANNED" : "USER_KICKED",
                title: texts.title(),
                subtitle: texts.subtitle(),
                // One line each: the reason, then (for a ban only) how to reach the admins.
                details: [
                    reason.trim() === "" ? "" : get(LL).report.reasonGiven({ reason }),
                    kind === "banned" ? get(LL).report.banned.details() : "",
                ]
                    .filter((line) => line !== "")
                    .join("\n"),
            }),
        );

        this.cleanupClosingScene();

        this.userInputManager.disableControls("errorScreen");
        this.userInputManager.disableRightClick();
    }

    //todo: put this into an 'orchestrator' scene (EntryScene?)
    private showWorldFullError(message: string | null): void {
        this.cleanupClosingScene();

        this.scene.stop(ReconnectingSceneName);
        this.scene.remove(ReconnectingSceneName);
        this.userInputManager.disableControls("errorScreen");
        this.userInputManager.disableRightClick();
        //FIX ME to use status code
        if (message == undefined) {
            this.scene.start(ErrorSceneName, {
                title: "Connection rejected",
                subTitle: "The world you are trying to join is full. Try again later.",
                message: "If you want more information, you may contact us at: hello@workadventu.re",
            });
        } else {
            this.scene.start(ErrorSceneName, {
                title: "Connection rejected",
                subTitle: "You cannot join the World. Try again later. \n\r \n\r Error: " + message + ".",
                message:
                    "If you want more information, you may contact administrator or contact us at: hello@workadventu.re",
            });
        }
    }

    private bindSceneEventHandlers(): void {
        this.events.once("shutdown", () => {
            if (!this.cleanupDone) {
                throw new Error("Scene destroyed without cleanup!");
            }
        });
    }

    handleMouseWheel(deltaY: number, pointer?: { x: number; y: number }, rateMultiplier = 1) {
        // Calculate the velocity of the zoom
        //const velocity = deltaY / 30;

        // Calculate the zoom factor
        //const zoomFactor = 1 - velocity * 0.1;

        // Explanation of the formula: to Zoom x 2, we need a delta of 200
        // Question: Why 200 ? For mac usage, it's too slow
        let zoomFactor = Math.exp(((-deltaY * Math.log(2)) / 100) * MOUSE_WHEEL_ZOOM_RATE * rateMultiplier);

        // Sometimes, deltaY can be really high (this happens when the browser is lagging for 1 second or so)
        // Let's clamp the value to avoid zooming too much
        zoomFactor = Clamp(zoomFactor, 0.1, 10);

        debugZoom("DeltaY: ", deltaY, "Zoom factor", zoomFactor);

        this.zoomByFactor(zoomFactor, true, this.zoomAnchor(pointer));
    }

    /** The point a wheel or pinch zoom may keep fixed under the pointer (see CameraManager.zoomByFactorAtPointer). */
    zoomAnchor(pointer?: { x: number; y: number }): { x: number; y: number } | undefined {
        // The map editor's view is always free (the explorer list sets a focus target only to centre on hovered
        // items). In game mode, focus zones keep zooming on the centre.
        return get(mapEditorModeStore) || !waScaleManager.getFocusTarget() ? pointer : undefined;
    }

    zoomByFactor(zoomFactor: number, smooth: boolean, pointer?: { x: number; y: number }) {
        if (this.cameraManager.isZoomLocked()) {
            return;
        }

        const time = zoomFactor > 1 ? zoomFactor * 250 : (1 / zoomFactor) * 250;
        if (pointer) this.cameraManager.zoomByFactorAtPointer(zoomFactor, smooth ? time : 0, pointer);
        else this.cameraManager.zoomByFactor(zoomFactor, smooth ? time : 0);
    }

    get room(): Room {
        return this._room;
    }

    get sceneReadyToStartPromise(): Promise<void> {
        return this.sceneReadyToStartDeferred.promise;
    }

    private proximityChatRoomPromise(): Promise<ProximityChatRoom> {
        if (this._proximityChatRoomManager) {
            return Promise.resolve(this.getDefaultProximityChatRoom());
        }

        return this._proximityChatRoomDeferred.promise;
    }

    private getDefaultProximityChatRoom(): ProximityChatRoom {
        const defaultRoom = this._proximityChatRoomManager?.getDefaultRoom() ?? this._proximityChatRoom;
        if (!defaultRoom) {
            throw new Error("_proximityChatRoom not yet initialized");
        }
        return defaultRoom;
    }

    private getMeetingProximityChatRoom(meetingId: string): ProximityChatRoom {
        const room = this._proximityChatRoomManager?.getRoomByMeetingId(meetingId);
        if (!room) {
            throw new Error(`Proximity meeting "${meetingId}" is not joined`);
        }
        return room;
    }

    get applicationManager(): ApplicationManager {
        if (!this._applicationManager) {
            throw new Error("_applicationManager not yet initialized");
        }
        return this._applicationManager;
    }

    get spaceRegistry(): SpaceRegistryInterface {
        if (!this._spaceRegistry) {
            throw new Error("_spaceRegistry not yet initialized");
        }
        return this._spaceRegistry;
    }

    get proximityChatRoomManager(): ProximityChatRoomManager {
        if (!this._proximityChatRoomManager) {
            throw new Error("_proximityChatRoomManager not yet initialized");
        }
        return this._proximityChatRoomManager;
    }

    get userProviderMerger(): Promise<UserProviderMerger> {
        return this._userProviderMergerDeferred.promise;
    }

    get worldUserCounter(): Readable<number> {
        return this._worldUserCounter;
    }

    getStartPositionNames(): string[] {
        return this.gameMapFrontWrapper.getStartPositionNames();
    }

    get sayManager(): SayManager {
        if (!this._sayManager) {
            throw new Error("_sayManager not yet initialized");
        }
        return this._sayManager;
    }

    // Register a callback that will be called when the player movement ends
    public onPlayerMovementEnded(callback: (event: HasPlayerMovedInterface) => void): void {
        this.onPlayerMovementEndedCallbacks.push(callback);
    }

    private enableVoiceIndicator(): void {
        if (!this.localVolumeStoreUnsubscriber) {
            this.localVolumeStoreUnsubscriber = localVoiceIndicatorStore.subscribe((isTalking) => {
                this.tryChangeShowVoiceIndicatorState(isTalking);

                return () => {
                    this.tryChangeShowVoiceIndicatorState(false);
                };
            });
        }
    }

    private disableVoiceIndicator(): void {
        this.CurrentPlayer.toggleTalk(false);
        if (!this.connection?.closed) {
            this.connection?.emitPlayerShowVoiceIndicator(false);
        }
        this.showVoiceIndicatorChangeMessageSent = false;
        //this.MapPlayersByKey.forEach((remotePlayer) => remotePlayer.toggleTalk(false, true));
        if (this.localVolumeStoreUnsubscriber) {
            this.localVolumeStoreUnsubscriber();
            this.localVolumeStoreUnsubscriber = undefined;
        }
    }

    public get focusFx() {
        return this._focusFx;
    }
}

/** The tracks the wheels of a rider on the ground leave: undefined for one who walks, skates or rides no wheels. */
function groundWheelsOf(character: Character): 1 | 2 | undefined {
    if (!character.isRidingVehicle() || character.isOnIce()) return undefined;
    if (character.vehicle === Vehicle.ElectricUnicycle) return 1;
    if (character.vehicle === Vehicle.Skateboard) return 2;
    return undefined;
}
