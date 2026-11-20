import type { Subscription } from "rxjs";
import type { MeetingInvitationRequestReceivedMessage } from "@workadventure/messages";
import { AskPositionMessage_AskType } from "@workadventure/messages";
import { get } from "svelte/store";
import type { RoomConnection } from "../../Connection/RoomConnection";
import { meetingInvitationRequestStore, meetingInvitationRingEndStore } from "../../Stores/MeetingInvitationStore";
import { toastStore } from "../../Stores/ToastStoreSingleton";
import { gameManager } from "../../Phaser/Game/GameManager";
// Svelte component used for declined toast (runtime import for toastStore.addToast)
import MeetingInvitationDeclinedToast from "../../Components/MeetingInvitation/MeetingInvitationDeclinedToast.svelte";
import MeetingInvitationAcceptedToast from "../../Components/MeetingInvitation/MeetingInvitationAcceptToast.svelte";
import MeetingInvitationLimitToast from "../../Components/MeetingInvitation/MeetingInvitationLimitToast.svelte";
import MeetingInvitationMissedToast from "../../Components/MeetingInvitation/MeetingInvitationMissedToast.svelte";
import MeetingInvitationNoAnswerToast from "../../Components/MeetingInvitation/MeetingInvitationNoAnswerToast.svelte";
import { analyticsClient } from "../../Administration/AnalyticsClient";
import { isEffectShown } from "../../Stores/EffectsStore";
import { IncomingCall, INVITATION_TELEPORT_WAIT_MS, OutgoingCalls } from "./InvitationCall";

const MEETING_INVITATION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MEETING_INVITATION_MAX_REQUESTS = 50;
const MEETING_INVITATION_MAX_PER_USER = 3;

interface InviteRequestLogEntry {
    at: number;
    receiverUserUuid: string;
}

export class InviteManager {
    private subscriptions: Subscription[] = [];
    private inviteRequestLog: InviteRequestLogEntry[] = [];
    /** The invitations sent that still ring: "no answer" for the caller when they end. */
    private readonly outgoing = new OutgoingCalls((name) => this.showNoAnswerToast(name));
    /** The invitation received, ringing until it is answered or missed. */
    private readonly incoming = new IncomingCall(
        // The first ring always sounds; the next ones only for whom kept the ring of calls (see EffectsStore).
        (first) => {
            if (first || isEffectShown("callRing")) gameManager.getCurrentGameScene()?.playMeetingInSound();
        },
        () => this.missIncomingCall(),
    );
    /** Until when the position asked when accepting is a teleport to the caller (epoch ms). */
    private teleportUntil = 0;

    constructor(private connection: RoomConnection) {
        // Show meeting invitation request received toast when the meeting invitation request is received
        this.subscriptions.push(
            this.connection.meetingInvitationRequestReceivedStream.subscribe((payload) => {
                meetingInvitationRequestStore.set(payload);
                // It rings like a phone call, until it is answered or missed.
                meetingInvitationRingEndStore.set(this.incoming.start());
            }),
        );

        // Show accepted or declined toast when the meeting invitation response is received
        this.subscriptions.push(
            this.connection.meetingInvitationResponseReceivedStream.subscribe((payload) => {
                this.outgoing.answered(payload.responderName);
                if (!payload.accepted) {
                    const toastId = `meeting-invitation-declined-${Date.now()}`;
                    toastStore.addToast(
                        MeetingInvitationDeclinedToast,
                        {
                            responderName: payload.responderName,
                            toastUuid: toastId,
                        },
                        toastId,
                    );
                }
                if (payload.accepted) {
                    const toastId = `meeting-invitation-accepted-${Date.now()}`;
                    toastStore.addToast(
                        MeetingInvitationAcceptedToast,
                        {
                            responderName: payload.responderName,
                            toastUuid: toastId,
                        },
                        toastId,
                    );
                    // When the invitee accepts, reset the sender's antispam counter so they can send invites again
                    this.inviteRequestLog = [];
                }
            }),
        );

        // Show limit reached toast when the number of meeting invitation requests per sender is too high
        this.subscriptions.push(
            this.connection.meetingInvitationRequestTooHighStream.subscribe(() => {
                this.showLimitReachedToast();
            }),
        );

        // Clear the invitation if the user accepts or declines the invitation
        this.subscriptions.push(
            this.connection.meetingInvitationRequestClosedStream.subscribe(() => {
                this.stopIncomingCall();
            }),
        );

        // Clear the invitation if the user left the room
        this.subscriptions.push(
            this.connection.userLeftMessageStream.subscribe((payload) => {
                if (payload.userId === get(meetingInvitationRequestStore)?.senderUserId) {
                    this.stopIncomingCall();
                }
            }),
        );
    }

