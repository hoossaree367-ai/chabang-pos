# WITH YOU POS: คู่มือสำหรับนำไปทำร้านใหม่

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
