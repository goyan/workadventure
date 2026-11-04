import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const spotify: DeepPartial<Translation["spotify"]> = {
    settings: {
        title: "Spotify",
        description: "Spotify 계정을 연결하면 동료에게 듣고 있는 음악을 보여줄 수 있습니다.",
        link: "Spotify 연결",
        linking: "Spotify를 기다리는 중…",
        unlink: "연결 해제",
        linked: "Spotify 계정이 연결되었습니다.",
        share: "듣고 있는 음악 공유",
        desktopDetected: "이 컴퓨터의 Spotify 앱에서 읽어요. 계정 연결이 필요 없고 무료 계정으로도 충분해요.",
        desktopLinkOtherDevices:
            "다른 기기(휴대폰, 웹 플레이어, 스피커)에서 듣는 음악도 공유하려면 Spotify 계정을 연결하세요.",
        desktopAppHint: "WorkAdventure 데스크톱 앱이면 계정 연결도 Premium도 필요 없어요. Mac의 Spotify 앱에서 읽어요.",
        desktopAppLink: "데스크톱 앱 받기",
        serverAppNotice:
            "내 클라이언트 ID가 없으면 이 서버의 Spotify 앱으로 연결합니다. 먼저 관리자에게 Spotify 계정 추가를 요청하세요 (최대 5명).",
        accessDenied:
            "Spotify가 듣고 있는 음악의 공유를 거부했습니다. 계정이 이 서버의 Spotify 앱에 등록되어 있지 않습니다. 관리자에게 추가를 요청하거나 (최대 5명) 내 Spotify 앱을 사용하세요.",
        errors: {
            popupBlocked: "브라우저가 Spotify 창을 차단했습니다. 이 사이트의 팝업을 허용한 뒤 다시 시도하세요.",
            cancelled: "연결이 끝나기 전에 Spotify 창이 닫혔습니다.",
            denied: "Spotify에서 접근을 거부했습니다.",
            failed: "Spotify를 연결할 수 없습니다. Spotify 앱의 클라이언트 ID와 리디렉션 URI를 확인하세요.",
            noClientId:
                "이 서버에는 Spotify 앱이 설정되어 있지 않습니다. 아래에 직접 만든 앱의 클라이언트 ID를 입력하세요.",
        },
        personalApp: {
            title: "내 Spotify 앱 사용",
            explanation:
                "Spotify 앱은 다섯 명까지만 사용할 수 있습니다. 이 서버의 앱이 가득 찼다면 몇 분 만에 내 앱을 만들 수 있습니다:",
            step1: "developer.spotify.com/dashboard를 열고 앱을 만드세요 (Spotify Premium 계정이 필요합니다).",
            step2: "다음 리디렉션 URI를 추가하세요: {redirectUri}",
            step3: '"Web API"를 선택하고 저장한 뒤 앱의 클라이언트 ID를 여기에 붙여 넣으세요.',
            clientIdLabel: "내 앱의 클라이언트 ID",
            clientIdPlaceholder: "비워 두면 이 서버의 앱을 사용합니다",
        },
    },
    card: {
        listeningNow: "지금 듣는 중",
        listenToo: "같이 듣기",
        listenAlong: "함께 듣기",
        stopListeningAlong: "함께 듣기 중지",
        playlist: "플레이리스트: {name}",
        album: "앨범: {name}",
    },
    userList: {
        jam: "Jam · {area}",
        listenOnSpotify: "Spotify에서 듣기",
        listenOnAppleMusic: "Apple Music에서 듣기",
    },
    listeningZone: {
        defaultName: "청취 구역",
        jamOf: "{name}님의 Jam",
        participants: "Jam에 {count}명",
        join: "참여",
        joined: "참여 중",
        share: "내 Jam 공유",
        sharePlaceholder: "Jam 초대 링크를 붙여 넣으세요",
        invalidLink: "Spotify Jam 초대 링크가 아닙니다.",
        submit: "공유",
        cancel: "취소",
        stop: "공유 중지",
        noJam: "아직 이곳에서 공유된 Jam이 없습니다.",
        linkInvite: "Spotify를 연결해 듣고 있는 음악을 공유하세요",
        homeJamOf: "{name}의 홈 Jam",
        startHome: "홈 Jam 시작",
        stopHome: "홈 Jam 종료",
        joinHome: "홈 Jam 참여",
        leaveHome: "홈 Jam 나가기",
        homeQueueHint: 'Spotify에서 곡을 오른쪽 클릭: "홈 Jam에 추가".',
        homeDesktopOnly: "홈 Jam: 데스크톱 앱과 Spicetify에서만.",
    },
};

export default spotify;