    public handleAccept(request: MeetingInvitationRequestReceivedMessage): void {
        this.stopIncomingCall();
        this.connection.emitMeetingInvitationResponse(true, request.senderUserUuid);
        // Answering takes one to the caller at once, as a call would: the position the server sends is a teleport.
        this.teleportUntil = Date.now() + INVITATION_TELEPORT_WAIT_MS;
        analyticsClient.trackAdminEvent("invite.accepted", { inviteType: "meeting" });
        // TODO: Change emitAskPosition to a server query to allow for error handling
        // NOTE: For now, if the user leaves while their position is being requested, nothing happens
        this.connection.emitAskPosition(
            request.senderUserUuid,
            request.senderPlayUri,
            AskPositionMessage_AskType.MOVE,
            request.senderUserId,
        );
    }

    public handleDecline(request: MeetingInvitationRequestReceivedMessage): void {
        this.stopIncomingCall();
        this.connection.emitMeetingInvitationResponse(false, request.senderUserUuid);
    }

    /**
     * Sends a meeting invitation request if antispam limits are not exceeded.
     * Limits: max 50 requests in 10 minutes, max 3 requests to the same user in 10 minutes.
     * Admins (moderators) are not subject to these limits.
     * @returns true if the request was sent, false if blocked by limits
     */
    public requestMeetingInvitation(receiverUserUuid: string, receiverUserId?: number, receiverName?: string): boolean {
        const isAdmin = this.connection.isAdmin();

        if (!isAdmin) {
            const now = Date.now();
            const cutoff = now - MEETING_INVITATION_WINDOW_MS;
            this.inviteRequestLog = this.inviteRequestLog.filter((e) => e.at > cutoff);

            if (this.inviteRequestLog.length >= MEETING_INVITATION_MAX_REQUESTS) {
                this.showLimitReachedToast();
                return false;
            }
            const toSameUser = this.inviteRequestLog.filter((e) => e.receiverUserUuid === receiverUserUuid).length;
            if (toSameUser >= MEETING_INVITATION_MAX_PER_USER) {
                this.showLimitReachedToast();
                return false;
            }

            this.inviteRequestLog.push({ at: now, receiverUserUuid });
        }

        this.connection.emitMeetingInvitationRequest(receiverUserUuid, receiverUserId);
        analyticsClient.trackAdminEvent("invite.sent", { inviteType: "meeting" });
        if (receiverName) this.outgoing.start(receiverName);
        return true;
    }

    /**
     * Whether the position just received answers an accepted invitation, to teleport there instead of walking. Taken
     * once: a later "go to" walks as usual.
     */
    public takePendingTeleport(now = Date.now()): boolean {
        const pending = now < this.teleportUntil;
        this.teleportUntil = 0;
        return pending;
    }

    private stopIncomingCall(): void {
        this.incoming.stop();
        meetingInvitationRequestStore.set(null);
        meetingInvitationRingEndStore.set(null);
    }

    /** Nobody answered in time: the invitation goes, a missed call stays, with a button to call back. */
    private missIncomingCall(): void {
        const request = get(meetingInvitationRequestStore);
        this.stopIncomingCall();
        if (!request) return;
        const toastId = `meeting-invitation-missed-${Date.now()}`;
        toastStore.addToast(
            MeetingInvitationMissedToast,
            {
                callerName: request.senderName,
                callerUuid: request.senderUserUuid,
                callerUserId: request.senderUserId,
                toastUuid: toastId,
            },
            toastId,
        );
    }

    private showNoAnswerToast(name: string): void {
        const toastId = `meeting-invitation-no-answer-${Date.now()}`;
        toastStore.addToast(MeetingInvitationNoAnswerToast, { responderName: name, toastUuid: toastId }, toastId);
    }

    private showLimitReachedToast(): void {
        const toastId = `meeting-invitation-limit-${Date.now()}`;
        toastStore.addToast(MeetingInvitationLimitToast, { toastUuid: toastId }, toastId);
    }

    public close(): void {
        this.subscriptions.forEach((s) => s.unsubscribe());
        this.subscriptions.length = 0;
        this.outgoing.close();
        this.stopIncomingCall();
    }
}
