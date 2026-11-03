import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const spotify: DeepPartial<Translation["spotify"]> = {
    settings: {
        title: "Spotify",
        description: "เชื่อมต่อบัญชี Spotify เพื่อแสดงให้เพื่อนร่วมงานเห็นว่าคุณกำลังฟังอะไร",
        link: "เชื่อมต่อ Spotify",
        linking: "กำลังรอ Spotify…",
        unlink: "ยกเลิกการเชื่อมต่อ",
        linked: "บัญชี Spotify ของคุณเชื่อมต่อแล้ว",
        share: "แชร์สิ่งที่ฉันกำลังฟัง",
        desktopDetected: "อ่านจากแอป Spotify ในคอมพิวเตอร์เครื่องนี้ ไม่ต้องเชื่อมบัญชี ใช้บัญชีฟรีได้",
        desktopAppHint:
            "ใช้แอปเดสก์ท็อป WorkAdventure ไม่ต้องเชื่อมบัญชีหรือใช้ Premium: แอปจะอ่านจาก Spotify บน Mac ของคุณ",
        desktopAppLink: "ดาวน์โหลดแอปเดสก์ท็อป",
        serverAppNotice:
            "หากไม่มี Client ID ของตัวเอง การเชื่อมต่อจะใช้แอป Spotify ของเซิร์ฟเวอร์นี้: โปรดขอให้ผู้ดูแลเพิ่มบัญชี Spotify ของคุณก่อน (สูงสุด 5 คน)",
        accessDenied:
            "Spotify ปฏิเสธการแชร์สิ่งที่คุณกำลังฟัง: บัญชีของคุณยังไม่ได้ลงทะเบียนในแอป Spotify ของเซิร์ฟเวอร์นี้ โปรดขอให้ผู้ดูแลเพิ่มบัญชี (สูงสุด 5 คน) หรือใช้แอป Spotify ของคุณเอง",
        errors: {
            popupBlocked: "เบราว์เซอร์บล็อกหน้าต่าง Spotify โปรดอนุญาตป๊อปอัปสำหรับเว็บไซต์นี้แล้วลองอีกครั้ง",
            cancelled: "หน้าต่าง Spotify ถูกปิดก่อนการเชื่อมต่อจะเสร็จสิ้น",
            denied: "คุณปฏิเสธการเข้าถึงบน Spotify",
            failed: "ไม่สามารถเชื่อมต่อ Spotify ได้ โปรดตรวจสอบ Client ID และ Redirect URI ของแอป Spotify",
            noClientId: "เซิร์ฟเวอร์นี้ยังไม่ได้ตั้งค่าแอป Spotify: โปรดกรอก Client ID ของแอปของคุณเองด้านล่าง",
        },
        personalApp: {
            title: "ใช้แอป Spotify ของฉันเอง",
            explanation:
                "แอป Spotify รองรับได้เพียงห้าคน หากแอปของเซิร์ฟเวอร์นี้เต็มแล้ว คุณสามารถสร้างแอปของคุณเองได้ในไม่กี่นาที:",
            step1: "เปิด developer.spotify.com/dashboard แล้วสร้างแอป (ต้องใช้บัญชี Spotify Premium)",
            step2: "เพิ่ม Redirect URI นี้: {redirectUri}",
            step3: 'เลือก "Web API" บันทึก แล้ววาง Client ID ของแอปที่นี่',
            clientIdLabel: "Client ID ของแอปของฉัน",
            clientIdPlaceholder: "เว้นว่างไว้เพื่อใช้แอปของเซิร์ฟเวอร์นี้",
        },
    },
    card: {
        listeningNow: "กำลังฟัง",
        listenToo: "ฟังด้วย",
    },
    userList: {
        jam: "Jam · {area}",
        listenOnSpotify: "ฟังบน Spotify",
        listenOnAppleMusic: "ฟังบน Apple Music",
    },
    listeningZone: {
        defaultName: "โซนฟังเพลง",
        jamOf: "Jam ของ {name}",
        participants: "{count} คนใน Jam",
        join: "เข้าร่วม",
        joined: "อยู่ใน Jam",
        share: "แชร์ Jam ของฉัน",
        sharePlaceholder: "วางลิงก์เชิญเข้าร่วม Jam ของคุณ",
        invalidLink: "นี่ไม่ใช่ลิงก์เชิญเข้าร่วม Jam ของ Spotify",
        submit: "แชร์",
        cancel: "ยกเลิก",
        stop: "หยุดแชร์",
        noJam: "ยังไม่มีการแชร์ Jam ที่นี่",
        linkInvite: "เชื่อมต่อ Spotify เพื่อแชร์สิ่งที่คุณกำลังฟัง",
    },
};

export default spotify;
