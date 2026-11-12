/**
 * CHABANG POS: ตัวส่งแจ้งเตือนบนมือถือ (วางใน Google Apps Script)
 *
 * สิ่งที่ต้องแก้มีจุดเดียว: วางเนื้อหาไฟล์กุญแจ (.json) ที่ดาวน์โหลดจาก Firebase
 * Project settings → Service accounts → Generate new private key
 * ลงแทน {} ในบรรทัด const SA = {} ด้านล่าง
 *
 * ไฟล์กุญแจเป็นความลับ อย่าส่งให้ใคร และอย่าใส่ใน GitHub
 * สคริปต์นี้อยู่ใน Google Drive ของเจ้าของร้านเท่านั้น
 */

const SA = {}; // ← วางเนื้อหาไฟล์ .json ทั้งหมดแทน {} (ตั้งแต่ { ถึง } ตัวสุดท้าย)

const SHOP_EMAIL = 'chabang@pos.com';
const API_KEY = 'AIzaSyAo79Ba45JpLmTpq-4cAdSCqLj0k6IFXlw';
const PROJECT = 'pos-chabang';

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    // ยืนยันว่าคนส่งล็อกอินด้วยบัญชีร้านจริง
    const who = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + API_KEY, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ idToken: req.idToken }), muteHttpExceptions: true
    });
    const users = JSON.parse(who.getContentText()).users;
    if (!users || users[0].email !== SHOP_EMAIL) return out({ ok: false, error: 'auth' });
    if (!SA.private_key) return out({ ok: false, error: 'ยังไม่ได้วางไฟล์กุญแจในสคริปต์' });

    const token = accessToken();
    const results = (req.tokens || []).slice(0, 20).map(function (t) {
      const r = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + PROJECT + '/messages:send', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify({ message: {
          token: t,
          data: { title: String(req.title || ''), body: String(req.body || ''), tag: String(req.tag || '') },
          webpush: { headers: { Urgency: 'high', TTL: '86400' } }
        } })
      });
      return r.getResponseCode();
    });
    return out({ ok: true, results: results });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function accessToken() {
  const cache = CacheService.getScriptCache(), hit = cache.get('fcm');
  if (hit) return hit;
  const now = Math.floor(Date.now() / 1000);
  const b64 = function (s) { return Utilities.base64EncodeWebSafe(s).replace(/=+$/, ''); };
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64(JSON.stringify({
    iss: SA.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  }));
  const sig = b64(Utilities.computeRsaSha256Signature(head + '.' + claim, SA.private_key));
  const res = JSON.parse(UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + sig }
  }).getContentText());
  cache.put('fcm', res.access_token, 3000);
  return res.access_token;
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
