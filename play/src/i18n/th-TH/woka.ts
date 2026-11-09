import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const woka: DeepPartial<Translation["woka"]> = {
    vehicle: {
        centerColor: "ตรงกลาง",
        edgeColor: "ขอบ",
        wheelsColor: "ล้อ",
        title: "ยานพาหนะ",
        none: "ไม่มี",
        skateboard: "สเก็ตบอร์ด",
        hint: "กดทิศทางเดิมอย่างรวดเร็วสามครั้งเพื่อเล่นสเก็ตบอร์ด หรือเลือกจากวงล้อการกระทำ",
        mount: "ขึ้นสเก็ตบอร์ด",
        dismount: "ลงจากสเก็ตบอร์ด",
    },
    customWoka: {
        color: "สี",
        defaultColor: "สีเริ่มต้น",
        rotate: "หมุนตัวละคร",
        parts: {
            body: "ร่างกาย",
            eyes: "ดวงตา",
            hair: "ผม",
            clothes: "เสื้อผ้า",
            hat: "หมวก",
            accessory: "เครื่องประดับ",
        },
        bath: "ชุดว่ายน้ำ",
        bathHint: "สวมชุดว่ายน้ำเมื่ออยู่ในน้ำหรือห่างจากสระไม่เกินหนึ่งช่อง",
        title: "สร้าง WOKA ของคุณ",
        navigation: {
            finish: "เสร็จสิ้น",
            backToDefaultWoka: "กลับไปใช้ WOKA เริ่มต้น",
        },
        randomize: "สุ่ม",
    },
    selectWoka: {
        title: "เลือก WOKA ของคุณ",
        continue: "ดำเนินการต่อ",
        customize: "สร้าง WOKA ของคุณ",
        randomize: "เลือกแบบสุ่ม",
    },
    menu: {
        changeOutfit: "เปลี่ยนเสื้อผ้า",
        swimwear: "ชุดว่ายน้ำ",
        swimwearHint: "สวมใส่ในน้ำ",
        actions: "ท่าทางของตัวละครของฉัน",
        closeActions: "ปิดเมนูท่าทาง",
        profile: "ดูโปรไฟล์",
        businessCard: "นามบัตร",
    },
    swimwear: {
        auto: "ตามตัวละคร",
        shorts: "กางเกงว่ายน้ำ",
        twoPiece: "ชุดว่ายน้ำสองชิ้น",
    },
    actions: {
        idle: "หยุด",
        dance: "เต้น",
        coffee: "ดื่มกาแฟ",
        sleep: "นอน",
        toilet: "เข้าห้องน้ำ",
        run: "วิ่ง",
    },
    picker: {
        title: "คุณต้องการเลือกใคร?",
        self: "{name} (คุณ)",
    },
};

export default woka;
