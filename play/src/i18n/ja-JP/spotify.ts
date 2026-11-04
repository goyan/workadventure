import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const spotify: DeepPartial<Translation["spotify"]> = {
    settings: {
        title: "Spotify",
        description: "Spotify アカウントを連携すると、聴いている曲を同僚に表示できます。",
        link: "Spotify を連携",
        linking: "Spotify を待っています…",
        unlink: "連携を解除",
        linked: "Spotify アカウントは連携済みです。",
        share: "聴いている曲を共有する",
        desktopDetected:
            "このコンピューターの Spotify アプリから読み取ります。アカウント連携は不要で、無料アカウントで使えます。",
        desktopLinkOtherDevices:
            "別のデバイス（スマートフォン、Web プレーヤー、スピーカー）で聴いている音楽も共有するには、Spotify アカウントを連携してください。",
        desktopAppHint:
            "WorkAdventure デスクトップアプリならアカウント連携も Premium も不要。Mac の Spotify アプリから読み取ります。",
        desktopAppLink: "デスクトップアプリを入手",
        serverAppNotice:
            "自分のクライアント ID がない場合は、このサーバーの Spotify アプリで連携します。先に管理者に Spotify アカウントの追加を依頼してください（最大 5 人）。",
        accessDenied:
            "Spotify が再生中の曲の共有を拒否しています。あなたのアカウントはこのサーバーの Spotify アプリに登録されていません。管理者に追加を依頼する（最大 5 人）か、自分の Spotify アプリを使ってください。",
        errors: {
            popupBlocked:
                "ブラウザが Spotify のウィンドウをブロックしました。このサイトのポップアップを許可して、もう一度お試しください。",
            cancelled: "連携が完了する前に Spotify のウィンドウが閉じられました。",
            denied: "Spotify でアクセスを拒否しました。",
            failed: "Spotify を連携できませんでした。Spotify アプリのクライアント ID とリダイレクト URI を確認してください。",
            noClientId:
                "このサーバーには Spotify アプリが設定されていません。下にご自身のアプリのクライアント ID を入力してください。",
        },
        personalApp: {
            title: "自分の Spotify アプリを使う",
            explanation:
                "Spotify アプリは 5 人までしか利用できません。このサーバーのアプリが満員の場合は、数分で自分のアプリを作成できます：",
            step1: "developer.spotify.com/dashboard を開いてアプリを作成します（Spotify Premium アカウントが必要です）。",
            step2: "次のリダイレクト URI を追加します：{redirectUri}",
            step3: "「Web API」にチェックを入れて保存し、アプリのクライアント ID をここに貼り付けます。",
            clientIdLabel: "自分のアプリのクライアント ID",
            clientIdPlaceholder: "空欄の場合はこのサーバーのアプリを使います",
        },
    },
    card: {
        listeningNow: "再生中",
        listenToo: "一緒に聴く",
        listenAlong: "一緒に聴く",
        stopListeningAlong: "一緒に聴くのをやめる",
    },
    userList: {
        jam: "Jam · {area}",
        listenOnSpotify: "Spotify で聴く",
        listenOnAppleMusic: "Apple Music で聴く",
    },
    listeningZone: {
        defaultName: "リスニングゾーン",
        jamOf: "{name} の Jam",
        participants: "Jam に {count} 人",
        join: "参加",
        joined: "参加中",
        share: "自分の Jam を共有",
        sharePlaceholder: "Jam の招待リンクを貼り付けてください",
        invalidLink: "Spotify の Jam の招待リンクではありません。",
        submit: "共有",
        cancel: "キャンセル",
        stop: "共有をやめる",
        noJam: "ここではまだ Jam が共有されていません。",
        linkInvite: "Spotify を連携して、聴いている曲を共有しましょう",
    },
};

export default spotify;
