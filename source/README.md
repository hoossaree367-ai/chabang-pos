# CHABANG POS (ร้านชาบัง, ต้นแบบจาก WITH YOU POS)

ร้าน: ชาบัง · Firebase project: `pos-chabang` · บัญชีร้าน: `chabang@pos.com` · กฎ Firestore อยู่ที่ `firestore.rules`

ความต่างจากต้นแบบ: แบบราคาเปลี่ยนจาก ร้อน/เย็น/ปั่น เป็น แก้ว/ถุง/ถัง/ปั่น/แก้วมาเอง 25 บาท (`TYPES` ใน `src/app.js`) · เมนูตั้งต้น 46 รายการจากใบเมนูร้าน · ชุดสีน้ำตาล-ส้มตามโลโก้ · เก็บข้อมูลในเครื่องด้วยคีย์ `chabang.*` แยกจาก `pos.*` ของ WITH YOU เพราะทั้งสองร้านอยู่โดเมน hoossaree367-ai.github.io เดียวกัน

## คู่มือเดิมจากต้นแบบ WITH YOU

POS ร้านกาแฟสำหรับ iPad เป็นเว็บแอปไฟล์เดียว เก็บข้อมูลใน Firebase และเผยแพร่ผ่าน GitHub Pages

คู่มือนี้เขียนให้ Claude ในโปรเจกต์ใหม่อ่านก่อนเริ่มทำ POS ให้ร้านอื่น โดยใช้โค้ดชุดนี้เป็นต้นแบบ

## ไฟล์หลัก

| ไฟล์ | หน้าที่ |
|---|---|
| `src/app.js` | การทำงานทั้งหมด ได้แก่ ขาย บิล รับเงิน พร้อมเพย์ QR ยอดขาย เมนู ตั้งค่า พิมพ์บิลผ่าน AirPrint ธีม และภาพเคลื่อนไหว |
| `src/template.html` | HTML และ CSS รวมถึงชุดสีที่ `:root` ทั้งโหมดสว่างและมืด หน้าล็อกอิน และโลโก้แบบ data URI |
| `src/backend.js` | ค่า `firebaseConfig`, Firebase Auth แบบอีเมลและรหัสผ่าน, Firestore ที่เก็บข้อมูลไว้ในเครื่องเมื่อออฟไลน์ |
| `src/sw.js` | service worker ให้เปิดแอปได้เมื่อไม่มีเน็ต ต้องเปลี่ยน `CACHE` ทุกครั้งที่เปลี่ยนไอคอน |
| `build.js` | รวมทุกไฟล์ด้วย esbuild เป็น `dist/index.html` ถ้ารันด้วย `node build.js fake` จะใช้ `test/fake-backend.js` แทน Firebase |
| `test/fake-backend.js` | ฐานข้อมูลจำลองในเบราว์เซอร์ ใช้ทดสอบโดยไม่ต้องต่อ Firebase รหัสผ่านทดสอบคือ `ok` |

## การ build และส่งขึ้นระบบ

```bash
npm i firebase@13.2.0 qrcode-generator@1.4.4 esbuild
node build.js          # ได้ dist/index.html
node build.js fake     # ได้ test/out/index.html สำหรับทดสอบ
```

ไฟล์ที่ต้องอยู่ชั้นนอกสุดของ repository เพื่อให้ GitHub Pages ใช้งานได้มี 5 ไฟล์ คือ `index.html`, `sw.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png` ส่วนโค้ดต้นฉบับเก็บไว้ในโฟลเดอร์ `source/`

## โครงข้อมูลใน Firestore

- `menu/{id}`: `{id, name, cat, prices:{ร้อน,เย็น,ปั่น,ราคาเดียว}, sweet, order, soldOut}`
- `config/shop`: `{name, promptpay, addons}`
- `days/{YYYY-MM-DD}/sales/{billId}`: `{id, day, no, ts, lines[], mode, sub, discount, total, pay, received, change, voided}`
- รายการจ่ายซื้อของ (เพิ่มในร้านชาบัง) เก็บในคอลเลกชันเดียวกัน: `days/{YYYY-MM-DD}/sales/{e…}`: `{id, kind:'expense', day, ts, item, amount, note, pay:'เงินสด', total:0, voided}` ส่วนสรุปยอดแยก `kind==='expense'` ออกจากบิล แล้วแสดงเป็นจ่ายซื้อของและเงินสดคงเหลือ
- เงินทอนตั้งต้นและปิดยอด (เพิ่มในร้านชาบัง) อยู่ในคอลเลกชันเดียวกัน: `o{YYYY-MM-DD}` = `{kind:'open', amount, staff}` และ `c{YYYY-MM-DD}` = `{kind:'close', counted, expected, diff, staff}` ใช้ id ตามวันจึงเขียนทับได้วันละรายการ · ทุกบิลและรายการจ่ายมีฟิลด์ `staff` จากชื่อพนักงานที่เลือกในเครื่อง (`chabang.staff`)

