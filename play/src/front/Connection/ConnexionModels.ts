import type { SignalData } from "@workadventure/simple-peer";
import type {
    RoomConnectedMessage,
    ApplicationDefinitionInterface,
    AvailabilityStatus,
    EditMapCommandMessage,
    PositionMessage,
    SayMessage,
    TerrainWaterMessage,
    MeadowMessage,
    TreeFireMessage,
    FireConditionsMessage,
    AquaticLifeMessage,
    FishingMessage,
    IceShacksMessage,
} from "@workadventure/messages";
import type { WokaTextureDescriptionInterface } from "../Phaser/Entity/PlayerTextures";
import type { CompanionTextureDescriptionInterface } from "../Phaser/Companion/CompanionTextures";
import type { RoomConnection } from "./RoomConnection";

export interface MessageUserMovedInterface {
    userId: number;
    position: PositionMessage;
}

export interface MessageUserJoined {
    userId: number;
    name: string;
    characterTextures: WokaTextureDescriptionInterface[];
    position: PositionMessage;
    availabilityStatus: AvailabilityStatus;
    visitCardUrl: string | null;
    companionTexture: CompanionTextureDescriptionInterface | undefined;
    userUuid: string;
    outlineColor: number | undefined;
    variables: Map<string, unknown>;
    chatID?: string;
    sayMessage?: SayMessage;
    activate?: () => void;
}

export interface PositionInterface {
    x: number;
    y: number;
}

export interface GroupCreatedUpdatedMessageInterface {
    position: PositionInterface;
    groupId: number;
    groupSize?: number;
    locked?: boolean;
    userIds: number[];
}

export interface GroupUsersUpdateMessageInterface {
    groupId: number;
    userIds: number[];
}

export interface WebRtcDisconnectMessageInterface {
    userId: number;
}

export interface WebRtcSignalReceivedMessageInterface {
    userId: string;
    signal: SignalData;
}

export interface ViewportInterface {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export interface ItemEventMessageInterface {
    itemId: number;
    event: string;
    state: unknown;
    parameters: unknown;
}

export interface AreaPropertyVariable {
    areaId: string;
    propertyId: string;
    key: string;
    value: unknown;
}

export interface RoomJoinedMessageInterface {
    items: { [itemId: number]: unknown };
    variables: Map<string, unknown>;
    playerVariables: Map<string, unknown>;
    areaPropertyVariables: AreaPropertyVariable[];
    /** The states of the objects of the map that differ from their default (a lamp that is off). */
    entityStates: { entityId: string; key: string; value: string }[];
    /** The water of the relief of the map (its whole state) as the server computes it; absent on a dry map. */
    terrainWater?: TerrainWaterMessage;
    aquaticLife?: AquaticLifeMessage;
    /** The meadow of the map (its whole state) as the server computes it; absent where nothing ever grew. */
    meadow?: MeadowMessage;
    /** The trees that burn or are charred, as the server computes them; absent when every tree is green. */
    treeFire?: TreeFireMessage;
    /** The conditions the fire of the room goes by when it was joined. */
    fireConditions?: FireConditionsMessage;
    /** The fishing lines of the room when it was joined; absent when nobody ever fished there. */
    fishing?: FishingMessage;
    /** The ice fishing shacks of the room when it was joined; absent when there is none. */
    iceShacks?: IceShacksMessage;
    characterTextures: WokaTextureDescriptionInterface[];
    companionTexture?: CompanionTextureDescriptionInterface;
    commandsToApply?: EditMapCommandMessage[];
    applications: ApplicationDefinitionInterface[];
}

export interface PlayGlobalMessageInterface {
    type: string;
    content: string;
    broadcastToWorld: boolean;
}

export interface OnConnectInterface {
    connection: RoomConnection;
    roomConnectedMessage: RoomConnectedMessage;
}
