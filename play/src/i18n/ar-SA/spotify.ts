import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const spotify: DeepPartial<Translation["spotify"]> = {
    settings: {
        title: "Spotify",
        description: "اربط حسابك في Spotify لتُظهر لزملائك ما تستمع إليه.",
        link: "ربط Spotify",
        linking: "في انتظار Spotify…",
        unlink: "إلغاء الربط",
        linked: "حسابك في Spotify مرتبط.",
        share: "مشاركة ما أستمع إليه",
        desktopDetected: "يُقرأ من تطبيق Spotify على هذا الحاسوب: لا حاجة لربط حساب، يكفي حساب Spotify مجاني.",
        desktopLinkOtherDevices:
            "لمشاركة الموسيقى التي تستمع إليها على جهاز آخر أيضًا (هاتف، مشغل الويب، مكبر صوت)، اربط حساب Spotify الخاص بك.",
        desktopAppHint:
            "مع تطبيق WorkAdventure لسطح المكتب لا حاجة لربط حساب ولا لـ Premium: يقرأ تطبيق Spotify على جهاز Mac.",
        desktopAppLink: "تنزيل تطبيق سطح المكتب",
        serverAppNotice:
            "بدون معرّف عميل خاص بك، يتم الربط عبر تطبيق Spotify الخاص بهذا الخادم: اطلب أولًا من أحد المسؤولين إضافة حسابك في Spotify إليه (5 أشخاص كحد أقصى).",
        accessDenied:
            "يرفض Spotify مشاركة ما تستمع إليه: حسابك غير مسجّل في تطبيق Spotify الخاص بهذا الخادم. اطلب من أحد المسؤولين إضافته (5 أشخاص كحد أقصى)، أو استخدم تطبيق Spotify الخاص بك.",
        errors: {
            popupBlocked: "حظر متصفحك نافذة Spotify. اسمح بالنوافذ المنبثقة لهذا الموقع ثم حاول مرة أخرى.",
            cancelled: "أُغلقت نافذة Spotify قبل إتمام الربط.",
            denied: "رفضتَ منح الوصول في Spotify.",
            failed: "تعذّر ربط Spotify. تحقّق من معرّف العميل وعنوان إعادة التوجيه لتطبيق Spotify.",
            noClientId: "لا يوجد تطبيق Spotify مُعدّ على هذا الخادم: أدخل أدناه معرّف العميل لتطبيقك الخاص.",
        },
        personalApp: {
            title: "استخدام تطبيق Spotify الخاص بي",
            explanation:
                "يقبل تطبيق Spotify خمسة أشخاص فقط. إذا كان تطبيق هذا الخادم ممتلئًا، أنشئ تطبيقك في بضع دقائق:",
            step1: "افتح developer.spotify.com/dashboard وأنشئ تطبيقًا (يلزم حساب Spotify Premium).",
            step2: "أضف عنوان إعادة التوجيه هذا: {redirectUri}",
            step3: 'فعّل "Web API" واحفظ، ثم الصق هنا معرّف العميل للتطبيق.',
            clientIdLabel: "معرّف العميل لتطبيقي",
            clientIdPlaceholder: "اتركه فارغًا لاستخدام تطبيق هذا الخادم",
        },
    },
    card: {
        listeningNow: "يستمع الآن",
        listenToo: "استمع أيضًا",
        listenAlong: "استمع معه",
        stopListeningAlong: "توقف عن الاستماع معه",
        playlist: "قائمة التشغيل: {name}",
        album: "الألبوم: {name}",
    },
    userList: {
        jam: "Jam · {area}",
        listenOnSpotify: "الاستماع على Spotify",
        listenOnAppleMusic: "الاستماع على Apple Music",
    },
    listeningZone: {
        defaultName: "منطقة الاستماع",
        jamOf: "Jam الخاص بـ {name}",
        participants: "{count} في الـ Jam",
        join: "انضمام",
        joined: "في الـ Jam",
        share: "مشاركة الـ Jam الخاص بي",
        sharePlaceholder: "الصق رابط الدعوة إلى الـ Jam",
        invalidLink: "هذا ليس رابط دعوة إلى Jam في Spotify.",
        submit: "مشاركة",
        cancel: "إلغاء",
        stop: "إيقاف المشاركة",
        noJam: "لم تتم مشاركة أي Jam هنا بعد.",
        linkInvite: "اربط Spotify لمشاركة ما تستمع إليه",
        homeJamOf: "جلسة {name} المنزلية",
        startHome: "بدء جلسة منزلية",
        stopHome: "إنهاء الجلسة المنزلية",
        joinHome: "الانضمام إلى الجلسة المنزلية",
        leaveHome: "مغادرة الجلسة المنزلية",
        homeQueueHint: "في Spotify، انقر بزر الماوس الأيمن على مقطع: «إضافة إلى الجلسة المنزلية».",
        homeDesktopOnly: "الجلسة المنزلية: مع تطبيق سطح المكتب وSpicetify فقط.",
        rooms: "{count} غرفة",
        leave: "مغادرة",
        createRoom: "فتح غرفة",
        chooseKind: "أي نوع من الغرف؟",
        kindSpotify: "Spotify",
        kindHome: "منزلية",
        kindSpotifyTitle: "جلسة Spotify",
        kindSpotifyDescription: "برابط دعوة جلستك. الصوت لدى الجميع يتطلب Premium.",
        kindHomeTitle: "جلسة منزلية",
        kindHomeDescription: "يشغّل Spotify لدى كل شخص مقاطعك، حتى المجاني. تطبيق سطح المكتب وSpicetify.",
        zoneFull: "هذه المنطقة ممتلئة: 6 غرف على الأكثر.",
    },
};

export default spotify;
