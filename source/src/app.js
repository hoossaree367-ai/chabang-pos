import qrcode from 'qrcode-generator';
import {db as backendDb,onUser,login,logout,pushSupported,pushToken,idToken} from './backend.js';

/* ---------- pure helpers ---------- */
function crc16(s){let c=0xFFFF;for(let i=0;i<s.length;i++){c^=s.charCodeAt(i)<<8;for(let j=0;j<8;j++)c=(c&0x8000)?((c<<1)^0x1021)&0xFFFF:(c<<1)&0xFFFF}return c.toString(16).toUpperCase().padStart(4,'0')}
function tlv(id,v){return id+String(v.length).padStart(2,'0')+v}
function promptpayPayload(target,amount){
  const d=String(target).replace(/\D/g,'');let acc;
  if(d.length===10&&d[0]==='0')acc=tlv('01','0066'+d.slice(1));
  else if(d.length===13)acc=tlv('02',d);
  else if(d.length===15)acc=tlv('03',d);
  else return null;
  const body=tlv('00','01')+tlv('01',amount>0?'12':'11')+tlv('29',tlv('00','A000000677010111')+acc)+tlv('53','764')+(amount>0?tlv('54',Number(amount).toFixed(2)):'')+tlv('58','TH')+'6304';
  return body+crc16(body);
}
function cashChoices(t){const s=new Set();[20,50,100,500,1000].forEach(n=>{const v=Math.ceil(t/n)*n;if(v>t)s.add(v)});[100,500,1000].forEach(v=>{if(v>t)s.add(v)});return [...s].sort((a,b)=>a-b).slice(0,4)}
function lineTotal(l){return (l.price+(l.addons||[]).reduce((a,x)=>a+x.price,0))*l.qty}
function billTotals(lines,discount){const sub=lines.reduce((a,l)=>a+lineTotal(l),0);const disc=Math.min(Math.max(0,discount||0),sub);return {sub,disc,total:sub-disc}}
function parseAddons(t){return String(t||'').split('\n').map(s=>{const m=s.match(/^\s*(.+?)\s*[,，]\s*(\d+)\s*$/);return m?{name:m[1],price:+m[2]}:null}).filter(Boolean)}
const pad=n=>String(n).padStart(2,'0');
function dayKey(d=new Date()){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function shiftDay(k,n){const[y,m,d]=k.split('-').map(Number);return dayKey(new Date(y,m-1,d+n))}
function thaiDay(k){const[y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('th-TH',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}
const baht=n=>'฿'+Number(n||0).toLocaleString('en-US');
const sbaht=n=>(n<0?'−':'')+baht(Math.abs(n));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function lsGet(k,f){try{const v=localStorage.getItem(k);return v==null?f:JSON.parse(v)}catch(e){return f}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}

const TYPES=['แก้ว','ถุง/ถัง','ปั่น','แก้วมาเอง','ราคาเดียว'];
const OWN='แก้วมาเอง',OWN_PRICE=25;
const SWEET=['หวานปกติ','หวานน้อย','หวาน 25%','ไม่หวาน'];
const DEFAULT_CONFIG={name:'CHABANG',promptpay:'',addons:''};
const SHOP_MENU=[{"id": "m01", "name": "นมเย็น", "cat": "เมนูยอดนิยม", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 0}, {"id": "m02", "name": "ไมโลเย็น", "cat": "เมนูยอดนิยม", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 1}, {"id": "m03", "name": "ชาเขียวดำเย็น", "cat": "เมนูยอดนิยม", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 2}, {"id": "m04", "name": "โอเลี้ยงยกล้อ", "cat": "เมนูยอดนิยม", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 3}, {"id": "m05", "name": "ชาโบ", "cat": "เมนูยอดนิยม", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 4}, {"id": "m06", "name": "น้ำบ๊วย", "cat": "เมนูยอดนิยม", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 5}, {"id": "m07", "name": "โอเลี้ยง", "cat": "เมนูยอดนิยม", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 6}, {"id": "m08", "name": "ชาดำ", "cat": "เมนูยอดนิยม", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 7}, {"id": "m09", "name": "ชาเขียวมะนาว", "cat": "เมนูยอดนิยม", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 8}, {"id": "m10", "name": "แดง/เขียว มะนาว", "cat": "เมนูยอดนิยม", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 9}, {"id": "m11", "name": "แดง/เขียว โซดา", "cat": "เมนูยอดนิยม", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 10}, {"id": "m12", "name": "เนสโล", "cat": "เมนูพิเศษ", "prices": {"แก้ว": 35, "ถุง/ถัง": 45, "ปั่น": 50, "แก้วมาเอง": 25}, "sweet": true, "order": 11}, {"id": "m13", "name": "ชาโล", "cat": "เมนูพิเศษ", "prices": {"แก้ว": 35, "ถุง/ถัง": 45, "ปั่น": 50, "แก้วมาเอง": 25}, "sweet": true, "order": 12}, {"id": "m14", "name": "มอคค่า", "cat": "เมนูพิเศษ", "prices": {"แก้ว": 35, "ถุง/ถัง": 45, "ปั่น": 50, "แก้วมาเอง": 25}, "sweet": true, "order": 13}, {"id": "m15", "name": "มอคค่าโบราณ", "cat": "เมนูพิเศษ", "prices": {"แก้ว": 35, "ถุง/ถัง": 45, "ปั่น": 50, "แก้วมาเอง": 25}, "sweet": true, "order": 14}, {"id": "m16", "name": "ชาโกโก้", "cat": "เมนูพิเศษ", "prices": {"แก้ว": 35, "ถุง/ถัง": 45, "ปั่น": 50, "แก้วมาเอง": 25}, "sweet": true, "order": 15}, {"id": "m17", "name": "ชาเขียวโล", "cat": "เมนูพิเศษ", "prices": {"แก้ว": 35, "ถุง/ถัง": 45, "ปั่น": 50, "แก้วมาเอง": 25}, "sweet": true, "order": 16}, {"id": "m18", "name": "ชาเขียวโกโก้", "cat": "เมนูพิเศษ", "prices": {"แก้ว": 35, "ถุง/ถัง": 45, "ปั่น": 50, "แก้วมาเอง": 25}, "sweet": true, "order": 17}, {"id": "m19", "name": "นมสดเย็น", "cat": "เมนูพิเศษ", "prices": {"แก้ว": 35, "ถุง/ถัง": 45, "ปั่น": 50, "แก้วมาเอง": 25}, "sweet": true, "order": 18}, {"id": "m20", "name": "นมสดคาราเมล", "cat": "เมนูพิเศษ", "prices": {"แก้ว": 35, "ถุง/ถัง": 45, "ปั่น": 50, "แก้วมาเอง": 25}, "sweet": true, "order": 19}, {"id": "m21", "name": "นมสดวานิลา", "cat": "เมนูพิเศษ", "prices": {"แก้ว": 35, "ถุง/ถัง": 45, "ปั่น": 50, "แก้วมาเอง": 25}, "sweet": true, "order": 20}, {"id": "m22", "name": "ชาโคลน", "cat": "เมนูพิเศษ", "prices": {"แก้ว": 35, "ถุง/ถัง": 45, "ปั่น": 50, "แก้วมาเอง": 25}, "sweet": true, "order": 21}, {"id": "m23", "name": "โอดิบ", "cat": "เมนูพิเศษ", "prices": {"แก้ว": 35}, "sweet": true, "order": 22}, {"id": "m24", "name": "กีวี่โซดา", "cat": "อิตาเลี่ยนโซดา", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 23}, {"id": "m25", "name": "องุ่นโซดา", "cat": "อิตาเลี่ยนโซดา", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 24}, {"id": "m26", "name": "ลิ้นจี่โซดา", "cat": "อิตาเลี่ยนโซดา", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 25}, {"id": "m27", "name": "เสาวรสโซดา", "cat": "อิตาเลี่ยนโซดา", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 26}, {"id": "m28", "name": "แอปเปิ้ลโซดา", "cat": "อิตาเลี่ยนโซดา", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 27}, {"id": "m29", "name": "สตรอเบอร์รี่โซดา", "cat": "อิตาเลี่ยนโซดา", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 28}, {"id": "m30", "name": "บลูฮาวายโซดา", "cat": "อิตาเลี่ยนโซดา", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 29}, {"id": "m31", "name": "บลูเบอร์รี่โซดา", "cat": "อิตาเลี่ยนโซดา", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 30}, {"id": "m32", "name": "บ๊วยมะนาว", "cat": "อิตาเลี่ยนโซดา", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 31}, {"id": "m33", "name": "บ๊วยโซดา", "cat": "อิตาเลี่ยนโซดา", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 32}, {"id": "m34", "name": "บ๊วยมะนาวโซดา", "cat": "อิตาเลี่ยนโซดา", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 33}, {"id": "m35", "name": "ชาไทย", "cat": "เมนูแนะนำ", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 34}, {"id": "m36", "name": "เนสกาแฟ", "cat": "เมนูแนะนำ", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 35}, {"id": "m37", "name": "กาแฟโบราณ", "cat": "เมนูแนะนำ", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 36}, {"id": "m38", "name": "ชาเขียวนม", "cat": "เมนูแนะนำ", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 37}, {"id": "m39", "name": "ชานม", "cat": "เมนูแนะนำ", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 38}, {"id": "m40", "name": "ชามะนาว", "cat": "เมนูแนะนำ", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 39}, {"id": "m41", "name": "มะนาวโซดา", "cat": "เมนูแนะนำ", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 40}, {"id": "m42", "name": "แดง/เขียวมะนาวโซดา", "cat": "เมนูแนะนำ", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 41}, {"id": "m43", "name": "น้ำส้มคั้น", "cat": "เมนูแนะนำ", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 42}, {"id": "m44", "name": "โกโก้", "cat": "เมนูแนะนำ", "prices": {"แก้ว": 30, "ถุง/ถัง": 40, "ปั่น": 45, "แก้วมาเอง": 25}, "sweet": true, "order": 43}, {"id": "m45", "name": "อเมริกาโน", "cat": "เมนูแนะนำ", "prices": {"แก้ว": 40}, "sweet": true, "order": 44}, {"id": "m46", "name": "กาแฟส้ม", "cat": "เมนูแนะนำ", "prices": {"แก้ว": 40}, "sweet": true, "order": 45}];

/* ---------- state ---------- */
const S={tab:'sell',cat:'ทั้งหมด',menu:lsGet('chabang.menu',[]),config:{...DEFAULT_CONFIG,...lsGet('chabang.config',{})},
  cart:lsGet('chabang.cart',{lines:[],discount:0,mode:'ทานที่ร้าน'}),today:[],todayKey:dayKey(),viewDay:dayKey(),range:'day',dayCache:{},dayFetched:{},loading:false,loadErr:false,
  queue:lsGet('chabang.queue',[]),staff:lsGet('chabang.staff',''),stock:lsGet('chabang.stock',[]),push:[],pushId:lsGet('chabang.pushId',''),db:null,mode:'loading',menuLoaded:false,stale:false,downloads:null,modal:null,inflight:new Set()};
const saveCart=()=>lsSet('chabang.cart',S.cart);
const $=id=>document.getElementById(id);
function toast(t){$('toast').innerHTML='<div class="toast" role="status">'+esc(t)+'</div>';clearTimeout(toast.t);toast.t=setTimeout(()=>{$('toast').innerHTML=''},2600)}

/* ---------- data ---------- */
function salesOf(day){
  let base=day===S.todayKey?S.today:(S.dayCache[day]||[]);
  const m=new Map(base.map(x=>[x.id,x]));
  S.queue.filter(x=>x.day===day).forEach(x=>m.set(x.id,x));
  return [...m.values()].sort((a,b)=>b.ts-a.ts);
}
function writeSale(sale){
  S.queue=S.queue.filter(x=>x.id!==sale.id);S.queue.push(sale);lsSet('chabang.queue',S.queue);flush();
}
function flush(){
  if(!S.db)return;
  S.queue.forEach(sale=>{
    if(S.inflight.has(sale.id))return;S.inflight.add(sale.id);
    S.db.collection('days/'+sale.day+'/sales').doc(sale.id).set(sale).then(()=>{
      S.inflight.delete(sale.id);
      const cur=S.queue.find(x=>x.id===sale.id);
      if(cur===sale){S.queue=S.queue.filter(x=>x!==sale);lsSet('chabang.queue',S.queue);
        const list=sale.day===S.todayKey?S.today:(S.dayCache[sale.day]||null);
        if(list){const i=list.findIndex(x=>x.id===sale.id);if(i>=0)list[i]=sale;else list.push(sale)}
      }
      renderChrome();
    }).catch(e=>{S.inflight.delete(sale.id);toast(e&&e.code==='permission-denied'?'บัญชีนี้ยังไม่มีสิทธิ์บันทึกข้อมูล บิลยังอยู่ในเครื่องนี้':'ยังส่งบิลไม่สำเร็จ บิลยังอยู่ในเครื่องนี้และจะลองส่งใหม่');renderChrome()});
  });
  renderChrome();
}
function saveMenuItem(it){
  const i=S.menu.findIndex(x=>x.id===it.id);if(i>=0)S.menu[i]=it;else S.menu.push(it);sortMenu();lsSet('chabang.menu',S.menu);
  if(S.db)S.db.collection('menu').doc(it.id).set(it).catch(()=>toast('บันทึกเมนูไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง'));
}
function deleteMenuItem(id){S.menu=S.menu.filter(x=>x.id!==id);lsSet('chabang.menu',S.menu);if(S.db)S.db.collection('menu').doc(id).delete().catch(()=>toast('ลบเมนูไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง'))}
function saveConfig(patch){S.config={...S.config,...patch};lsSet('chabang.config',S.config);if(S.db)S.db.doc('config/shop').set(S.config).catch(()=>toast('บันทึกการตั้งค่าไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง'));renderChrome()}
function sortMenu(){S.menu.sort((a,b)=>(a.order??999)-(b.order??999)||a.name.localeCompare(b.name,'th'))}
function listenToday(){
  if(listenToday.u)listenToday.u();
  S.todayKey=dayKey();S.today=[];
  listenToday.u=S.db.collection('days/'+S.todayKey+'/sales').onSnapshot(s=>{S.today=s.docs.map(d=>({...d.data()}));if(S.tab==='sales'&&!S.modal)render()},deny);
}
function rangeDays(range,anchor){
  const[y,m,d]=anchor.split('-').map(Number);let out=[];
  if(range==='day')out=[anchor];
  else if(range==='week'){const dow=(new Date(y,m-1,d).getDay()+6)%7;for(let i=0;i<7;i++)out.push(dayKey(new Date(y,m-1,d-dow+i)))}
  else{const n=new Date(y,m,0).getDate();for(let i=1;i<=n;i++)out.push(dayKey(new Date(y,m-1,i)))}
  return out;
}
function shiftAnchor(range,anchor,n){
  if(range==='day')return shiftDay(anchor,n);
  if(range==='week')return shiftDay(anchor,7*n);
  const[y,m]=anchor.split('-').map(Number);return dayKey(new Date(y,m-1+n,1));
}
function rangeLabel(range,anchor){
  if(range==='day')return thaiDay(anchor);
  const days=rangeDays(range,anchor),dt=k=>{const[y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)};
  if(range==='month')return dt(days[0]).toLocaleDateString('th-TH',{month:'long',year:'numeric'});
  return dt(days[0]).toLocaleDateString('th-TH',{day:'numeric',month:'short'})+' – '+dt(days[6]).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});
}
function loadRange(){
  if(!S.db)return render();
  const now=Date.now(),need=rangeDays(S.range,S.viewDay).filter(d=>d<S.todayKey&&(!(d in S.dayCache)||now-(S.dayFetched[d]||0)>300000));
  S.loadErr=false;
  if(!need.length){S.loading=false;return render()}
  const token=loadRange.t=(loadRange.t||0)+1;S.loading=true;render();
  Promise.all(need.map(d=>S.db.collection('days/'+d+'/sales').get().then(s=>{S.dayCache[d]=s.docs.map(x=>({...x.data()}));S.dayFetched[d]=Date.now()}))).catch(()=>{if(token===loadRange.t)S.loadErr=true}).then(()=>{if(token===loadRange.t){S.loading=false;if(S.tab==='sales'&&!S.modal)render()}});
}
let unsubs=[];
function deny(e){if(e&&e.code==='permission-denied'){S.denied=true;S.menuLoaded=true;render()}}
function start(){
  const db=backendDb;S.db=db;S.mode='db';S.denied=false;S.menuLoaded=S.menu.length>0;
  const timer=setTimeout(()=>{S.stale=true;S.menuLoaded=true;render()},10000);
  unsubs.push(db.collection('menu').onSnapshot(s=>{
    if(!s.metadata.fromCache){clearTimeout(timer);S.stale=false;S.denied=false;S.menuLoaded=true}
    if(!s.metadata.fromCache||s.size){S.menu=s.docs.map(d=>({...d.data()}));sortMenu();lsSet('chabang.menu',S.menu)}
    if(!s.metadata.fromCache){S.menuServer=true;migrateOwn()}
    if(!S.modal)render();else renderChrome();
  },e=>{clearTimeout(timer);deny(e)}));
  unsubs.push(db.doc('config/shop').onSnapshot(s=>{if(!s.metadata||!s.metadata.fromCache)S.configLoaded=true;if(s.exists){S.config={...DEFAULT_CONFIG,...s.data()};migrateOwn();if(/with\s*you/i.test(S.config.name||'')){saveConfig({name:DEFAULT_CONFIG.name});toast('เปลี่ยนชื่อร้านเป็น '+DEFAULT_CONFIG.name+' แล้ว ตรวจเลขพร้อมเพย์ในแท็บตั้งค่าด้วย')}lsSet('chabang.config',S.config);renderChrome()}},deny));
  unsubs.push(db.collection('stock').onSnapshot(s=>{if(!s.metadata.fromCache||s.size){S.stock=s.docs.map(d=>({...d.data()})).sort((a,b)=>(a.order??999)-(b.order??999));lsSet('chabang.stock',S.stock)}renderChrome();if(S.tab==='stock'&&!S.modal)render()},()=>{}));
  unsubs.push(db.collection('push').onSnapshot(s=>{S.push=s.docs.map(d=>({...d.data()}));if(!syncPush.done){syncPush.done=true;syncPush()}if(S.tab==='config'&&!S.modal)render()},()=>{}));
  listenToday();flush();render();
}
/* ---------- push notifications ---------- */
const PUSH_KINDS=[['bill','ทุกบิล'],['void','ยกเลิกบิล'],['expense','จ่ายซื้อของ'],['close','ปิดยอด'],['stock','สต๊อกใกล้หมด/หมด']];
const pushMe=()=>S.pushId&&S.push.find(p=>p.id===S.pushId);
function deviceName(){const u=navigator.userAgent;return /iPad|Macintosh.*Mobile/.test(u)||(/Macintosh/.test(u)&&navigator.maxTouchPoints>1)?'iPad':/iPhone/.test(u)?'iPhone':/Android/.test(u)?'Android':'คอมพิวเตอร์'}
function sendPush(tokens,title,body,tag){
  const url=S.config.pushUrl;if(!url)return Promise.reject(new Error('nourl'));if(!tokens.length)return Promise.resolve({ok:true,results:[]});
  return idToken().then(it=>fetch(url,{method:'POST',body:JSON.stringify({idToken:it,tokens,title,body,tag})})).then(r=>r.json()).then(j=>{
    (j&&j.results||[]).forEach((c,i)=>{if(c===404){const d=S.push.find(x=>x.token===tokens[i]);if(d&&S.db)S.db.collection('push').doc(d.id).delete().catch(()=>{})}});return j});
}
function notify(kind,title,body,tag){
  if(!S.config.pushUrl||!navigator.onLine)return;
  const toks=S.push.filter(p=>p.id!==S.pushId&&p.prefs&&(p.prefs[kind]??kind==='stock')&&p.token).map(p=>p.token);
  if(toks.length)sendPush(toks,title,body,tag).catch(()=>{});
}
async function syncPush(){const me=pushMe();if(!me||!('Notification' in window)||Notification.permission!=='granted')return;
  try{const reg=await navigator.serviceWorker.ready,tok=await pushToken(reg);if(tok&&tok!==me.token)S.db.collection('push').doc(me.id).set({...me,token:tok,ts:Date.now()})}catch(e){}}
async function pushOn(){
  const ios=/iPhone|iPad/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1),standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  if(!('Notification' in window)||!('serviceWorker' in navigator)){toast(ios&&!standalone?'บน iPhone/iPad ต้องกดแชร์ แล้วเพิ่มไปยังหน้าจอโฮม จากนั้นเปิดแอปจากไอคอนก่อน':'เครื่องหรือเบราว์เซอร์นี้ยังรับการแจ้งเตือนไม่ได้');return}
  const perm=await Notification.requestPermission();
  if(perm!=='granted'){toast('ยังไม่ได้อนุญาตการแจ้งเตือน เปิดได้ที่การตั้งค่าของเครื่อง');return}
  if(!(await pushSupported())){toast(ios&&!standalone?'บน iPhone/iPad ต้องเปิดแอปจากไอคอนบนหน้าจอโฮม':'เบราว์เซอร์นี้ยังรับการแจ้งเตือนไม่ได้ ลองใช้ Chrome');return}
  try{const reg=await navigator.serviceWorker.ready,token=await pushToken(reg);
    const id=S.pushId||('d'+Date.now()+Math.random().toString(36).slice(2,6));S.pushId=id;lsSet('chabang.pushId',id);
    const old=S.push.find(p=>p.id===id);
    await S.db.collection('push').doc(id).set({id,token,prefs:old&&old.prefs||{bill:true,void:true,expense:true,close:true},device:deviceName(),name:S.staff||'',ts:Date.now()});
    toast('เปิดการแจ้งเตือนบนเครื่องนี้แล้ว');render()}
  catch(e){toast('เปิดการแจ้งเตือนไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง')}
}
function migrateOwn(){if(!S.menuServer||!S.configLoaded||S.config.ownCup||!S.menu.length)return;
  S.menu.filter(m=>m.prices&&m.prices['ปั่น']!=null&&m.prices[OWN]==null).forEach(m=>saveMenuItem({...m,prices:{...m.prices,[OWN]:OWN_PRICE}}));saveConfig({ownCup:true})}
