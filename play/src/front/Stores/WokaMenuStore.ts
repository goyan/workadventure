import { derived, writable } from "svelte/store";
import { v4 } from "uuid";
import type { WorkAdventureComponent } from "../../types/component";
import type { PixelIconName } from "../Components/ActionsMenu/PixelIcons";

export type WokaMenuAction = {
    uuid?: string;
    actionName: string;
    callback: () => void;
    protected?: boolean;
    priority?: number;
    style?: "is-success" | "is-error" | "is-primary" | string;
    actionIcon?: string | WorkAdventureComponent;
    emoji?: string;
    /** A pixel icon, shown instead of the emoji on the own-avatar wheel. */
    icon?: PixelIconName;
    testId?: string;
};

export interface WokaMenuData {
    wokaName: string;
    actions: WokaMenuAction[];
    visitCardUrl?: string;
    userId: number; // -1 if the user is not found yet and woka menu is in progress
    userUuid: string;
    /** The local user's own avatar and status, with actions meant for them. */
    isSelf?: boolean;
    menuPosition?: { x: number; y: number };
}

function createWokaMenuStore() {
    const { subscribe, update, set } = writable<WokaMenuData | undefined>(undefined);

    return {
        subscribe,
        initialize: (wokaName: string, userId: number, userUuid: string, visitCardUrl: string | undefined) => {
            set({
                wokaName,
                actions: new Array<WokaMenuAction>(),
                visitCardUrl,
                userId,
                userUuid,
            });
        },
        /** The local user's own card, from a click on their own woka: what others see, without actions. */
        openOwnCard: (wokaName: string, userUuid: string, menuPosition?: { x: number; y: number }) => {
            set({ wokaName, actions: [], userId: -1, userUuid, isSelf: true, menuPosition });
        },
        addAction: (action: WokaMenuAction) => {
            update((data) => {
                if (data === undefined) return data;

                const dataWithUuid = { ...action, uuid: action.uuid ?? v4() };
                data.actions = [...data.actions, dataWithUuid];
                return data;
            });
        },
        removeAction: (actionName: string) => {
            update((data) => {
                if (!data) return data;
                const index = data.actions.findIndex((action) => {
                    return action.actionName === actionName;
                });
                if (index == undefined || index === -1) return data;

                data.actions = [...data.actions.splice(index, 1)];
                return data;
            });
        },
        /**
         * Hides menu
         */
        clear: () => {
            set(undefined);
        },
        removeRemotePlayer: (userUuid: string) => {
            update((data) => {
                if (!data) return data;
                if (data.userUuid === userUuid) {
                    return undefined;
                }
                return data;
            });
        },
    };
}

export const wokaMenuStore = createWokaMenuStore();
export const avatarActionsOpenStore = derived(wokaMenuStore, (menu) => Boolean(menu?.isSelf && menu.actions.length));

export const wokaMenuProgressStore = writable<
    | {
          progress: number;
          message: string;
      }
    | undefined
>(undefined);
