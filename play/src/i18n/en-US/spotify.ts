import type { BaseTranslation } from "../i18n-types";

const spotify: BaseTranslation = {
    settings: {
        title: "Spotify",
        description: "Link your Spotify account to show your colleagues what you are listening to.",
        link: "Link Spotify",
        linking: "Waiting for Spotify…",
        unlink: "Unlink",
        linked: "Your Spotify account is linked.",
        share: "Share what I listen to",
        desktopDetected:
            "Read from the Spotify app of this computer: no account to link, a free Spotify account is enough.",
        desktopLinkOtherDevices:
            "To also share the music played on another device (phone, web player, speaker), link your Spotify account.",
        desktopAppHint:
            "No account to link or Premium needed with the WorkAdventure desktop app: it reads the Spotify app of your Mac.",
        desktopAppLink: "Get the desktop app",
        serverAppNotice:
            "Without a client ID of your own, you link through the Spotify app of this server: ask an administrator to add your Spotify account to it first (5 people at most).",
        accessDenied:
            "Spotify refuses to share what you listen to: your account is not registered in the Spotify app of this server. Ask an administrator to add it (5 people at most), or use your own Spotify app.",
        errors: {
            popupBlocked: "Your browser blocked the Spotify window. Allow pop-ups for this site and try again.",
            cancelled: "The Spotify window was closed before the link was made.",
            denied: "You refused access on Spotify.",
            failed: "Spotify could not be linked. Check the client ID and the redirect URI of the Spotify app.",
            noClientId: "No Spotify app is set up on this server: enter the client ID of your own app below.",
        },
        personalApp: {
            title: "Use my own Spotify app",
            explanation:
                "A Spotify app only accepts five people. If the app of this server is full, create your own in a few minutes:",
            step1: "Open developer.spotify.com/dashboard and create an app (a Spotify Premium account is required).",
            step2: "Add this redirect URI: {redirectUri}",
            step3: 'Tick "Web API", save, then paste the client ID of the app here.',
            clientIdLabel: "Client ID of my app",
            clientIdPlaceholder: "Leave empty to use the app of this server",
        },
    },
    card: {
        listeningNow: "Listening now",
        listenToo: "Listen too",
        listenAlong: "Listen along",
        stopListeningAlong: "Stop listening along",
        playlist: "Playlist: {name}",
        album: "Album: {name}",
    },
    userList: {
        jam: "Jam · {area}",
        listenOnSpotify: "Listen on Spotify",
        listenOnAppleMusic: "Listen on Apple Music",
    },
    listeningZone: {
        defaultName: "Listening zone",
        jamOf: "{name}'s Jam",
        participants: "{count} in the Jam",
        join: "Join",
        joined: "In the Jam",
        share: "Share my Jam",
        sharePlaceholder: "Paste the invite link of your Jam",
        invalidLink: "This is not a Spotify Jam invite link.",
        submit: "Share",
        cancel: "Cancel",
        stop: "Stop sharing",
        noJam: "No Jam is shared here yet.",
        linkInvite: "Link Spotify to share what you listen to",
        homeJamOf: "{name}'s home Jam",
        startHome: "Start a home Jam",
        stopHome: "End the home Jam",
        joinHome: "Join the home Jam",
        leaveHome: "Leave the home Jam",
        homeQueueHint: 'In Spotify, right-click a track: "Add to the home Jam".',
        homeDesktopOnly: "Home Jam: with the desktop app and Spicetify only.",
        rooms: "{count} room{{s}}",
        leave: "Leave",
        createRoom: "Open a room",
        chooseKind: "Which kind of room?",
        kindSpotify: "Spotify",
        kindHome: "Home",
        kindSpotifyTitle: "Spotify Jam",
        kindSpotifyDescription: "With your Jam's invite link. Sound on everyone's device with Premium.",
        kindHomeTitle: "Home Jam",
        kindHomeDescription: "Everyone's own Spotify plays your tracks, Free included. Desktop app and Spicetify.",
        zoneFull: "This zone is full: 6 rooms at most.",
    },
};

export default spotify;