function stop(){unsubs.forEach(u=>u());unsubs=[];if(listenToday.u){listenToday.u();listenToday.u=null}S.db=null}
function setInvalid(on){['l-email','l-pw'].forEach(id=>{const e=$(id);if(on){e.setAttribute('aria-invalid','true');e.setAttribute('aria-describedby','loginerr')}else{e.removeAttribute('aria-invalid');e.removeAttribute('aria-describedby')}})}
function boot(){
  ['l-email','l-pw'].forEach(id=>$(id).addEventListener('input',()=>{setInvalid(false);$('loginerr').textContent=''}));
  addEventListener('online',flush);addEventListener('offline',()=>{S.stale=true;renderChrome()});
  setInterval(()=>{if(!S.db)return;if(dayKey()!==S.todayKey){const was=S.viewDay===S.todayKey;listenToday();if(was)S.viewDay=S.todayKey}if(S.queue.length)flush()},30000);
  onUser(u=>{S.user=u;$('splash').hidden=true;$('login').hidden=!!u;document.querySelector('.app').hidden=!u;if(u){S.tab='sell';start();if(!S.staff)setTimeout(()=>{if(!S.modal)openModal({type:'staff'})},300)}else{stop();S.modal=null;$('modal').innerHTML=''}});
  $('loginform').addEventListener('submit',async e=>{e.preventDefault();e.stopPropagation();const b=$('loginbtn'),er=$('loginerr');b.disabled=true;b.classList.add('busy');b.textContent='กำลังเข้าสู่ระบบ';er.textContent='';
    try{await login($('l-email').value.trim(),$('l-pw').value);$('l-pw').value='';setInvalid(false)}catch(x){setInvalid(x.code!=='auth/network-request-failed'&&x.code!=='auth/too-many-requests');er.textContent=x.code==='auth/network-request-failed'?'เชื่อมต่ออินเทอร์เน็ตไม่ได้ ตรวจเน็ตแล้วลองอีกครั้ง':x.code==='auth/too-many-requests'?'ลองผิดหลายครั้งเกินไป รอสักครู่แล้วลองใหม่':'อีเมลหรือรหัสผ่านไม่ถูกต้อง'}
    b.disabled=false;b.classList.remove('busy');b.textContent='เข้าสู่ระบบ'});
}