กฎความปลอดภัยใน Firestore ให้เฉพาะบัญชีร้านอ่านและเขียนได้

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null
        && request.auth.token.email == 'อีเมลบัญชีร้าน';
    }
  }
}
```

## สิ่งที่ต้องเปลี่ยนเมื่อทำให้ร้านใหม่

1. **`src/backend.js`:** ใส่ `firebaseConfig` ของร้านใหม่
2. **`src/app.js`:** เปลี่ยน `DEFAULT_CONFIG.name` เป็นชื่อร้าน และเปลี่ยน `SHOP_MENU` เป็นเมนูของร้าน ซึ่งใช้กับปุ่ม "นำเข้าเมนู" ที่จะขึ้นเมื่อยังไม่มีเมนู รวมถึงข้อความ "นำเข้าเมนู WITH YOU 43 รายการ"
3. **`src/template.html`:** เปลี่ยนสิ่งเหล่านี้
   - `<title>`, ชื่อร้านในหัวหน้าจอและหน้าล็อกอิน
   - โลโก้ในแท็ก `<img class="logo">` ทั้งสองจุด
   - ชุดสีใน `:root` และใน `[data-theme=dark]` ทั้งสองบล็อก
   - `theme-color`
4. **ไอคอนและ manifest:** ทำ `icon-192.png` และ `icon-512.png` จากโลโก้ร้านใหม่ แก้ชื่อและสีใน `manifest.webmanifest` แล้วเปลี่ยน `CACHE` ใน `src/sw.js`
5. **ตั้งค่าบริการ:** สร้าง Firebase project และ GitHub repository ใหม่ แยกจากร้าน WITH YOU ทั้งหมด

## สิ่งที่ต้องรักษาไว้

ระบบนี้ผ่านการตรวจรีวิวดีไซน์และการตรวจการเข้าถึงตาม WCAG 2.1 AA แล้ว เมื่อแก้สำหรับร้านใหม่ ควรคงสิ่งเหล่านี้ไว้

- ปุ่มทุกปุ่มสูงอย่างน้อย 44 px
- ปุ่มมีสถานะครบ คือ ปกติ ชี้ โฟกัส กด กำลังทำงาน และใช้ไม่ได้
- หน้าต่างย้ายโฟกัสเข้าไปเมื่อเปิด กด Tab วนอยู่ภายใน และกด Esc ปิดได้
- ปุ่มที่เลือกอยู่มี `aria-pressed`
- ภาพเคลื่อนไหวปิดอัตโนมัติเมื่อเครื่องตั้ง "ลดการเคลื่อนไหว"
- เมื่อเปลี่ยนชุดสี ต้องตรวจความต่างของตัวอักษรกับพื้นให้ได้อย่างน้อย 4.5:1 ทั้งโหมดสว่างและมืด

## งานที่คุยไว้แต่ยังไม่ได้ทำ

- พิมพ์ใบออเดอร์และใบเสร็จผ่าน Raspberry Pi โดย Pi รอรับงานพิมพ์จาก Firebase แล้วสั่งเครื่องพิมพ์ ESC/POS เป็นภาพ raster เพื่อให้ภาษาไทยไม่เพี้ยน
- สถานะบิลรอชำระ
- ระบบสต๊อกวัตถุดิบ

## แจ้งเตือนบนมือถือ (เพิ่มในร้านชาบัง)

- เครื่องที่เปิดรับแจ้งเตือนบันทึกที่ `push/{deviceId}` = `{id, token, prefs:{bill,void,expense,close}, device, name, ts}`
- เมื่อมีบิล ยกเลิก จ่ายซื้อของ หรือปิดยอด เครื่องที่ทำรายการส่ง `{idToken, tokens, title, body, tag}` ไปที่ลิงก์ Apps Script (`config/shop.pushUrl`)
- `notify-relay.gs` ตรวจ idToken ว่าเป็นบัญชีร้าน แล้วส่งผ่าน FCM HTTP v1 ด้วย service account ของเจ้าของ ส่วน `src/sw.js` รับ push แล้วแสดงแจ้งเตือน
- ไฟล์กุญแจ service account อยู่ใน Apps Script ของเจ้าของเท่านั้น ห้ามใส่ใน repo

## สต๊อกวัตถุดิบ (เพิ่มในร้านชาบัง)

- `stock/{id}` = `{id, name, status:'ok'|'low'|'out', order, at, by}` ไม่ตัดสต๊อกอัตโนมัติ พนักงานกดสถานะเอง
- เมื่อกด "ใกล้หมด" หรือ "หมด" จะส่งแจ้งเตือนประเภท `stock` (เครื่องที่เปิดแจ้งเตือนไว้ก่อนมีประเภทนี้จะได้รับโดยปริยาย)

## ต้นทุนและกำไร (เพิ่มในร้านชาบัง)

- `menu/{id}.costs` = ต้นทุนวัตถุดิบต่อแก้วแยกตามแบบราคา ใส่ได้ที่แท็บเมนู → ใส่ต้นทุน หรือในหน้าแก้ไขเมนู
- บรรทัดในบิลเก็บ `cost` ณ ตอนขาย ถ้าบิลเก่าไม่มี จะใช้ต้นทุนปัจจุบันของเมนูแทน
- หน้ายอดขายแสดงต้นทุนวัตถุดิบ กำไรขั้นต้น และกำไรรายเมนู ไม่นำ "จ่ายซื้อของ" มาหักซ้ำ