/* ---------- render ---------- */
const THEMES={auto:{label:'อัตโนมัติ',next:'light',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>'},
 light:{label:'สว่าง',next:'dark',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'},
 dark:{label:'มืด',next:'auto',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>'}};
function themeMode(){const v=document.documentElement.getAttribute('data-theme');return v==='light'||v==='dark'?v:'auto'}
function applyTheme(m){if(m==='auto')document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme',m);try{localStorage.setItem('chabang.theme',m)}catch(e){}
  const dark=m==='dark'||(m==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);const meta=document.querySelector('meta[name=theme-color]');if(meta)meta.content=dark?'#1D2127':'#4D2420';renderTheme()}
function renderTheme(){const b=$('themebtn');if(!b)return;const m=themeMode(),t=THEMES[m];b.innerHTML=t.icon+'<span class="tl">'+t.label+'</span>';b.setAttribute('aria-label','ธีม '+t.label+' แตะเพื่อเปลี่ยนเป็น'+THEMES[t.next].label)}
function renderChrome(){
  renderTheme();
  $('brand').textContent=S.config.name||'CHABANG';
  const sb=$('staffbtn');if(sb){sb.innerHTML='<span class="sl">พนักงาน</span> <b>'+esc(S.staff||'ยังไม่ระบุ')+'</b>';sb.setAttribute('aria-label','พนักงานกะนี้ '+(S.staff||'ยังไม่ระบุ')+' แตะเพื่อเปลี่ยน')}
  document.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected',t.dataset.v===S.tab));
  const need=S.stock.filter(x=>x.status==='low'||x.status==='out').length,st=document.querySelector('.tab[data-v=stock]');
  if(st)st.innerHTML='สต๊อก'+(need?`<span class="badge" aria-label="ต้องซื้อ ${need} รายการ">${need}</span>`:'');
  $('sync').innerHTML=S.queue.length?'<span class="pill wait">รอส่ง '+S.queue.length+' รายการ</span>':S.stale?'<span class="pill wait">ออฟไลน์</span>':'';
  let n='';
  if(S.denied)n='<div class="notice"><span>บัญชีนี้ยังอ่านหรือบันทึกข้อมูลไม่ได้ ตรวจกฎ Firestore ว่าใส่อีเมลบัญชีร้านถูกต้องและกด Publish แล้ว</span></div>';
  $('notice').innerHTML=n;$('notice').hidden=!n;
  document.querySelector('.app').style.gridTemplateRows=n?'auto auto 1fr':'auto 1fr';
}
function render(){renderChrome();({sell:renderSell,sales:renderSales,menu:renderMenu,stock:renderStock,config:renderConfig})[S.tab]();renderModal()}
function priceLabel(p){return Object.entries(p).map(([k,v])=>k==='ราคาเดียว'?'<span><b>'+v+'</b></span>':'<span>'+k+' <b>'+v+'</b></span>').join('')}
function cats(){return ['ทั้งหมด',...new Set(S.menu.map(m=>m.cat||'อื่น ๆ'))]}
function renderSell(){
  const list=S.menu.filter(m=>S.cat==='ทั้งหมด'||m.cat===S.cat);
  const tile=m=>{
    if(m.soldOut)return `<div class="tile out"><span class="tn">${esc(m.name)}</span><span class="pill">หมด</span></div>`;
    const ps=Object.entries(m.prices);
    if(ps.length===1&&ps[0][0]==='ราคาเดียว')return `<div class="tile"><button class="tn" data-act="${m.sweet?'pick':'quick'}" data-id="${esc(m.id)}" data-t="ราคาเดียว">${esc(m.name)}</button><div class="pbs"><button class="pb" data-act="quick" data-id="${esc(m.id)}" data-t="ราคาเดียว" aria-label="${esc(m.name)} ${ps[0][1]} บาท"><b class="num">${ps[0][1]}</b></button></div></div>`;
    return `<div class="tile"><button class="tn" data-act="pick" data-id="${esc(m.id)}" aria-label="${esc(m.name)} เลือกความหวาน">${esc(m.name)}<span class="more" aria-hidden="true">⋯</span></button><div class="pbs${ps.length>3?' four':''}">${ps.map(([k,v])=>`<button class="pb" data-act="quick" data-id="${esc(m.id)}" data-t="${k}" aria-label="${esc(m.name)} ${k} ${v} บาท"><span>${k}</span> <b class="num">${v}</b></button>`).join('')}</div></div>`;
  };
  let grid;
  if(!list.length)grid=`<div class="empty" style="grid-column:1/-1">${S.menuLoaded?'<div>ยังไม่มีเมนู เพิ่มเมนูแรกแล้วเริ่มขายได้เลย</div><div class="chips"><button class="btn main" data-act="edit-menu">เพิ่มเมนู</button><button class="btn" data-act="starter">นำเข้าเมนูชาบัง 46 รายการ</button></div>':'<div>กำลังโหลดเมนู</div>'}</div>`;
  else if(S.cat==='ทั้งหมด')grid=cats().slice(1).map(c=>`<h2 class="gh">${esc(c)}</h2>`+list.filter(m=>(m.cat||'อื่น ๆ')===c).map(tile).join('')).join('');
  else grid=list.map(tile).join('');
  const t=billTotals(S.cart.lines,S.cart.discount);
  const lines=S.cart.lines.length?S.cart.lines.map((l,i)=>`<div class="line ${S.flash===i?'flash':''}"><button class="le" data-act="edit-line" data-i="${i}"><span>${esc(l.name)}</span><small>${esc([l.type,l.sweet,...(l.addons||[]).map(a=>a.name)].filter(Boolean).join(' · '))}</small></button><div class="amt num">${baht(lineTotal(l))}</div><div class="qty"><button data-act="qty" data-i="${i}" data-d="-1" aria-label="ลดจำนวน">−</button><span class="num"><span class="sr">จำนวน </span>${l.qty}<span class="sr"> แก้ว</span></span><button data-act="qty" data-i="${i}" data-d="1" aria-label="เพิ่มจำนวน">+</button></div></div>`).join(''):'<div class="empty">แตะเมนูเพื่อเริ่มบิล</div>';
  const scroll=document.querySelector('.grid')?.scrollTop||0;
  $('view').innerHTML=`<div class="sell"><section class="menu-side"><div class="cats">${cats().map(c=>`<button class="cat ${c===S.cat?'on':''}" data-act="cat" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div><div class="grid${S.swap?' swap':''}">${grid}</div></section>
  <aside class="bill"><div class="bill-h"><h2>บิลปัจจุบัน</h2><div class="seg">${['ทานที่ร้าน','กลับบ้าน'].map(m=>`<button class="${S.cart.mode===m?'on':''}" data-act="mode" data-v="${m}">${m}</button>`).join('')}</div></div>
  <div class="lines">${lines}</div>
  <div class="bill-f"><div class="row"><span class="muted">รวม</span><span class="num">${baht(t.sub)}</span></div>
  <div class="row"><button class="sbtn" data-act="discount">ส่วนลด</button><span class="num">${t.disc?'−'+baht(t.disc):'—'}</span></div>
  <div class="row"><span>ยอดชำระ</span><span class="total num${S.bump?' bump':''}">${baht(t.total)}</span></div>
  <div class="pay"><button class="btn main" data-act="cash" ${S.cart.lines.length?'':'disabled'}>เงินสด</button><button class="btn main" data-act="qr" ${S.cart.lines.length?'':'disabled'}>พร้อมเพย์</button></div>
  ${S.cart.lines.length?'<button class="sbtn danger" data-act="clear">ล้างบิล</button>':'<div class="pay"><button class="sbtn" data-act="expense">จ่ายเงินซื้อของ</button><button class="sbtn" data-act="float">'+(summary([S.todayKey]).open?'เงินทอนตั้งต้น':'ใส่เงินทอนตั้งต้น')+'</button></div>'}</div></aside></div>
  ${S.cart.lines.length?`<button class="minibar" data-act="to-bill" aria-label="ดูบิล ${S.cart.lines.reduce((a,l)=>a+l.qty,0)} รายการ ยอด ${t.total} บาท"><span class="mb-n num">${S.cart.lines.reduce((a,l)=>a+l.qty,0)}</span><span class="mb-t">ดูบิลและรับเงิน</span><span class="mb-v num">${baht(t.total)}</span></button>`:''}`;
  watchBill();
  const g=document.querySelector('.grid');if(g)g.scrollTop=scroll;
}
function watchBill(){
  if(watchBill.o)watchBill.o.disconnect();const b=document.querySelector('.bill'),m=document.querySelector('.minibar');if(!b||!m||!window.IntersectionObserver)return;
  watchBill.o=new IntersectionObserver(es=>{const v=es[0].isIntersecting;m.classList.toggle('away',v);m.setAttribute('aria-hidden',v?'true':'false');m.tabIndex=v?-1:0},{threshold:.35});watchBill.o.observe(b);
}
function isCup(l){return l.type==='แก้ว'||l.type==='ถุง/ถัง'||l.type==='ปั่น'||l.type===OWN}
function catOf(l){if(l.cat)return l.cat;const m=S.menu.find(x=>x.id===l.mid&&x.name===l.name)||S.menu.find(x=>x.name===l.name);return m&&m.cat||'อื่น ๆ'}
function summary(days){
  const every=days.flatMap(d=>salesOf(d)),all=every.filter(s=>!s.kind),ok=all.filter(s=>!s.voided);
  const expenses=every.filter(s=>s.kind==='expense'),exp=expenses.filter(s=>!s.voided).reduce((a,s)=>a+(s.amount||0),0);
  const r={all,ok,expenses,exp,total:0,cash:0,qr:0,cups:0,hot:0,iced:0,frappe:0,own:0,pieces:0,drinkAmt:0,items:{},cats:{},hours:{},perDay:{}};
  days.forEach(d=>{r.perDay[d]={cups:0,total:0,bills:0}});
  ok.forEach(s=>{
    r.total+=s.total;if(s.pay==='เงินสด')r.cash+=s.total;else r.qr+=s.total;
    const h=new Date(s.ts).getHours();r.hours[h]=(r.hours[h]||0)+s.total;
    const pd=r.perDay[s.day]||(r.perDay[s.day]={cups:0,total:0,bills:0});pd.total+=s.total;pd.bills++;
    s.lines.forEach(l=>{
      const amt=lineTotal(l),cup=isCup(l),c=catOf(l);
      const it=r.items[l.name]||(r.items[l.name]={qty:0,amt:0,hot:0,iced:0,frappe:0,own:0,other:0,cup});
      it.qty+=l.qty;it.amt+=amt;if(l.type==='แก้ว')it.hot+=l.qty;else if(l.type==='ถุง/ถัง')it.iced+=l.qty;else if(l.type==='ปั่น')it.frappe+=l.qty;else if(l.type===OWN)it.own+=l.qty;else it.other+=l.qty;
      const ct=r.cats[c]||(r.cats[c]={qty:0,amt:0,cup:false});ct.qty+=l.qty;ct.amt+=amt;if(cup)ct.cup=true;
      if(cup){r.cups+=l.qty;r.drinkAmt+=amt;pd.cups+=l.qty;if(l.type==='แก้ว')r.hot+=l.qty;else if(l.type==='ถุง/ถัง')r.iced+=l.qty;else if(l.type===OWN)r.own+=l.qty;else r.frappe+=l.qty}else r.pieces+=l.qty;
    });
  });
  const live=k=>every.filter(s=>s.kind===k&&!s.voided).sort((a,b)=>b.ts-a.ts)[0];
  r.open=days.length===1?live('open'):null;r.close=days.length===1?live('close'):null;
  r.float=r.open?r.open.amount:0;r.drawer=r.float+r.cash-r.exp;
  r.staff={};ok.forEach(s=>{const n=s.staff||'ไม่ระบุ',x=r.staff[n]||(r.staff[n]={bills:0,total:0});x.bills++;x.total+=s.total});
  r.itemList=Object.entries(r.items).sort((a,b)=>b[1].qty-a[1].qty);
  r.catList=Object.entries(r.cats).sort((a,b)=>b[1].qty-a[1].qty);
  return r;
}
function renderSales(){
  const R=S.range,d=S.viewDay,days=rangeDays(R,d),r=summary(days);
  const nextDisabled=rangeDays(R,shiftAnchor(R,d,1))[0]>S.todayKey;
  const hs=Object.keys(r.hours).map(Number),h0=Math.min(6,...hs),h1=Math.max(20,...hs),maxH=Math.max(1,...Object.values(r.hours));
  const range=[];for(let h=h0;h<=h1;h++)range.push(h);
  const maxC=Math.max(1,...days.map(x=>r.perDay[x].cups));
  const dayNum=k=>+k.split('-')[2];
  const chart=R==='day'
   ?`<section class="panel"><h3>ยอดรายชั่วโมง</h3><div class="muted">สูงสุด <span class="num">${r.ok.length?baht(maxH):'—'}</span></div><div class="bars" role="img" aria-label="${esc('ยอดรายชั่วโมง '+(range.filter(h=>r.hours[h]).map(h=>h+' นาฬิกา '+baht(r.hours[h])).join(', ')||'ยังไม่มีการขาย'))}">${range.map(h=>`<div style="height:${(r.hours[h]||0)/maxH*100}%" title="${h}:00 ${baht(r.hours[h]||0)}"></div>`).join('')}</div><div class="axis num">${range.map(h=>`<span>${h%2===0?h:''}</span>`).join('')}</div></section>`
   :`<section class="panel"><h3>จำนวนแก้วรายวัน</h3><div class="muted">สูงสุด <span class="num">${r.cups?maxC+' แก้ว':'—'}</span></div><div class="bars" role="img" aria-label="${esc('จำนวนแก้วรายวัน '+(days.filter(x=>r.perDay[x].cups).map(x=>thaiDay(x)+' '+r.perDay[x].cups+' แก้ว').join(', ')||'ยังไม่มีการขาย'))}">${days.map(x=>`<div style="height:${r.perDay[x].cups/maxC*100}%" title="${thaiDay(x)} ${r.perDay[x].cups} แก้ว"></div>`).join('')}</div><div class="axis num">${days.map((x,i)=>`<span>${R==='week'||i%3===0?dayNum(x):''}</span>`).join('')}</div></section>`;
  const maxCat=Math.max(1,...r.catList.map(x=>x[1].qty));
  const cats=r.catList.length?`<div class="catbars">${r.catList.map(([n,c])=>`<span class="cn">${esc(n)}</span><div class="ct"><div style="width:${c.qty/maxCat*100}%"></div></div><span class="num">${c.qty} ${c.cup?'แก้ว':'ชิ้น'}</span><span class="num">${baht(c.amt)}</span>`).join('')}</div>`:'<div class="muted">ยังไม่มีการขายในช่วงนี้</div>';
  const fr=r.itemList.some(x=>x[1].frappe),ow=r.itemList.some(x=>x[1].own),ot=r.itemList.some(x=>x[1].other);
  const cell=n=>`<td class="num">${n||'–'}</td>`;
  const table=r.itemList.length?`<div class="tw"><table class="tb"><thead><tr><th>เมนู</th><th>แก้ว</th><th>ถุง/ถัง</th>${fr?'<th>ปั่น</th>':''}${ow?'<th>แก้วมาเอง</th>':''}${ot?'<th>อื่น ๆ</th>':''}<th>รวม</th><th>ยอด</th></tr></thead><tbody>${r.itemList.map(([n,x])=>`<tr><td>${esc(n)}</td>${cell(x.hot)}${cell(x.iced)}${fr?cell(x.frappe):''}${ow?cell(x.own):''}${ot?cell(x.other):''}<td class="num"><b>${x.qty}</b></td><td class="num">${baht(x.amt)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="muted">ยังไม่มีการขายในช่วงนี้</div>';
  const typeLine=[r.hot&&'แก้ว '+r.hot,r.iced&&'ถุง/ถัง '+r.iced,r.frappe&&'ปั่น '+r.frappe,r.own&&'แก้วมาเอง '+r.own].filter(Boolean).join(' · ')||'ยังไม่มีการขาย';
  const bills=R==='day'
   ?`<section class="panel"><h3>บิลทั้งหมด</h3>${r.all.length?'<div class="list">'+r.all.map(s=>`<div class="li"><span class="num">#${s.no}</span><div class="g"><span class="${s.voided?'voided':''}">${esc(s.lines.map(l=>l.name+(l.qty>1?' ×'+l.qty:'')).join(', '))}</span><small>${new Date(s.ts).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})} น. · ${esc(s.pay)} · ${esc(s.mode||'')}${s.staff?' · '+esc(s.staff):''}</small></div>${s.voided?'<span class="pill">ยกเลิกแล้ว</span>':`<strong class="num">${baht(s.total)}</strong><button class="link" data-act="print" data-id="${s.id}">พิมพ์</button><button class="link danger" data-act="void" data-id="${s.id}">ยกเลิก</button>`}</div>`).join('')+'</div>':'<div class="muted">บิลของวันนี้จะแสดงที่นี่หลังปิดการขายบิลแรก</div>'}</section>`
   :`<section class="panel"><h3>แยกรายวัน</h3><div class="list">${days.filter(x=>x<=S.todayKey).reverse().map(x=>`<button class="li" data-act="open-day" data-v="${x}"><div class="g">${thaiDay(x)}<small>${r.perDay[x].bills} บิล</small></div><span class="num">${r.perDay[x].cups} แก้ว</span><strong class="num">${baht(r.perDay[x].total)}</strong></button>`).join('')}</div></section>`;
  const scroll=document.querySelector('#view .scroll')?.scrollTop||0;
  $('view').innerHTML=`<div class="scroll"><div class="narrow">
  <div class="daybar"><div class="seg">${[['day','วัน'],['week','สัปดาห์'],['month','เดือน']].map(([k,t])=>`<button class="${R===k?'on':''}" data-act="range" data-v="${k}">${t}</button>`).join('')}</div>
  <button class="iconbtn" data-act="day" data-d="-1" aria-label="ช่วงก่อนหน้า">‹</button><button class="iconbtn" data-act="day" data-d="1" aria-label="ช่วงถัดไป" ${nextDisabled?'disabled':''}>›</button><h2>${rangeLabel(R,d)}</h2>
  <button class="btn" data-act="copy-summary">คัดลอกสรุป</button><button class="btn" data-act="csv">ส่งออก CSV</button></div>
  ${S.loadErr?'<div class="notice">โหลดยอดบางวันไม่สำเร็จ ตัวเลขอาจไม่ครบ ตรวจอินเทอร์เน็ตแล้วเปิดแท็บนี้ใหม่</div>':S.loading?'<div class="muted">กำลังโหลดยอดขาย</div>':''}
  <div class="kpis"><div class="hero"><label>จำนวนแก้วรวม</label><strong class="num">${r.cups.toLocaleString('en-US')} แก้ว</strong><small>${typeLine}</small></div>
  <div><label>ยอดขาย</label><strong class="num">${baht(r.total)}</strong><small>${r.cups?'เฉลี่ย '+baht(Math.round(r.drinkAmt/r.cups))+' ต่อแก้ว':'—'}</small></div>
  <div><label>จำนวนบิล</label><strong class="num">${r.ok.length.toLocaleString('en-US')} บิล</strong><small>${r.ok.length?'เฉลี่ย '+(r.cups/r.ok.length).toFixed(1)+' แก้วต่อบิล':'—'}</small></div></div>
  <div class="payrow"><span>เงินสด <b class="num">${baht(r.cash)}</b></span><span>พร้อมเพย์ <b class="num">${baht(r.qr)}</b></span>${r.exp?`<span>จ่ายซื้อของ <b class="num">−${baht(r.exp)}</b></span>`:''}${r.pieces?`<span>ของอื่นที่ไม่นับเป็นแก้ว <b class="num">${r.pieces} ชิ้น</b></span>`:''}</div>
  <div class="two">${chart}<section class="panel"><h3>แยกตามหมวด</h3>${cats}</section></div>
  <section class="panel"><h3>ทุกเมนูที่ขาย</h3>${table}</section>
  ${R==='day'?drawerPanel(r):''}
  ${staffPanel(r)}
  ${bills}
  ${expPanel(r,R)}
  </div></div>`;
  const sc=document.querySelector('#view .scroll');if(sc)sc.scrollTop=scroll;
}
function drawerPanel(r){
  const c=r.close,row=(a,b)=>`<div class="row"><span>${a}</span><span class="num">${b}</span></div>`;
  const res=c?`<div class="notice" style="margin-top:8px"><span>ปิดยอดแล้ว ${new Date(c.ts).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})} น.${c.staff?' โดย '+esc(c.staff):''} · นับได้ <b class="num">${baht(c.counted)}</b> · ${c.diff===0?'<b>ตรงพอดี</b>':c.diff<0?`<b>ขาด ${baht(-c.diff)}</b>`:`<b>เกิน ${baht(c.diff)}</b>`}${c.diff!==0&&c.expected!==r.drawer?' (มีรายการเปลี่ยนหลังปิดยอด ควรนับใหม่)':''}</span></div>`:'';
  return `<section class="panel"><div class="daybar"><h3 style="margin:0">เงินในลิ้นชัก</h3><button class="btn" data-act="float" style="margin-left:auto">${r.open?'แก้เงินทอนตั้งต้น':'ใส่เงินทอนตั้งต้น'}</button><button class="btn main" data-act="close-day">${c?'นับเงินใหม่':'ปิดยอด นับเงิน'}</button></div>
  ${row('เงินทอนตั้งต้น'+(r.open&&r.open.staff?' ('+esc(r.open.staff)+')':''),r.open?baht(r.float):'ยังไม่ได้ใส่')}${row('+ ขายเงินสด',baht(r.cash))}${row('− จ่ายซื้อของ',baht(r.exp))}
  <div class="row"><b>ควรมีในลิ้นชัก</b><b class="num">${sbaht(r.drawer)}</b></div>${res}</section>`;
}
function staffPanel(r){const l=Object.entries(r.staff);if(!l.length||(l.length===1&&l[0][0]==='ไม่ระบุ'))return '';
  return `<section class="panel"><h3>แยกตามพนักงาน</h3><div class="list">${l.sort((a,b)=>b[1].total-a[1].total).map(([n,x])=>`<div class="li"><div class="g">${esc(n)}</div><span class="num">${x.bills} บิล</span><strong class="num">${baht(x.total)}</strong></div>`).join('')}</div></section>`}
function staffNames(){const s=new Set(lsGet('chabang.staffList',[]));return [...s].slice(0,8)}
function setStaff(n){S.staff=n;lsSet('chabang.staff',n);const l=[n,...lsGet('chabang.staffList',[]).filter(x=>x!==n)].slice(0,8);lsSet('chabang.staffList',l);renderChrome()}
function expPanel(r,R){
  const head=`<div class="daybar"><h3 style="margin:0">จ่ายเงินซื้อของ</h3><button class="btn" data-act="expense" style="margin-left:auto">บันทึกจ่ายซื้อของ</button></div>`;
  const sum=r.exp?`<div class="muted">รวม <b class="num">${baht(r.exp)}</b> หักจากเงินสดในลิ้นชักแล้ว</div>`:'';
  if(R!=='day')return `<section class="panel">${head}${sum||'<div class="muted">ไม่มีรายการจ่ายซื้อของในช่วงนี้</div>'}</section>`;
  return `<section class="panel">${head}${r.expenses.length?sum+'<div class="list">'+r.expenses.map(s=>`<div class="li"><div class="g"><span class="${s.voided?'voided':''}">${esc(s.item)}</span><small>${new Date(s.ts).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})} น.${s.staff?' · '+esc(s.staff):''}${s.note?' · '+esc(s.note):''}</small></div>${s.voided?'<span class="pill">ยกเลิกแล้ว</span>':`<strong class="num">−${baht(s.amount)}</strong><button class="link danger" data-act="void" data-id="${s.id}">ยกเลิก</button>`}</div>`).join('')+'</div>':'<div class="muted">เมื่อหยิบเงินในลิ้นชักไปซื้อของ ให้บันทึกที่นี่ ยอดเงินสดคงเหลือจะหักให้อัตโนมัติ</div>'}</section>`;
}
function expenseNames(){const seen=new Set(),out=[];Object.values(S.dayCache).flat().concat(S.today,S.queue).filter(s=>s&&s.kind==='expense'&&!s.voided).sort((a,b)=>b.ts-a.ts).forEach(s=>{if(!seen.has(s.item)){seen.add(s.item);out.push(s.item)}});return out.slice(0,8)}
function menuGroups(){return cats().slice(1).map(c=>[c,S.menu.filter(m=>(m.cat||'อื่น ๆ')===c)])}
function applyOrder(groups){let i=0;const ch=[];groups.forEach(([,items])=>items.forEach(m=>{if(m.order!==i)ch.push({...m,order:i});i++}));ch.forEach(saveMenuItem)}
function renderReorder(){
  const g=menuGroups(),arrow=(act,v,d,dis,label)=>`<button class="iconbtn" data-act="${act}" data-v="${esc(v)}" data-d="${d}" ${dis?'disabled':''} aria-label="${esc(label)}">${d<0?'▲':'▼'}</button>`;
  $('view').innerHTML=`<div class="scroll"><div class="narrow"><div class="daybar"><h2>จัดลำดับเมนู</h2><button class="btn main" data-act="reorder" style="margin-left:auto">เสร็จแล้ว</button></div>
  <p class="muted">กด ▲ ▼ เพื่อเลื่อน ลำดับนี้ใช้กับหน้าขายทุกเครื่อง</p>
  ${g.map(([c,items],gi)=>`<section class="panel"><div class="daybar"><h3 style="margin:0">${esc(c)}</h3><span style="margin-left:auto"></span>${arrow('cat-move',c,-1,gi===0,'เลื่อนหมวด '+c+' ขึ้น')}${arrow('cat-move',c,1,gi===g.length-1,'เลื่อนหมวด '+c+' ลง')}</div>
  <div class="list">${items.map((m,i)=>`<div class="li"><span class="num muted">${i+1}</span><div class="g">${esc(m.name)}</div>${arrow('item-move',m.id,-1,i===0,'เลื่อน '+m.name+' ขึ้น')}${arrow('item-move',m.id,1,i===items.length-1,'เลื่อน '+m.name+' ลง')}</div>`).join('')}</div></section>`).join('')}
  </div></div>`;
}
function renderMenu(){
  if(S.reorder)return renderReorder();
  $('view').innerHTML=`<div class="scroll"><div class="narrow"><div class="daybar"><h2>เมนู ${S.menu.length} รายการ</h2>${S.menu.length>1?'<button class="btn" data-act="reorder" style="margin-left:auto">จัดลำดับ</button>':''}<button class="btn main" data-act="edit-menu">เพิ่มเมนู</button></div>
  ${S.menu.length?'<div class="list">'+S.menu.map(m=>`<div class="li"><div class="g"><b>${esc(m.name)}</b> ${m.soldOut?'<span class="pill">หมด</span>':''}<small>${esc(m.cat||'')} · ${Object.entries(m.prices).map(([k,v])=>(k==='ราคาเดียว'?'':k+' ')+v).join(' / ')} บาท</small></div><button class="btn" data-act="soldout" data-id="${esc(m.id)}">${m.soldOut?'มีขาย':'ของหมด'}</button><button class="btn" data-act="edit-menu" data-id="${esc(m.id)}">แก้ไข</button></div>`).join('')+'</div>':`<div class="empty"><div>ยังไม่มีเมนู</div><button class="btn" data-act="starter">นำเข้าเมนูชาบัง 46 รายการ</button></div>`}</div></div>`;
}
function pushSection(){
  const me=pushMe(),others=S.push.filter(p=>p.id!==S.pushId);
  const mine=me?`<p>เครื่องนี้รับแจ้งเตือนอยู่ เลือกเรื่องที่ต้องการ</p><div class="chips">${PUSH_KINDS.map(([k,l])=>`<button type="button" class="chip ${me.prefs&&(me.prefs[k]??k==='stock')?'on':''}" data-act="push-pref" data-v="${k}">${l}</button>`).join('')}</div>
   <div class="pay"><button type="button" class="btn" data-act="push-test">ทดสอบแจ้งเตือน</button><button type="button" class="btn danger" data-act="push-off">ปิดบนเครื่องนี้</button></div>`
   :`<p class="muted">เปิดบนมือถือของเจ้าของร้าน แล้วจะมีแจ้งเตือนเด้งเมื่อเครื่องอื่นปิดบิล ยกเลิกบิล จ่ายซื้อของ หรือปิดยอด แม้ล็อกจออยู่ บน iPhone/iPad ต้องเปิดแอปจากไอคอนบนหน้าจอโฮม</p><button type="button" class="btn main" data-act="push-on" ${S.config.pushUrl?'':'disabled'}>เปิดการแจ้งเตือนบนเครื่องนี้</button>${S.config.pushUrl?'':'<p class="hint">ใส่ลิงก์ Apps Script ด้านบนแล้วกดบันทึกก่อน</p>'}`;
  return `<section class="panel" style="margin-top:8px"><h3>แจ้งเตือนบนมือถือ</h3>${mine}${others.length?`<div class="muted" style="margin-top:10px">เครื่องอื่นที่รับแจ้งเตือน</div><div class="list">${others.map(p=>`<div class="li"><div class="g">${esc(p.device||'เครื่อง')}${p.name?' · '+esc(p.name):''}<small>${PUSH_KINDS.filter(([k])=>p.prefs&&(p.prefs[k]??k==='stock')).map(x=>x[1]).join(', ')||'ปิดทุกเรื่อง'}</small></div><button type="button" class="link danger" data-act="push-del" data-id="${esc(p.id)}">เลิกส่ง</button></div>`).join('')}</div>`:''}</section>`;
}
const ST={ok:'มีพอ',low:'ใกล้หมด',out:'หมด'};
const UNITS=['กรัม','กิโลกรัม','มล.','ลิตร','ชิ้น','ใบ','ลูก','กระป๋อง','ขวด','ถุง','แพ็ก','กล่อง','ลัง','กระสอบ'];
const fmtN=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
function priceText(x){if(x.price==null)return '';const q=x.qty||1,u=x.unit||'';
  return baht(x.price)+' ต่อ '+(q===1&&u?u:fmtN(q)+' '+u).trim()+(q>1&&u?' (≈'+'฿'+fmtN(x.price/q)+'/'+u+')':'')}
const STOCK_STARTER=['ผงชาไทย','ชาเขียว','ชาดำ','กาแฟโบราณ','โกโก้','ไมโล','นมข้นหวาน','นมข้นจืด','นมสด','น้ำตาล','ไซรัป/น้ำหวาน','มะนาว','น้ำแข็ง','แก้ว','ฝาแก้ว','ถุง/ถัง','หลอด'];
function stockText(){const o=S.stock.filter(x=>x.status==='out'),l=S.stock.filter(x=>x.status==='low');
  const li=x=>'- '+x.name+(x.price!=null?' · '+priceText(x).replace(/ \(≈.*\)$/,''):'')+(x.buyer?' · ซื้อที่ผ่านมา: '+x.buyer:''),tot=[...o,...l].reduce((a,x)=>a+(x.price||0),0);
  return `รายการต้องซื้อ ${S.config.name} ${thaiDay(dayKey())}\n`+(o.length?'หมดแล้ว\n'+o.map(li).join('\n')+'\n':'')+(l.length?'ใกล้หมด\n'+l.map(li).join('\n')+'\n':'')+(tot?'รวมประมาณ '+baht(tot)+' (อย่างละ 1 หน่วยที่ซื้อ)':'')}
function renderStock(){
  const o=S.stock.filter(x=>x.status==='out'),l=S.stock.filter(x=>x.status==='low');
  const ago=ts=>{if(!ts)return '';const m=Math.round((Date.now()-ts)/60000);return m<1?'เมื่อสักครู่':m<60?m+' นาทีที่แล้ว':m<1440?Math.round(m/60)+' ชม.ที่แล้ว':new Date(ts).toLocaleDateString('th-TH',{day:'numeric',month:'short'})};
  const row=x=>`<div class="li stock st-${x.status||'ok'}"><button class="g" data-act="stock-edit" data-id="${esc(x.id)}" style="text-align:left"><b>${esc(x.name)}</b><small>${esc([priceText(x),x.buyer&&'ซื้อโดย '+x.buyer,x.status&&x.status!=='ok'&&x.at?ST[x.status]+' · '+ago(x.at)+(x.by?' · '+x.by:''):''].filter(Boolean).join(' · ')||'แตะเพื่อใส่ราคาที่ซื้อ')}</small></button>
   <div class="st3" role="group" aria-label="สถานะ ${esc(x.name)}">${Object.entries(ST).map(([k,v])=>`<button class="${k}${(x.status||'ok')===k?' on':''}" data-act="stock-set" data-id="${esc(x.id)}" data-v="${k}" aria-pressed="${(x.status||'ok')===k}">${v}</button>`).join('')}</div></div>`;
  const scroll=document.querySelector('#view .scroll')?.scrollTop||0;
  $('view').innerHTML=`<div class="scroll"><div class="narrow"><div class="daybar"><h2>สต๊อกวัตถุดิบ</h2>${o.length||l.length?'<button class="btn" data-act="stock-copy" style="margin-left:auto">คัดลอกรายการต้องซื้อ</button>':''}</div>
  ${S.stock.length?`<div class="payrow">${o.length?`<span>หมด <b class="num">${o.length}</b> รายการ</span>`:''}${l.length?`<span>ใกล้หมด <b class="num">${l.length}</b> รายการ</span>`:''}${!o.length&&!l.length?'<span>ของมีพอทุกรายการ</span>':''}</div>
  <div class="list">${S.stock.map(row).join('')}</div>`:`<div class="empty"><div>ยังไม่มีรายการวัตถุดิบ</div><button class="btn" data-act="stock-starter">เพิ่มรายการตั้งต้น ${STOCK_STARTER.length} รายการ</button></div>`}
  <form id="stf" class="daybar" style="margin-top:12px"><label class="field" style="flex:1;margin:0"><span class="sr">ชื่อวัตถุดิบใหม่</span><input id="st-name" autocomplete="off" placeholder="เพิ่มวัตถุดิบ เช่น นมข้นหวาน"></label><button class="btn main" type="submit">เพิ่ม</button></form>
  <p class="muted">ไม่ได้ตัดสต๊อกอัตโนมัติ พนักงานกด "ใกล้หมด" หรือ "หมด" เมื่อเห็นของเหลือน้อย ซื้อมาแล้วกด "มีพอ"</p></div></div>`;
  const sc=document.querySelector('#view .scroll');if(sc)sc.scrollTop=scroll;
}
function saveStock(x){const i=S.stock.findIndex(y=>y.id===x.id);if(i>=0)S.stock[i]=x;else S.stock.push(x);lsSet('chabang.stock',S.stock);if(S.db)S.db.collection('stock').doc(x.id).set(x).catch(()=>toast('บันทึกสต๊อกไม่สำเร็จ ตรวจอินเทอร์เน็ต'))}
function renderConfig(){
  const c=S.config;
  $('view').innerHTML=`<div class="scroll"><form class="narrow" id="cfg" style="max-width:560px">
  <label class="field"><span>ชื่อร้าน</span><input id="c-name" value="${esc(c.name)}"></label>
  <label class="field"><span>เบอร์พร้อมเพย์ 10 หลัก หรือเลขบัตร 13 หลัก หรือ e-Wallet 15 หลัก</span><input id="c-pp" inputmode="numeric" value="${esc(c.promptpay)}" placeholder="08xxxxxxxx"></label>
  <label class="field"><span>ตัวเลือกเพิ่ม บรรทัดละ 1 รายการ เขียนแบบ ชื่อ,ราคา</span><textarea id="c-add" rows="4">${esc(c.addons)}</textarea></label>
  <label class="field"><span>ลิงก์ Apps Script สำหรับส่งแจ้งเตือน (ขึ้นต้นด้วย https://script.google.com/)</span><input id="c-push" inputmode="url" autocomplete="off" value="${esc(c.pushUrl||'')}" placeholder="https://script.google.com/macros/s/…/exec"></label>
  <button class="btn main" type="submit">บันทึกการตั้งค่า</button>
  ${pushSection()}
  <p class="muted">เมนูและยอดขายเก็บออนไลน์ ล็อกอินบัญชีร้านจากเครื่องอื่นแล้วเห็นข้อมูลชุดเดียวกัน ถ้าเน็ตหลุด บิลจะรอในเครื่องและส่งเองเมื่อเน็ตกลับมา</p>
  <div class="row"><span class="muted">${esc(S.user&&S.user.email||'')}</span><button class="btn" type="button" data-act="logout">ออกจากระบบ</button></div></form></div>`;
}
function renderModal(){
  const m=S.modal;if(!m){$('modal').innerHTML='';return}
  const ae=document.activeElement,inSheet=ae&&ae.closest&&ae.closest('.sheet'),key=inSheet?focusKey(ae):null,fresh=!$('modal').querySelector('.sheet');
  $('modal').innerHTML='<div class="backdrop'+(fresh?' enter':'')+'" data-act="close-bg"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mtitle">'+MODALS[m.type](m)+'</div></div>';
  const sh=$('modal').querySelector('.sheet'),h=sh.querySelector('h2');if(h){h.id='mtitle';h.tabIndex=-1}
  if(key){const el=sh.querySelector(key);(el||h||sh).focus({preventScroll:true})}else if(fresh||!inSheet){(sh.querySelector('[autofocus]')||h||sh).focus({preventScroll:true})}
  if(m.type==='qr'&&m.payload){const q=qrcode(0,'M');q.addData(m.payload);q.make();$('qrbox').innerHTML=q.createSvgTag({cellSize:6,margin:0,scalable:true})}
}
const keypad=()=>`<div class="keys">${[1,2,3,4,5,6,7,8,9].map(k=>`<button data-act="key" data-k="${k}">${k}</button>`).join('')}<button data-act="key" data-k="C">C</button><button data-act="key" data-k="0">0</button><button data-act="key" data-k="B" aria-label="ลบ">⌫</button></div>`;
const MODALS={
 pick(m){const it=m.item,ad=parseAddons(S.config.addons);return `<h2>${esc(it.name)}</h2>
  ${Object.keys(it.prices).length>1?`<div class="opt"><span>แบบ</span><div class="chips">${Object.entries(it.prices).map(([k,v])=>`<button class="chip ${m.type2===k?'on':''}" data-act="m-type" data-v="${k}">${k} <span class="num">${v}</span></button>`).join('')}</div></div>`:''}
  ${it.sweet?`<div class="opt"><span>ความหวาน</span><div class="chips">${SWEET.map(k=>`<button class="chip ${m.sweet===k?'on':''}" data-act="m-sweet" data-v="${k}">${k}</button>`).join('')}</div></div>`:''}
  ${ad.length?`<div class="opt"><span>เพิ่มเติม</span><div class="chips">${ad.map(a=>`<button class="chip ${m.addons.includes(a.name)?'on':''}" data-act="m-addon" data-v="${esc(a.name)}">${esc(a.name)} <span class="num">+${a.price}</span></button>`).join('')}</div></div>`:''}
  <div class="pay"><button class="btn" data-act="close">ยกเลิก</button><button class="btn main" data-act="m-add">${m.edit!=null?'บันทึกการแก้ไข':'เพิ่มลงบิล'}</button></div>`},
 discount(m){return `<h2>ส่วนลด</h2><div class="big num center">${baht(+m.buf||0)}</div>${keypad()}<div class="pay"><button class="btn" data-act="close">ยกเลิก</button><button class="btn main" data-act="disc-ok">ใช้ส่วนลด</button></div>`},
 cash(m){const t=billTotals(S.cart.lines,S.cart.discount).total,got=+m.buf||0,ch=got-t;return `<h2>รับเงินสด</h2><div class="row"><span>ยอดชำระ</span><span class="total num">${baht(t)}</span></div><div class="row"><span>รับมา</span><span class="total num">${baht(got)}</span></div><div class="chips"><button class="chip num" data-act="set-buf" data-v="${t}">พอดี</button>${cashChoices(t).map(x=>`<button class="chip num" data-act="set-buf" data-v="${x}">${x.toLocaleString('en-US')}</button>`).join('')}</div>${keypad()}<div class="row"><span>เงินทอน</span><span class="total num" style="color:var(--leaf)">${got?(ch>=0?baht(ch):'—'):baht(0)}</span></div>${got&&ch<0?`<p class="hint warn">รับมายังไม่พอ ขาดอีก ${baht(-ch)}</p>`:got?'':'<p class="hint">ไม่ใส่ยอดรับ ระบบจะถือว่ารับมาพอดี</p>'}<div class="pay"><button class="btn" data-act="close">ยกเลิก</button><button class="btn main" data-act="pay-cash" ${got&&ch<0?'disabled':''}>ปิดการขาย</button></div>`},
 qr(m){const t=billTotals(S.cart.lines,S.cart.discount).total;
  if(!m.payload)return `<h2>ยังไม่ได้ใส่เลขพร้อมเพย์</h2><p>ใส่เบอร์หรือเลขพร้อมเพย์ของร้านที่แท็บตั้งค่าก่อน ระบบจึงจะสร้าง QR รับเงินได้</p><div class="pay"><button class="btn" data-act="close">ปิด</button><button class="btn main" data-act="go-config">ไปที่ตั้งค่า</button></div>`;
  return `<h2 class="center">สแกนจ่ายพร้อมเพย์</h2><div class="qr" id="qrbox"></div><div class="big num center">${baht(t)}</div><p class="muted center">ปิดการขายหลังเห็นเงินเข้าบัญชีหรือตรวจสลิปแล้ว ระบบไม่ได้ตรวจยอดโอนให้</p><div class="pay"><button class="btn" data-act="close">ยกเลิก</button><button class="btn main" data-act="pay-qr">ได้รับเงินแล้ว</button></div>`},
 done(m){const s=m.sale;return `<svg class="chk" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="31"/><path d="M22 37l10 10 18-20"/></svg><h2 class="center">ปิดการขาย บิล #${s.no}</h2>${s.pay==='เงินสด'?`<div class="center"><div class="muted">เงินทอน</div><div class="big num">${baht(s.change)}</div></div>`:`<div class="center"><div class="muted">รับผ่านพร้อมเพย์</div><div class="big num">${baht(s.total)}</div></div>`}<div class="pay"><button class="btn" data-act="print" data-id="${s.id}">พิมพ์บิล</button><button class="btn main" data-act="close">บิลใหม่</button></div>`},
 void(m){if(m.sale.kind==='expense')return `<h2>ยกเลิกรายการจ่าย "${esc(m.sale.item)}"?</h2><p>ยอด ${baht(m.sale.amount)} จะไม่ถูกหักจากเงินสดคงเหลือ แต่รายการยังแสดงพร้อมป้ายยกเลิกแล้ว</p><div class="pay"><button class="btn" data-act="close">ไม่ยกเลิก</button><button class="btn danger" data-act="void-ok">ยกเลิกรายการ</button></div>`;return `<h2>ยกเลิกบิล #${m.sale.no}?</h2><p>ยอด ${baht(m.sale.total)} จะถูกตัดออกจากยอดขาย แต่บิลยังแสดงในรายการพร้อมป้ายยกเลิกแล้ว</p><div class="pay"><button class="btn" data-act="close">ไม่ยกเลิก</button><button class="btn danger" data-act="void-ok">ยกเลิกบิล</button></div>`},
 expense(m){const names=expenseNames();return `<h2>จ่ายเงินซื้อของ</h2><p class="muted">ใช้เมื่อหยิบเงินสดในลิ้นชักไปซื้อของเข้าร้าน</p><form id="ef" class="fields" style="display:grid">
  <label class="field" style="grid-column:1/-1"><span>ซื้ออะไร</span><input id="e-item" required autofocus autocomplete="off" placeholder="เช่น น้ำแข็ง นมข้น แก้ว" value="${esc(m.item||'')}"></label>
  ${names.length?`<div class="chips" style="grid-column:1/-1">${names.map(n=>`<button type="button" class="chip" data-act="e-name" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div>`:''}
  <label class="field"><span>จำนวนเงิน (บาท)</span><input id="e-amt" required inputmode="numeric" type="number" min="1" step="1"></label>
  <label class="field"><span>หมายเหตุ (ถ้ามี)</span><input id="e-note" autocomplete="off" placeholder="เช่น ชื่อคนซื้อ"></label>
  <div class="pay" style="grid-column:1/-1"><button class="btn" type="button" data-act="close">ยกเลิก</button><button class="btn main" type="submit">บันทึก</button></div></form>`},
 staff(m){const names=staffNames();return `<h2>ใครอยู่กะนี้</h2><p class="muted">ชื่อนี้จะติดไปกับทุกบิลและรายการจ่ายจากเครื่องนี้ จนกว่าจะเปลี่ยน</p><form id="sf" class="fields" style="display:grid">
  ${names.length?`<div class="chips" style="grid-column:1/-1">${names.map(n=>`<button type="button" class="chip ${n===S.staff?'on':''}" data-act="staff-pick" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div>`:''}
  <label class="field" style="grid-column:1/-1"><span>ชื่อพนักงาน${names.length?' (หรือพิมพ์ชื่อใหม่)':''}</span><input id="s-name" ${names.length?'':'autofocus'} autocomplete="off" maxlength="20" placeholder="เช่น ฝน"></label>
  <div class="pay" style="grid-column:1/-1"><button class="btn" type="button" data-act="close">${S.staff?'ยกเลิก':'ข้ามไปก่อน'}</button><button class="btn main" type="submit">เริ่มกะ</button></div></form>`},
 float(m){return `<h2>เงินทอนตั้งต้น</h2><p class="muted">เงินที่ใส่ไว้ในลิ้นชักตอนเปิดร้านวันนี้</p><div class="big num center">${baht(+m.buf||0)}</div><div class="chips">${[500,1000,1500,2000].map(x=>`<button class="chip num" data-act="set-buf" data-v="${x}">${x.toLocaleString('en-US')}</button>`).join('')}</div>${keypad()}<div class="pay"><button class="btn" data-act="close">ยกเลิก</button><button class="btn main" data-act="float-ok">บันทึก</button></div>`},
 closeDay(m){const r=summary([S.todayKey]),got=+m.buf||0,d=got-r.drawer;return `<h2>ปิดยอด นับเงินในลิ้นชัก</h2><div class="row"><span>ควรมีในลิ้นชัก</span><span class="total num">${sbaht(r.drawer)}</span></div><div class="row"><span>นับได้จริง</span><span class="total num">${baht(got)}</span></div>${keypad()}<div class="row"><span>ผลต่าง</span><span class="total num" style="color:${!m.buf||d===0?'var(--leaf)':'var(--cherry)'}">${!m.buf?'—':d===0?'ตรงพอดี':d<0?'ขาด '+baht(-d):'เกิน '+baht(d)}</span></div>${r.open?'':'<p class="hint warn">ยังไม่ได้ใส่เงินทอนตั้งต้นของวันนี้ ยอดที่ควรมีจึงยังไม่รวมเงินทอน</p>'}<div class="pay"><button class="btn" data-act="close">ยกเลิก</button><button class="btn main" data-act="close-ok" ${m.buf?'':'disabled'}>บันทึกการปิดยอด</button></div>`},
 stockEdit(m){const x=m.item;return `<h2>แก้ไขวัตถุดิบ</h2><form id="sef" class="fields" style="display:grid"><label class="field" style="grid-column:1/-1"><span>ชื่อ</span><input id="se-name" required value="${esc(x.name)}"></label>
  <label class="field" style="grid-column:1/-1"><span>ราคาที่ซื้อ (บาท)</span><input id="se-price" inputmode="decimal" type="number" min="0" step="0.25" value="${x.price??''}" placeholder="เช่น 25"></label>
  <label class="field"><span>ได้ปริมาณ</span><input id="se-qty" inputmode="decimal" type="number" min="0" step="any" value="${x.qty??''}" placeholder="เช่น 380"></label>
  <label class="field"><span>หน่วย</span><select id="se-unit"><option value="">เลือกหน่วย</option>${UNITS.map(u=>`<option ${x.unit===u?'selected':''}>${u}</option>`).join('')}${x.unit&&!UNITS.includes(x.unit)?`<option selected>${esc(x.unit)}</option>`:''}</select></label>
  <label class="field" style="grid-column:1/-1"><span>คนที่ซื้อมา</span><input id="se-buyer" autocomplete="off" maxlength="20" value="${esc(x.buyer||'')}" placeholder="เช่น ฝน"></label>
  ${staffNames().length?`<div class="chips" style="grid-column:1/-1">${staffNames().map(n=>`<button type="button" class="chip" data-act="se-buyer" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div>`:''}
  <p class="hint" style="grid-column:1/-1">ตัวอย่าง: นมข้นหวาน 25 บาท ได้ 380 กรัม · น้ำแข็ง 30 บาท ได้ 1 กระสอบ · แก้ว 85 บาท ได้ 50 ใบ${x.priceAt?'<br>แก้ราคาล่าสุด '+new Date(x.priceAt).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'})+(x.buyer?' · ซื้อโดย '+esc(x.buyer):''):''}</p>
  <div class="pay" style="grid-column:1/-1"><button class="btn" type="button" data-act="close">ยกเลิก</button><button class="btn main" type="submit">บันทึก</button></div>
  <button class="link danger" type="button" style="grid-column:1/-1" data-act="${m.confirmDel?'stock-del-ok':'stock-del'}">${m.confirmDel?'แตะอีกครั้งเพื่อลบ':'ลบรายการนี้'}</button></form>`},
 clear(){return `<h2>ล้างบิลปัจจุบัน?</h2><div class="pay"><button class="btn" data-act="close">เก็บไว้</button><button class="btn danger" data-act="clear-ok">ล้างบิล</button></div>`},
 editMenu(m){const it=m.item;return `<h2>${it.id?'แก้ไขเมนู':'เพิ่มเมนู'}</h2><form id="mf" class="fields" style="display:grid">
  <label class="field" style="grid-column:1/-1"><span>ชื่อเมนู</span><input id="f-name" required value="${esc(it.name||'')}"></label>
  <label class="field" style="grid-column:1/-1"><span>หมวด</span><input id="f-cat" list="catlist" value="${esc(it.cat||'กาแฟ')}"><datalist id="catlist">${cats().slice(1).map(c=>`<option value="${esc(c)}"></option>`).join('')}</datalist></label>
  ${TYPES.map((t,i)=>`<label class="field"><span>ราคา${t==='ราคาเดียว'?'เดียว':t}</span><input id="f-p${i}" inputmode="numeric" type="number" min="0" value="${it.prices&&it.prices[t]!=null?it.prices[t]:''}"></label>`).join('')}
  <label style="grid-column:1/-1;display:flex;gap:8px;align-items:center;min-height:44px"><input type="checkbox" id="f-sweet" ${it.sweet!==false?'checked':''} style="width:22px;height:22px"> ถามระดับความหวาน</label>
  <div class="pay" style="grid-column:1/-1"><button class="btn" type="button" data-act="close">ยกเลิก</button><button class="btn main" type="submit">บันทึกเมนู</button></div>
  ${it.id?`<button class="link danger" type="button" style="grid-column:1/-1" data-act="${m.confirmDel?'del-ok':'del-ask'}">${m.confirmDel?'แตะอีกครั้งเพื่อลบเมนูนี้':'ลบเมนู'}</button>`:''}</form>`}
};
function printBill(s){if(!s)return;
  $('print').innerHTML=`<h1>${esc(S.config.name)}</h1><p>บิล #${s.no} · ${esc(s.mode||'')}<br>${new Date(s.ts).toLocaleString('th-TH',{dateStyle:'short',timeStyle:'short'})}</p><hr>`+s.lines.map(l=>`<div class="pl"><span>${l.qty} ${esc(l.name)}</span><span>${lineTotal(l)}</span></div><small>${esc([l.type,l.sweet,...(l.addons||[]).map(a=>a.name)].filter(Boolean).join(' · '))}</small>`).join('')+`<hr>${s.discount?`<div class="pl"><span>ส่วนลด</span><span>-${s.discount}</span></div>`:''}<div class="pl tot"><span>รวม</span><span>${s.total} บาท</span></div><div class="pl"><span>${esc(s.pay)}</span><span>${s.pay==='เงินสด'?s.received:s.total}</span></div>${s.pay==='เงินสด'?`<div class="pl"><span>เงินทอน</span><span>${s.change}</span></div>`:''}<p class="thx">ขอบคุณครับ/ค่ะ</p>`;
  window.print()}
function focusKey(el){const d=el.dataset||{};if(!d.act)return el.id?'#'+CSS.escape(el.id):null;return '[data-act="'+d.act+'"]'+['v','k','i','id','t','d'].filter(x=>d[x]!=null).map(x=>'[data-'+x+'="'+CSS.escape(d[x])+'"]').join('')}
function refocus(d){const sel=`[data-act="${d.act}"][data-v="${CSS.escape(d.v)}"]`,el=document.querySelector(sel+`[data-d="${d.d}"]:not([disabled])`)||document.querySelector(sel+':not([disabled])');if(el)el.focus({preventScroll:true})}
function openModal(m){if(!S.modal){const a=document.activeElement;S.opener=a&&a!==document.body?focusKey(a):null}S.modal=m;renderModal()}
function closeModal(){S.modal=null;render();const k=S.opener;S.opener=null;if(k){const el=document.querySelector(k);if(el)el.focus({preventScroll:true})}}
document.addEventListener('keydown',e=>{
  const sh=document.querySelector('#modal .sheet');
  if(sh){
    if(e.key==='Escape'){e.preventDefault();closeModal();return}
    if(e.key==='Tab'){const f=[...sh.querySelectorAll('button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent);if(!f.length)return;
      const i=f.indexOf(document.activeElement);if(e.shiftKey&&(i<=0)){e.preventDefault();f[f.length-1].focus()}else if(!e.shiftKey&&(i===-1||i===f.length-1)){e.preventDefault();f[0].focus()}}
    return}
  const t=e.target;if(t.classList&&t.classList.contains('tab')&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){const ts=[...document.querySelectorAll('.tab')];const n=ts[(ts.indexOf(t)+(e.key==='ArrowRight'?1:-1)+ts.length)%ts.length];n.click();const nn=document.querySelector('.tab[data-v="'+n.dataset.v+'"]');nn&&nn.focus()}
});
// 8: expose selected state of toggle-style buttons to assistive tech
new MutationObserver(()=>{document.querySelectorAll('.cat,.seg button,.sheet .chip[data-act^="m-"],.chip[data-act="push-pref"]').forEach(b=>{const v=String(b.classList.contains('on'));if(b.getAttribute('aria-pressed')!==v)b.setAttribute('aria-pressed',v)});
  document.querySelectorAll('.tab').forEach(t=>{const v=t.getAttribute('aria-selected')==='true'?'0':'-1';if(t.getAttribute('tabindex')!==v)t.setAttribute('tabindex',v)})}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-selected']});
function finish(pay,extra){
  const t=billTotals(S.cart.lines,S.cart.discount),day=dayKey();
  const no=salesOf(day).reduce((a,s)=>Math.max(a,s.no||0),0)+1;
  const sale={id:'b'+Date.now()+Math.random().toString(36).slice(2,6),day,no,ts:Date.now(),lines:S.cart.lines,mode:S.cart.mode,sub:t.sub,discount:t.disc,total:t.total,pay,staff:S.staff||'',...extra};
  writeSale(sale);notify('bill','🧾 บิล #'+no+' '+baht(t.total),[pay,sale.staff,sale.lines.map(l=>l.name+(l.qty>1?' ×'+l.qty:'')).join(', ')].filter(Boolean).join(' · '),sale.id);
  S.cart={lines:[],discount:0,mode:S.cart.mode};saveCart();S.modal={type:'done',sale};render();
}
function addLine(it,type,sweet,addonNames,qty=1){
  const ad=parseAddons(S.config.addons).filter(a=>addonNames.includes(a.name));
  const line={mid:it.id,name:it.name,cat:it.cat||'อื่น ๆ',type:type==='ราคาเดียว'?'':type,price:it.prices[type],sweet:it.sweet?sweet:'',addons:ad,qty};
  const k=JSON.stringify([line.mid,line.type,line.sweet,ad]);
  const same=S.cart.lines.find(l=>JSON.stringify([l.mid,l.type,l.sweet,l.addons])===k);
  if(same)same.qty+=qty;else S.cart.lines.push(line);saveCart();S.flash=S.cart.lines.indexOf(same||line);S.bump=true;setTimeout(()=>{S.bump=false},0);clearTimeout(addLine.t);addLine.t=setTimeout(()=>{S.flash=null;document.querySelectorAll('.line.flash').forEach(e=>e.classList.remove('flash'))},700);
}
function dailyText(){const days=rangeDays(S.range,S.viewDay),r=summary(days);return `สรุปยอดขาย ${S.config.name} ${rangeLabel(S.range,S.viewDay)}\nจำนวน ${r.cups} แก้ว\nยอดขาย ${baht(r.total)} จาก ${r.ok.length} บิล\nเงินสด ${baht(r.cash)}\nพร้อมเพย์ ${baht(r.qr)}\n`+(r.exp?`จ่ายซื้อของ ${baht(r.exp)}\n`:'')+(r.open||r.exp?`ควรมีในลิ้นชัก ${sbaht(r.drawer)}\n`:'')+(r.close?`นับได้ ${baht(r.close.counted)} ${r.close.diff===0?'ตรงพอดี':r.close.diff<0?'ขาด '+baht(-r.close.diff):'เกิน '+baht(r.close.diff)}\n`:'')+r.itemList.slice(0,5).map(([n,x])=>`${n} ${x.qty}`).join('\n')}

/* ---------- events ---------- */
const ACT={
 theme(){const t=THEMES[themeMode()].next;applyTheme(t);toast('ใช้ธีม'+THEMES[t].label+(t==='auto'?' ตามการตั้งค่าของเครื่อง':''))},
 tab(d){S.tab=d.v;S.modal=null;S.reorder=false;if(d.v==='sales')loadRange();else render()},
 range(d){S.range=d.v;loadRange()},
 'open-day'(d){S.range='day';S.viewDay=d.v;loadRange()},cat(d){if(S.cat!==d.v){S.cat=d.v;S.swap=true;renderSell();S.swap=false;const g=document.querySelector('.grid');if(g)g.scrollTop=0}},mode(d){S.cart.mode=d.v;saveCart();renderSell()},
 pick(d){const it=S.menu.find(m=>m.id===d.id);if(!it||it.soldOut)return;const types=Object.keys(it.prices);
  if(!it.sweet&&types.length===1){addLine(it,types[0],'',[]);renderSell();return}
  openModal({type:'pick',item:it,type2:types.includes('ถุง/ถัง')?'ถุง/ถัง':types[0],sweet:SWEET[0],addons:[]})},
 'm-type'(d){S.modal.type2=d.v;renderModal()},'m-sweet'(d){S.modal.sweet=d.v;renderModal()},
 'm-addon'(d){const a=S.modal.addons,i=a.indexOf(d.v);i>=0?a.splice(i,1):a.push(d.v);renderModal()},
 'm-add'(){const m=S.modal;let q=1;if(m.edit!=null){q=S.cart.lines[m.edit].qty;S.cart.lines.splice(m.edit,1)}addLine(m.item,m.type2,m.sweet,m.addons,q);closeModal()},
 quick(d){const it=S.menu.find(m=>m.id===d.id);if(!it||it.soldOut||it.prices[d.t]==null)return;addLine(it,d.t,it.sweet?SWEET[0]:'',[]);renderSell()},
 'edit-line'(d){const l=S.cart.lines[+d.i];const it=S.menu.find(m=>m.id===l.mid)||{id:l.mid,name:l.name,cat:l.cat,prices:{[l.type||'ราคาเดียว']:l.price},sweet:!!l.sweet};
  openModal({type:'pick',item:it,edit:+d.i,type2:l.type||'ราคาเดียว',sweet:l.sweet||SWEET[0],addons:(l.addons||[]).map(a=>a.name)})},
 qty(d){const l=S.cart.lines[+d.i];l.qty+=+d.d;if(l.qty<=0)S.cart.lines.splice(+d.i,1);saveCart();renderSell()},
 clear(){openModal({type:'clear'})},'clear-ok'(){S.cart.lines=[];S.cart.discount=0;saveCart();closeModal()},
 discount(){openModal({type:'discount',buf:S.cart.discount?String(S.cart.discount):''})},
 'disc-ok'(){S.cart.discount=+S.modal.buf||0;saveCart();closeModal()},
 cash(){openModal({type:'cash',buf:''})},
 qr(){const t=billTotals(S.cart.lines,S.cart.discount).total;openModal({type:'qr',payload:promptpayPayload(S.config.promptpay,t)})},
 key(d){const m=S.modal;if(d.k==='C')m.buf='';else if(d.k==='B')m.buf=(m.buf||'').slice(0,-1);else if((m.buf||'').length<6)m.buf=(m.buf||'')+d.k;renderModal()},
 'set-buf'(d){S.modal.buf=d.v;renderModal()},
 'pay-cash'(){const t=billTotals(S.cart.lines,S.cart.discount).total,g=+S.modal.buf||t;if(g<t)return;finish('เงินสด',{received:g,change:g-t})},
 'pay-qr'(){finish('พร้อมเพย์',{})},
 close(){closeModal()},'close-bg'(d,e){if(e.target.classList.contains('backdrop')&&S.modal.type!=='done')closeModal();else if(e.target.classList.contains('backdrop'))closeModal()},
 'go-config'(){S.modal=null;S.tab='config';render()},
 day(d){const n=shiftAnchor(S.range,S.viewDay,+d.d);if(rangeDays(S.range,n)[0]>S.todayKey)return;S.viewDay=n>S.todayKey?S.todayKey:n;loadRange()},
 void(d){openModal({type:'void',sale:salesOf(S.viewDay).find(s=>s.id===d.id)})},
 expense(){openModal({type:'expense'})},
 staff(){openModal({type:'staff'})},
 'stock-set'(d){const x=S.stock.find(y=>y.id===d.id);if(!x||(x.status||'ok')===d.v)return;saveStock({...x,status:d.v,at:Date.now(),by:S.staff||''});render();refocus(d);
  if(d.v!=='ok')notify('stock',(d.v==='out'?'🔴 ':'🟡 ')+x.name+' '+ST[d.v],'แจ้งโดย '+(S.staff||'ไม่ระบุ'),'s'+x.id);toast(x.name+' · '+ST[d.v])},
 'stock-starter'(){STOCK_STARTER.forEach((n,i)=>saveStock({id:'s'+Date.now()+i,name:n,status:'ok',order:i}));render()},
 'stock-edit'(d){const x=S.stock.find(y=>y.id===d.id);if(x)openModal({type:'stockEdit',item:{...x}})},
 'se-buyer'(d){$('se-buyer').value=d.v},
 'stock-del'(){S.modal.confirmDel=true;renderModal()},
 'stock-del-ok'(){const id=S.modal.item.id;S.stock=S.stock.filter(y=>y.id!==id);lsSet('chabang.stock',S.stock);if(S.db)S.db.collection('stock').doc(id).delete().catch(()=>{});closeModal();toast('ลบรายการแล้ว')},
 'stock-copy'(){const t=stockText();navigator.clipboard.writeText(t).then(()=>toast('คัดลอกแล้ว วางใน LINE ได้เลย')).catch(()=>openModal({type:'copy',text:t}))},
 reorder(){S.reorder=!S.reorder;render();if(!S.reorder)toast('บันทึกลำดับเมนูแล้ว')},
 'item-move'(d){const g=menuGroups();for(const [,items] of g){const i=items.findIndex(m=>m.id===d.v),j=i+(+d.d);if(i>=0){if(j<0||j>=items.length)return;[items[i],items[j]]=[items[j],items[i]];break}}
  const sc=document.querySelector('#view .scroll')?.scrollTop||0;applyOrder(g);render();const s=document.querySelector('#view .scroll');if(s)s.scrollTop=sc;refocus(d)},
 'cat-move'(d){const g=menuGroups(),i=g.findIndex(x=>x[0]===d.v),j=i+(+d.d);if(i<0||j<0||j>=g.length)return;[g[i],g[j]]=[g[j],g[i]];
  const sc=document.querySelector('#view .scroll')?.scrollTop||0;applyOrder(g);render();const s=document.querySelector('#view .scroll');if(s)s.scrollTop=sc;refocus(d)},
 'push-on'(){pushOn()},
 'push-off'(){const me=pushMe();if(me)S.db.collection('push').doc(me.id).delete().then(()=>toast('ปิดการแจ้งเตือนบนเครื่องนี้แล้ว')).catch(()=>toast('ปิดไม่สำเร็จ ตรวจอินเทอร์เน็ต'))},
 'push-del'(d){S.db.collection('push').doc(d.id).delete().then(()=>toast('เลิกส่งแจ้งเตือนไปเครื่องนั้นแล้ว')).catch(()=>{})},
 'push-pref'(d){const me=pushMe();if(!me)return;const prefs={...me.prefs,[d.v]:!(me.prefs&&(me.prefs[d.v]??d.v==='stock'))};me.prefs=prefs;render();S.db.collection('push').doc(me.id).set({...me,prefs}).catch(()=>toast('บันทึกไม่สำเร็จ'))},
 'push-test'(){const me=pushMe();if(!me)return;toast('กำลังส่งแจ้งเตือนทดสอบ');
  sendPush([me.token],'🔔 ทดสอบแจ้งเตือน','CHABANG POS ส่งแจ้งเตือนมาที่เครื่องนี้ได้แล้ว','test').then(j=>toast(j&&j.ok&&j.results&&j.results[0]===200?'ส่งแล้ว ถ้าไม่เด้ง ตรวจว่าเครื่องเปิดเสียงแจ้งเตือนอยู่':'ส่งไม่สำเร็จ: '+(j&&j.error==='auth'?'อีเมลบัญชีร้านในสคริปต์ไม่ตรง':j&&j.error||('รหัส '+(j&&j.results||[]).join(',')))))
   .catch(()=>toast('ติดต่อ Apps Script ไม่ได้ ตรวจลิงก์และการตั้งค่า "ผู้ที่มีสิทธิ์เข้าถึง: ทุกคน"'))},
 'staff-pick'(d){setStaff(d.v);closeModal();toast('เริ่มกะของ '+d.v)},
 float(){const o=summary([S.todayKey]).open;openModal({type:'float',buf:o?String(o.amount):''})},
 'float-ok'(){const day=dayKey(),amt=+S.modal.buf||0;writeSale({id:'o'+day,kind:'open',day,ts:Date.now(),amount:amt,staff:S.staff||'',total:0});closeModal();if(S.tab==='sales')loadRange();toast('บันทึกเงินทอนตั้งต้น '+baht(amt))},
 'close-day'(){if(S.viewDay!==S.todayKey){toast('ปิดยอดได้เฉพาะวันนี้');return}openModal({type:'closeDay',buf:''})},
 'close-ok'(){const r=summary([S.todayKey]),got=+S.modal.buf||0,day=dayKey();writeSale({id:'c'+day,kind:'close',day,ts:Date.now(),counted:got,expected:r.drawer,diff:got-r.drawer,staff:S.staff||'',total:0});
  const df=got-r.drawer;notify('close','🔒 ปิดยอด '+(df===0?'เงินตรงพอดี':df<0?'เงินขาด '+baht(-df):'เงินเกิน '+baht(df)),'ขายวันนี้ '+baht(r.total)+' · นับได้ '+baht(got)+' · ควรมี '+sbaht(r.drawer)+(S.staff?' · '+S.staff:''),'close');closeModal();loadRange();toast(got===r.drawer?'ปิดยอดแล้ว เงินตรงพอดี':'ปิดยอดแล้ว '+(got<r.drawer?'เงินขาด '+baht(r.drawer-got):'เงินเกิน '+baht(got-r.drawer)))},
 'to-bill'(){const b=document.querySelector('.bill');if(!b)return;const smooth=!matchMedia('(prefers-reduced-motion: reduce)').matches;b.scrollIntoView({behavior:smooth?'smooth':'auto',block:'end'});const h=b.querySelector('.bill-h h2');if(h){h.tabIndex=-1;h.focus({preventScroll:true})}},
 'e-name'(d){$('e-item').value=d.v;$('e-amt').focus()},
 'void-ok'(){const vs=S.modal.sale;S.lastVoidExp=vs.kind==='expense';
  notify('void',vs.kind==='expense'?'❌ ยกเลิกรายการจ่าย '+baht(vs.amount):'❌ ยกเลิกบิล #'+vs.no+' '+baht(vs.total),[vs.kind==='expense'?vs.item:vs.lines.map(l=>l.name).join(', '),S.staff&&'โดย '+S.staff].filter(Boolean).join(' · '),'v'+vs.id);
  writeSale({...S.modal.sale,voided:true,voidedAt:Date.now()});closeModal();toast(S.lastVoidExp?'ยกเลิกรายการจ่ายแล้ว':'ยกเลิกบิลแล้ว')},
 'edit-menu'(d){const it=d.id?S.menu.find(m=>m.id===d.id):{};openModal({type:'editMenu',item:{...it}})},
 'del-ask'(){S.modal.confirmDel=true;renderModal()},'del-ok'(){deleteMenuItem(S.modal.item.id);closeModal();toast('ลบเมนูแล้ว')},
 soldout(d){const it=S.menu.find(m=>m.id===d.id);saveMenuItem({...it,soldOut:!it.soldOut});render()},
 starter(){SHOP_MENU.forEach(saveMenuItem);saveConfig({ownCup:true});render();toast('นำเข้าเมนูแล้ว')},
 logout(){logout()},
 print(d){printBill(salesOf(S.viewDay).concat(S.today).find(s=>s.id===d.id))},
 'copy-summary'(){const t=dailyText();navigator.clipboard.writeText(t).then(()=>toast('คัดลอกสรุปแล้ว วางใน LINE ได้เลย')).catch(()=>{openModal({type:'copy',text:t})})},
 async csv(){const r=summary(rangeDays(S.range,S.viewDay));const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const rows=[['วันที่','บิล','เวลา','รายการ','แบบ','ความหวาน','จำนวน','ยอดรายการ','ส่วนลดบิล','ยอดบิล','ชำระ','ประเภท','สถานะ','พนักงาน']];
  r.expenses.forEach(s=>rows.push([s.day,'',new Date(s.ts).toLocaleTimeString('th-TH'),s.item+(s.note?' ('+s.note+')':''),'จ่ายซื้อของ','',1,-s.amount,'','','เงินสด','',s.voided?'ยกเลิก':'ปกติ',s.staff||'']));
  if(r.open)rows.push([r.open.day,'',new Date(r.open.ts).toLocaleTimeString('th-TH'),'เงินทอนตั้งต้น','','',1,r.open.amount,'','','เงินสด','','ปกติ',r.open.staff||'']);
  if(r.close)rows.push([r.close.day,'',new Date(r.close.ts).toLocaleTimeString('th-TH'),'ปิดยอด นับได้ '+r.close.counted+' ควรมี '+r.close.expected,'','',1,r.close.diff,'','','เงินสด','','ปกติ',r.close.staff||'']);
  r.all.forEach(s=>s.lines.forEach(l=>rows.push([s.day,s.no,new Date(s.ts).toLocaleTimeString('th-TH'),l.name,l.type,l.sweet,l.qty,lineTotal(l),s.discount,s.total,s.pay,s.mode,s.voided?'ยกเลิก':'ปกติ',s.staff||''])));
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+rows.map(x=>x.map(q).join(',')).join('\r\n')],{type:'text/csv'}));a.download='sales-'+(S.range==='day'?'':S.range+'-')+S.viewDay+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000)}
};
MODALS.copy=m=>`<h2>คัดลอกสรุปเอง</h2><textarea id="copytext" rows="8" style="width:100%" readonly>${esc(m.text)}</textarea><button class="btn" data-act="close">ปิด</button>`;
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-act]');if(!el||el.disabled)return;
  if(el.dataset.act==='close-bg'&&!e.target.classList.contains('backdrop'))return;
  ACT[el.dataset.act]&&ACT[el.dataset.act](el.dataset,e);
  if(!wake.on)wake();
});
document.addEventListener('submit',e=>{
  e.preventDefault();
  if(e.target.id==='cfg'){const pu=$('c-push').value.trim();if(pu&&!/^https:\/\/script\.google\.com\//.test(pu)){toast('ลิงก์แจ้งเตือนต้องขึ้นต้นด้วย https://script.google.com/');return}
    saveConfig({name:$('c-name').value.trim()||'ร้านกาแฟ',promptpay:$('c-pp').value.trim(),addons:$('c-add').value,pushUrl:pu});render();
    const pp=$('c-pp').value.trim();toast(pp&&!promptpayPayload(pp,1)?'เลขพร้อมเพย์ต้องมี 10, 13 หรือ 15 หลัก':'บันทึกการตั้งค่าแล้ว')}
  if(e.target.id==='stf'){const n=$('st-name').value.trim();if(!n)return;saveStock({id:'s'+Date.now(),name:n,status:'ok',order:S.stock.length});render();$('st-name')&&$('st-name').focus();toast('เพิ่ม '+n+' แล้ว')}
  if(e.target.id==='sef'){const n=$('se-name').value.trim();if(!n)return;const old=S.stock.find(y=>y.id===S.modal.item.id)||S.modal.item;
    const pv=$('se-price').value,qv=$('se-qty').value,u=$('se-unit').value,by=$('se-buyer').value.trim(),rec={...old,name:n};
    if(by){if(by!==old.buyer)rec.priceAt=Date.now();rec.buyer=by}else delete rec.buyer;
    if(pv===''){delete rec.price;delete rec.qty;delete rec.unit}else{rec.price=+pv;rec.qty=qv===''?1:+qv;rec.unit=u;if(old.price!==rec.price||old.qty!==rec.qty||old.unit!==u)rec.priceAt=Date.now()}
    saveStock(rec);closeModal();toast('บันทึก '+n+' แล้ว')}
  if(e.target.id==='sf'){const n=$('s-name').value.trim();if(!n){toast('พิมพ์ชื่อหรือแตะเลือกชื่อ');return}setStaff(n);closeModal();toast('เริ่มกะของ '+n)}
  if(e.target.id==='ef'){const item=$('e-item').value.trim(),amount=Math.round(+$('e-amt').value||0);
    if(!item||amount<=0){toast('ใส่ชื่อของและจำนวนเงิน');return}
    const day=dayKey();writeSale({id:'e'+Date.now()+Math.random().toString(36).slice(2,6),kind:'expense',day,ts:Date.now(),item,amount,note:$('e-note').value.trim(),staff:S.staff||'',pay:'เงินสด',total:0});
    notify('expense','💸 จ่ายซื้อของ '+baht(amount),[item,$('e-note')&&$('e-note').value.trim(),S.staff].filter(Boolean).join(' · '));
    closeModal();if(S.tab==='sales')loadRange();toast('บันทึกจ่าย '+item+' '+baht(amount)+' แล้ว')}
  if(e.target.id==='mf'){const it=S.modal.item,prices={};TYPES.forEach((t,i)=>{const v=$('f-p'+i).value;if(v!=='')prices[t]=+v});
    if(!Object.keys(prices).length){toast('ใส่ราคาอย่างน้อย 1 ช่อง');return}
    const rec={...it,id:it.id||'m'+Date.now(),name:$('f-name').value.trim(),cat:$('f-cat').value.trim()||'อื่น ๆ',prices,sweet:$('f-sweet').checked,order:it.order??S.menu.length};
    delete rec.confirmDel;saveMenuItem(rec);closeModal();toast('บันทึกเมนูแล้ว')}
});
async function wake(){wake.on=true;try{if(navigator.wakeLock)await navigator.wakeLock.request('screen')}catch(e){}}
boot();
