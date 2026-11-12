import qrcode from 'qrcode-generator';
import {db as backendDb,onUser,login,logout} from './backend.js';

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
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function lsGet(k,f){try{const v=localStorage.getItem(k);return v==null?f:JSON.parse(v)}catch(e){return f}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}

const TYPES=['ร้อน','เย็น','ปั่น','ราคาเดียว'];
const SWEET=['หวานปกติ','หวานน้อย','หวาน 25%','ไม่หวาน'];
const DEFAULT_CONFIG={name:'ชาบัง',promptpay:'',addons:''};
const SHOP_MENU=[{"id": "m01", "name": "อเมริกาโน่", "cat": "กาแฟ", "prices": {"ร้อน": 40, "เย็น": 50}, "sweet": true, "order": 0}, {"id": "m02", "name": "ลาเต้", "cat": "กาแฟ", "prices": {"ร้อน": 50, "เย็น": 60}, "sweet": true, "order": 1}, {"id": "m03", "name": "เอสเพรสโซ", "cat": "กาแฟ", "prices": {"ร้อน": 40, "เย็น": 50}, "sweet": true, "order": 2}, {"id": "m04", "name": "มอคค่า", "cat": "กาแฟ", "prices": {"ร้อน": 55, "เย็น": 65}, "sweet": true, "order": 3}, {"id": "m05", "name": "คาปูชิโน่", "cat": "กาแฟ", "prices": {"ร้อน": 50, "เย็น": 60}, "sweet": true, "order": 4}, {"id": "m06", "name": "คาราเมลมัคคิอาโต้", "cat": "กาแฟ", "prices": {"ร้อน": 60, "เย็น": 70}, "sweet": true, "order": 5}, {"id": "m07", "name": "เดอร์ตี้", "cat": "กาแฟ", "prices": {"เย็น": 90}, "sweet": true, "order": 6}, {"id": "m08", "name": "แฟลตไวท์", "cat": "กาแฟ", "prices": {"ร้อน": 60}, "sweet": true, "order": 7}, {"id": "m09", "name": "อเมริกาโน่ น้ำผึ้งมะนาว", "cat": "กาแฟมิกซ์", "prices": {"เย็น": 65}, "sweet": true, "order": 8}, {"id": "m10", "name": "อเมริกาโน่ พีช โซดา", "cat": "กาแฟมิกซ์", "prices": {"เย็น": 80}, "sweet": true, "order": 9}, {"id": "m11", "name": "อเมริกาโน่ ส้ม", "cat": "กาแฟมิกซ์", "prices": {"เย็น": 60}, "sweet": true, "order": 10}, {"id": "m12", "name": "อเมริกาโน่ มะพร้าว", "cat": "กาแฟมิกซ์", "prices": {"เย็น": 60}, "sweet": true, "order": 11}, {"id": "m13", "name": "พีช ลาเต้", "cat": "กาแฟมิกซ์", "prices": {"เย็น": 75}, "sweet": true, "order": 12}, {"id": "m14", "name": "มะพร้าว ลาเต้", "cat": "กาแฟมิกซ์", "prices": {"เย็น": 65}, "sweet": true, "order": 13}, {"id": "m15", "name": "คาราเมล ลาเต้", "cat": "กาแฟมิกซ์", "prices": {"เย็น": 65}, "sweet": true, "order": 14}, {"id": "m16", "name": "บลูเบอร์รี่ ลาเต้", "cat": "กาแฟมิกซ์", "prices": {"เย็น": 65}, "sweet": true, "order": 15}, {"id": "m17", "name": "นูเทลล่า ลาเต้ บิสคอฟ", "cat": "กาแฟมิกซ์", "prices": {"เย็น": 85}, "sweet": true, "order": 16}, {"id": "m18", "name": "สกิปปี้ ลาเต้ บิสคอฟ", "cat": "กาแฟมิกซ์", "prices": {"เย็น": 85}, "sweet": true, "order": 17}, {"id": "m19", "name": "เอสเย็นไทยสไตล์", "cat": "กาแฟมิกซ์", "prices": {"เย็น": 70}, "sweet": true, "order": 18}, {"id": "m20", "name": "เพียวมัทฉะ", "cat": "มัทฉะ", "prices": {"ร้อน": 40, "เย็น": 45}, "sweet": true, "order": 19}, {"id": "m21", "name": "มัทฉะ ลาเต้", "cat": "มัทฉะ", "prices": {"ร้อน": 50, "เย็น": 60}, "sweet": true, "order": 20}, {"id": "m22", "name": "มัทฉะ คาราเมล", "cat": "มัทฉะ", "prices": {"ร้อน": 50, "เย็น": 65}, "sweet": true, "order": 21}, {"id": "m23", "name": "มัทฉะ ส้ม", "cat": "มัทฉะ", "prices": {"เย็น": 65}, "sweet": true, "order": 22}, {"id": "m24", "name": "มัทฉะ มะพร้าว", "cat": "มัทฉะ", "prices": {"เย็น": 65}, "sweet": true, "order": 23}, {"id": "m25", "name": "โฟมมัทฉะมะพร้าว", "cat": "มัทฉะ", "prices": {"เย็น": 70}, "sweet": true, "order": 24}, {"id": "m26", "name": "มัทฉะ น้ำผึ้งมะนาว", "cat": "มัทฉะ", "prices": {"เย็น": 70}, "sweet": true, "order": 25}, {"id": "m27", "name": "มัทฉะ บลูเบอร์รี่", "cat": "มัทฉะ", "prices": {"เย็น": 75}, "sweet": true, "order": 26}, {"id": "m28", "name": "มัทฉะ สตรอเบอร์รี่", "cat": "มัทฉะ", "prices": {"เย็น": 75}, "sweet": true, "order": 27}, {"id": "m29", "name": "มัทฉะ พีช", "cat": "มัทฉะ", "prices": {"เย็น": 75}, "sweet": true, "order": 28}, {"id": "m30", "name": "มัทฉะ เอสเพรสโซ่", "cat": "มัทฉะ", "prices": {"ร้อน": 65, "เย็น": 75}, "sweet": true, "order": 29}, {"id": "m31", "name": "มัทฉะ นูเทลล่า บิสคอฟฟ์", "cat": "มัทฉะ", "prices": {"เย็น": 85}, "sweet": true, "order": 30}, {"id": "m32", "name": "มัทฉะ สคิปปี้ บิสคอฟฟ์", "cat": "มัทฉะ", "prices": {"เย็น": 85}, "sweet": true, "order": 31}, {"id": "m33", "name": "ชาไทย", "cat": "ชา โกโก้ นม", "prices": {"ร้อน": 35, "เย็น": 40}, "sweet": true, "order": 32}, {"id": "m34", "name": "ชาไทย โกโก้", "cat": "ชา โกโก้ นม", "prices": {"ร้อน": 35, "เย็น": 45}, "sweet": true, "order": 33}, {"id": "m35", "name": "ชาไทย มะพร้าว", "cat": "ชา โกโก้ นม", "prices": {"เย็น": 55}, "sweet": true, "order": 34}, {"id": "m36", "name": "นมสด", "cat": "ชา โกโก้ นม", "prices": {"เย็น": 45}, "sweet": true, "order": 35}, {"id": "m37", "name": "นมสด สตรอเบอร์รี่", "cat": "ชา โกโก้ นม", "prices": {"เย็น": 45}, "sweet": true, "order": 36}, {"id": "m38", "name": "นมสด บลูเบอร์รี่", "cat": "ชา โกโก้ นม", "prices": {"เย็น": 45}, "sweet": true, "order": 37}, {"id": "m39", "name": "นมสด พีช", "cat": "ชา โกโก้ นม", "prices": {"เย็น": 45}, "sweet": true, "order": 38}, {"id": "m40", "name": "นมสด คาราเมล", "cat": "ชา โกโก้ นม", "prices": {"เย็น": 45}, "sweet": true, "order": 39}, {"id": "m41", "name": "โกโก้", "cat": "ชา โกโก้ นม", "prices": {"เย็น": 50}, "sweet": true, "order": 40}, {"id": "m42", "name": "โกโก้ สตรอเบอร์รี่", "cat": "ชา โกโก้ นม", "prices": {"เย็น": 55}, "sweet": true, "order": 41}, {"id": "m43", "name": "โกโก้ บลูเบอร์รี่", "cat": "ชา โกโก้ นม", "prices": {"เย็น": 55}, "sweet": true, "order": 42}];

/* ---------- state ---------- */
const S={tab:'sell',cat:'ทั้งหมด',menu:lsGet('pos.menu',[]),config:{...DEFAULT_CONFIG,...lsGet('pos.config',{})},
  cart:lsGet('pos.cart',{lines:[],discount:0,mode:'ทานที่ร้าน'}),today:[],todayKey:dayKey(),viewDay:dayKey(),range:'day',dayCache:{},dayFetched:{},loading:false,loadErr:false,
  queue:lsGet('pos.queue',[]),db:null,mode:'loading',menuLoaded:false,stale:false,downloads:null,modal:null,inflight:new Set()};
const saveCart=()=>lsSet('pos.cart',S.cart);
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
  S.queue=S.queue.filter(x=>x.id!==sale.id);S.queue.push(sale);lsSet('pos.queue',S.queue);flush();
}
function flush(){
  if(!S.db)return;
  S.queue.forEach(sale=>{
    if(S.inflight.has(sale.id))return;S.inflight.add(sale.id);
    S.db.collection('days/'+sale.day+'/sales').doc(sale.id).set(sale).then(()=>{
      S.inflight.delete(sale.id);
      const cur=S.queue.find(x=>x.id===sale.id);
      if(cur===sale){S.queue=S.queue.filter(x=>x!==sale);lsSet('pos.queue',S.queue);
        const list=sale.day===S.todayKey?S.today:(S.dayCache[sale.day]||null);
        if(list){const i=list.findIndex(x=>x.id===sale.id);if(i>=0)list[i]=sale;else list.push(sale)}
      }
      renderChrome();
    }).catch(e=>{S.inflight.delete(sale.id);toast(e&&e.code==='permission-denied'?'บัญชีนี้ยังไม่มีสิทธิ์บันทึกข้อมูล บิลยังอยู่ในเครื่องนี้':'ยังส่งบิลไม่สำเร็จ บิลยังอยู่ในเครื่องนี้และจะลองส่งใหม่');renderChrome()});
  });
  renderChrome();
}
function saveMenuItem(it){
  const i=S.menu.findIndex(x=>x.id===it.id);if(i>=0)S.menu[i]=it;else S.menu.push(it);sortMenu();lsSet('pos.menu',S.menu);
  if(S.db)S.db.collection('menu').doc(it.id).set(it).catch(()=>toast('บันทึกเมนูไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง'));
}
function deleteMenuItem(id){S.menu=S.menu.filter(x=>x.id!==id);lsSet('pos.menu',S.menu);if(S.db)S.db.collection('menu').doc(id).delete().catch(()=>toast('ลบเมนูไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง'))}
function saveConfig(patch){S.config={...S.config,...patch};lsSet('pos.config',S.config);if(S.db)S.db.doc('config/shop').set(S.config).catch(()=>toast('บันทึกการตั้งค่าไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง'));renderChrome()}
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
    if(!s.metadata.fromCache||s.size){S.menu=s.docs.map(d=>({...d.data()}));sortMenu();lsSet('pos.menu',S.menu)}
    if(!S.modal)render();else renderChrome();
  },e=>{clearTimeout(timer);deny(e)}));
  unsubs.push(db.doc('config/shop').onSnapshot(s=>{if(s.exists){S.config={...DEFAULT_CONFIG,...s.data()};lsSet('pos.config',S.config);renderChrome()}},deny));
  listenToday();flush();render();
}
function stop(){unsubs.forEach(u=>u());unsubs=[];if(listenToday.u){listenToday.u();listenToday.u=null}S.db=null}
function setInvalid(on){['l-email','l-pw'].forEach(id=>{const e=$(id);if(on){e.setAttribute('aria-invalid','true');e.setAttribute('aria-describedby','loginerr')}else{e.removeAttribute('aria-invalid');e.removeAttribute('aria-describedby')}})}
function boot(){
  ['l-email','l-pw'].forEach(id=>$(id).addEventListener('input',()=>{setInvalid(false);$('loginerr').textContent=''}));
  addEventListener('online',flush);addEventListener('offline',()=>{S.stale=true;renderChrome()});
  setInterval(()=>{if(!S.db)return;if(dayKey()!==S.todayKey){const was=S.viewDay===S.todayKey;listenToday();if(was)S.viewDay=S.todayKey}if(S.queue.length)flush()},30000);
  onUser(u=>{S.user=u;$('splash').hidden=true;$('login').hidden=!!u;document.querySelector('.app').hidden=!u;if(u){S.tab='sell';start()}else{stop();S.modal=null;$('modal').innerHTML=''}});
  $('loginform').addEventListener('submit',async e=>{e.preventDefault();e.stopPropagation();const b=$('loginbtn'),er=$('loginerr');b.disabled=true;b.classList.add('busy');b.textContent='กำลังเข้าสู่ระบบ';er.textContent='';
    try{await login($('l-email').value.trim(),$('l-pw').value);$('l-pw').value='';setInvalid(false)}catch(x){setInvalid(x.code!=='auth/network-request-failed'&&x.code!=='auth/too-many-requests');er.textContent=x.code==='auth/network-request-failed'?'เชื่อมต่ออินเทอร์เน็ตไม่ได้ ตรวจเน็ตแล้วลองอีกครั้ง':x.code==='auth/too-many-requests'?'ลองผิดหลายครั้งเกินไป รอสักครู่แล้วลองใหม่':'อีเมลหรือรหัสผ่านไม่ถูกต้อง'}
    b.disabled=false;b.classList.remove('busy');b.textContent='เข้าสู่ระบบ'});
}

/* ---------- render ---------- */
const THEMES={auto:{label:'อัตโนมัติ',next:'light',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>'},
 light:{label:'สว่าง',next:'dark',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'},
 dark:{label:'มืด',next:'auto',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>'}};
function themeMode(){const v=document.documentElement.getAttribute('data-theme');return v==='light'||v==='dark'?v:'auto'}
function applyTheme(m){if(m==='auto')document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme',m);try{localStorage.setItem('pos.theme',m)}catch(e){}
  const dark=m==='dark'||(m==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);const meta=document.querySelector('meta[name=theme-color]');if(meta)meta.content=dark?'#1D2127':'#794523';renderTheme()}
function renderTheme(){const b=$('themebtn');if(!b)return;const m=themeMode(),t=THEMES[m];b.innerHTML=t.icon+'<span class="tl">'+t.label+'</span>';b.setAttribute('aria-label','ธีม '+t.label+' แตะเพื่อเปลี่ยนเป็น'+THEMES[t.next].label)}
function renderChrome(){
  renderTheme();
  $('brand').textContent=S.config.name||'ชาบัง';
  document.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected',t.dataset.v===S.tab));
  $('sync').innerHTML=S.queue.length?'<span class="pill wait">รอส่ง '+S.queue.length+' บิล</span>':S.stale?'<span class="pill wait">ออฟไลน์</span>':'';
  let n='';
  if(S.denied)n='<div class="notice"><span>บัญชีนี้ยังอ่านหรือบันทึกข้อมูลไม่ได้ ตรวจกฎ Firestore ว่าใส่อีเมลบัญชีร้านถูกต้องและกด Publish แล้ว</span></div>';
  $('notice').innerHTML=n;$('notice').hidden=!n;
  document.querySelector('.app').style.gridTemplateRows=n?'auto auto 1fr':'auto 1fr';
}
function render(){renderChrome();({sell:renderSell,sales:renderSales,menu:renderMenu,config:renderConfig})[S.tab]();renderModal()}
function priceLabel(p){return Object.entries(p).map(([k,v])=>k==='ราคาเดียว'?'<span><b>'+v+'</b></span>':'<span>'+k+' <b>'+v+'</b></span>').join('')}
function cats(){return ['ทั้งหมด',...new Set(S.menu.map(m=>m.cat||'อื่น ๆ'))]}
function renderSell(){
  const list=S.menu.filter(m=>S.cat==='ทั้งหมด'||m.cat===S.cat);
  const tile=m=>{
    if(m.soldOut)return `<div class="tile out"><span class="tn">${esc(m.name)}</span><span class="pill">หมด</span></div>`;
    const ps=Object.entries(m.prices);
    if(ps.length===1&&ps[0][0]==='ราคาเดียว')return `<div class="tile"><button class="tn" data-act="${m.sweet?'pick':'quick'}" data-id="${esc(m.id)}" data-t="ราคาเดียว">${esc(m.name)}</button><div class="pbs"><button class="pb" data-act="quick" data-id="${esc(m.id)}" data-t="ราคาเดียว" aria-label="${esc(m.name)} ${ps[0][1]} บาท"><b class="num">${ps[0][1]}</b></button></div></div>`;
    return `<div class="tile"><button class="tn" data-act="pick" data-id="${esc(m.id)}" aria-label="${esc(m.name)} เลือกความหวาน">${esc(m.name)}<span class="more" aria-hidden="true">⋯</span></button><div class="pbs">${ps.map(([k,v])=>`<button class="pb" data-act="quick" data-id="${esc(m.id)}" data-t="${k}" aria-label="${esc(m.name)} ${k} ${v} บาท"><span>${k}</span> <b class="num">${v}</b></button>`).join('')}</div></div>`;
  };
  let grid;
  if(!list.length)grid=`<div class="empty" style="grid-column:1/-1">${S.menuLoaded?'<div>ยังไม่มีเมนู เพิ่มเมนูแรกแล้วเริ่มขายได้เลย</div><div class="chips"><button class="btn main" data-act="edit-menu">เพิ่มเมนู</button><button class="btn" data-act="starter">นำเข้าเมนู WITH YOU 43 รายการ</button></div>':'<div>กำลังโหลดเมนู</div>'}</div>`;
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
  ${S.cart.lines.length?'<button class="sbtn danger" data-act="clear">ล้างบิล</button>':''}</div></aside></div>`;
  const g=document.querySelector('.grid');if(g)g.scrollTop=scroll;
}
function isCup(l){return l.type==='ร้อน'||l.type==='เย็น'||l.type==='ปั่น'}
function catOf(l){if(l.cat)return l.cat;const m=S.menu.find(x=>x.id===l.mid&&x.name===l.name)||S.menu.find(x=>x.name===l.name);return m&&m.cat||'อื่น ๆ'}
function summary(days){
  const all=days.flatMap(d=>salesOf(d)),ok=all.filter(s=>!s.voided);
  const r={all,ok,total:0,cash:0,qr:0,cups:0,hot:0,iced:0,frappe:0,pieces:0,drinkAmt:0,items:{},cats:{},hours:{},perDay:{}};
  days.forEach(d=>{r.perDay[d]={cups:0,total:0,bills:0}});
  ok.forEach(s=>{
    r.total+=s.total;if(s.pay==='เงินสด')r.cash+=s.total;else r.qr+=s.total;
    const h=new Date(s.ts).getHours();r.hours[h]=(r.hours[h]||0)+s.total;
    const pd=r.perDay[s.day]||(r.perDay[s.day]={cups:0,total:0,bills:0});pd.total+=s.total;pd.bills++;
    s.lines.forEach(l=>{
      const amt=lineTotal(l),cup=isCup(l),c=catOf(l);
      const it=r.items[l.name]||(r.items[l.name]={qty:0,amt:0,hot:0,iced:0,frappe:0,other:0,cup});
      it.qty+=l.qty;it.amt+=amt;if(l.type==='ร้อน')it.hot+=l.qty;else if(l.type==='เย็น')it.iced+=l.qty;else if(l.type==='ปั่น')it.frappe+=l.qty;else it.other+=l.qty;
      const ct=r.cats[c]||(r.cats[c]={qty:0,amt:0,cup:false});ct.qty+=l.qty;ct.amt+=amt;if(cup)ct.cup=true;
      if(cup){r.cups+=l.qty;r.drinkAmt+=amt;pd.cups+=l.qty;if(l.type==='ร้อน')r.hot+=l.qty;else if(l.type==='เย็น')r.iced+=l.qty;else r.frappe+=l.qty}else r.pieces+=l.qty;
    });
  });
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
  const fr=r.itemList.some(x=>x[1].frappe),ot=r.itemList.some(x=>x[1].other);
  const cell=n=>`<td class="num">${n||'–'}</td>`;
  const table=r.itemList.length?`<div class="tw"><table class="tb"><thead><tr><th>เมนู</th><th>ร้อน</th><th>เย็น</th>${fr?'<th>ปั่น</th>':''}${ot?'<th>อื่น ๆ</th>':''}<th>รวม</th><th>ยอด</th></tr></thead><tbody>${r.itemList.map(([n,x])=>`<tr><td>${esc(n)}</td>${cell(x.hot)}${cell(x.iced)}${fr?cell(x.frappe):''}${ot?cell(x.other):''}<td class="num"><b>${x.qty}</b></td><td class="num">${baht(x.amt)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="muted">ยังไม่มีการขายในช่วงนี้</div>';
  const typeLine=[r.iced&&'เย็น '+r.iced,r.hot&&'ร้อน '+r.hot,r.frappe&&'ปั่น '+r.frappe].filter(Boolean).join(' · ')||'ยังไม่มีการขาย';
  const bills=R==='day'
   ?`<section class="panel"><h3>บิลทั้งหมด</h3>${r.all.length?'<div class="list">'+r.all.map(s=>`<div class="li"><span class="num">#${s.no}</span><div class="g"><span class="${s.voided?'voided':''}">${esc(s.lines.map(l=>l.name+(l.qty>1?' ×'+l.qty:'')).join(', '))}</span><small>${new Date(s.ts).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})} น. · ${esc(s.pay)} · ${esc(s.mode||'')}</small></div>${s.voided?'<span class="pill">ยกเลิกแล้ว</span>':`<strong class="num">${baht(s.total)}</strong><button class="link" data-act="print" data-id="${s.id}">พิมพ์</button><button class="link danger" data-act="void" data-id="${s.id}">ยกเลิก</button>`}</div>`).join('')+'</div>':'<div class="muted">บิลของวันนี้จะแสดงที่นี่หลังปิดการขายบิลแรก</div>'}</section>`
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
  <div class="payrow"><span>เงินสด <b class="num">${baht(r.cash)}</b></span><span>พร้อมเพย์ <b class="num">${baht(r.qr)}</b></span>${r.pieces?`<span>ของอื่นที่ไม่นับเป็นแก้ว <b class="num">${r.pieces} ชิ้น</b></span>`:''}</div>
  <div class="two">${chart}<section class="panel"><h3>แยกตามหมวด</h3>${cats}</section></div>
  <section class="panel"><h3>ทุกเมนูที่ขาย</h3>${table}</section>
  ${bills}
  </div></div>`;
  const sc=document.querySelector('#view .scroll');if(sc)sc.scrollTop=scroll;
}
function renderMenu(){
  $('view').innerHTML=`<div class="scroll"><div class="narrow"><div class="daybar"><h2>เมนู ${S.menu.length} รายการ</h2><button class="btn main" data-act="edit-menu">เพิ่มเมนู</button></div>
  ${S.menu.length?'<div class="list">'+S.menu.map(m=>`<div class="li"><div class="g"><b>${esc(m.name)}</b> ${m.soldOut?'<span class="pill">หมด</span>':''}<small>${esc(m.cat||'')} · ${Object.entries(m.prices).map(([k,v])=>(k==='ราคาเดียว'?'':k+' ')+v).join(' / ')} บาท</small></div><button class="btn" data-act="soldout" data-id="${esc(m.id)}">${m.soldOut?'มีขาย':'ของหมด'}</button><button class="btn" data-act="edit-menu" data-id="${esc(m.id)}">แก้ไข</button></div>`).join('')+'</div>':`<div class="empty"><div>ยังไม่มีเมนู</div><button class="btn" data-act="starter">นำเข้าเมนู WITH YOU 43 รายการ</button></div>`}</div></div>`;
}
function renderConfig(){
  const c=S.config;
  $('view').innerHTML=`<div class="scroll"><form class="narrow" id="cfg" style="max-width:560px">
  <label class="field"><span>ชื่อร้าน</span><input id="c-name" value="${esc(c.name)}"></label>
  <label class="field"><span>เบอร์พร้อมเพย์ 10 หลัก หรือเลขบัตร 13 หลัก หรือ e-Wallet 15 หลัก</span><input id="c-pp" inputmode="numeric" value="${esc(c.promptpay)}" placeholder="08xxxxxxxx"></label>
  <label class="field"><span>ตัวเลือกเพิ่ม บรรทัดละ 1 รายการ เขียนแบบ ชื่อ,ราคา</span><textarea id="c-add" rows="4">${esc(c.addons)}</textarea></label>
  <button class="btn main" type="submit">บันทึกการตั้งค่า</button>
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
 void(m){return `<h2>ยกเลิกบิล #${m.sale.no}?</h2><p>ยอด ${baht(m.sale.total)} จะถูกตัดออกจากยอดขาย แต่บิลยังแสดงในรายการพร้อมป้ายยกเลิกแล้ว</p><div class="pay"><button class="btn" data-act="close">ไม่ยกเลิก</button><button class="btn danger" data-act="void-ok">ยกเลิกบิล</button></div>`},
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
new MutationObserver(()=>{document.querySelectorAll('.cat,.seg button,.sheet .chip[data-act^="m-"]').forEach(b=>{const v=String(b.classList.contains('on'));if(b.getAttribute('aria-pressed')!==v)b.setAttribute('aria-pressed',v)});
  document.querySelectorAll('.tab').forEach(t=>{const v=t.getAttribute('aria-selected')==='true'?'0':'-1';if(t.getAttribute('tabindex')!==v)t.setAttribute('tabindex',v)})}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-selected']});
function finish(pay,extra){
  const t=billTotals(S.cart.lines,S.cart.discount),day=dayKey();
  const no=salesOf(day).reduce((a,s)=>Math.max(a,s.no||0),0)+1;
  const sale={id:'b'+Date.now()+Math.random().toString(36).slice(2,6),day,no,ts:Date.now(),lines:S.cart.lines,mode:S.cart.mode,sub:t.sub,discount:t.disc,total:t.total,pay,...extra};
  writeSale(sale);S.cart={lines:[],discount:0,mode:S.cart.mode};saveCart();S.modal={type:'done',sale};render();
}
function addLine(it,type,sweet,addonNames,qty=1){
  const ad=parseAddons(S.config.addons).filter(a=>addonNames.includes(a.name));
  const line={mid:it.id,name:it.name,cat:it.cat||'อื่น ๆ',type:type==='ราคาเดียว'?'':type,price:it.prices[type],sweet:it.sweet?sweet:'',addons:ad,qty};
  const k=JSON.stringify([line.mid,line.type,line.sweet,ad]);
  const same=S.cart.lines.find(l=>JSON.stringify([l.mid,l.type,l.sweet,l.addons])===k);
  if(same)same.qty+=qty;else S.cart.lines.push(line);saveCart();S.flash=S.cart.lines.indexOf(same||line);S.bump=true;setTimeout(()=>{S.bump=false},0);clearTimeout(addLine.t);addLine.t=setTimeout(()=>{S.flash=null;document.querySelectorAll('.line.flash').forEach(e=>e.classList.remove('flash'))},700);
}
function dailyText(){const days=rangeDays(S.range,S.viewDay),r=summary(days);return `สรุปยอดขาย ${S.config.name} ${rangeLabel(S.range,S.viewDay)}\nจำนวน ${r.cups} แก้ว\nยอดขาย ${baht(r.total)} จาก ${r.ok.length} บิล\nเงินสด ${baht(r.cash)}\nพร้อมเพย์ ${baht(r.qr)}\n`+r.itemList.slice(0,5).map(([n,x])=>`${n} ${x.qty}`).join('\n')}

/* ---------- events ---------- */
const ACT={
 theme(){const t=THEMES[themeMode()].next;applyTheme(t);toast('ใช้ธีม'+THEMES[t].label+(t==='auto'?' ตามการตั้งค่าของเครื่อง':''))},
 tab(d){S.tab=d.v;S.modal=null;if(d.v==='sales')loadRange();else render()},
 range(d){S.range=d.v;loadRange()},
 'open-day'(d){S.range='day';S.viewDay=d.v;loadRange()},cat(d){if(S.cat!==d.v){S.cat=d.v;S.swap=true;renderSell();S.swap=false;const g=document.querySelector('.grid');if(g)g.scrollTop=0}},mode(d){S.cart.mode=d.v;saveCart();renderSell()},
 pick(d){const it=S.menu.find(m=>m.id===d.id);if(!it||it.soldOut)return;const types=Object.keys(it.prices);
  if(!it.sweet&&types.length===1){addLine(it,types[0],'',[]);renderSell();return}
  openModal({type:'pick',item:it,type2:types.includes('เย็น')?'เย็น':types[0],sweet:SWEET[0],addons:[]})},
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
 'void-ok'(){writeSale({...S.modal.sale,voided:true,voidedAt:Date.now()});closeModal();toast('ยกเลิกบิลแล้ว')},
 'edit-menu'(d){const it=d.id?S.menu.find(m=>m.id===d.id):{};openModal({type:'editMenu',item:{...it}})},
 'del-ask'(){S.modal.confirmDel=true;renderModal()},'del-ok'(){deleteMenuItem(S.modal.item.id);closeModal();toast('ลบเมนูแล้ว')},
 soldout(d){const it=S.menu.find(m=>m.id===d.id);saveMenuItem({...it,soldOut:!it.soldOut});render()},
 starter(){SHOP_MENU.forEach(saveMenuItem);saveConfig({});render();toast('นำเข้าเมนูแล้ว')},
 logout(){logout()},
 print(d){printBill(salesOf(S.viewDay).concat(S.today).find(s=>s.id===d.id))},
 'copy-summary'(){const t=dailyText();navigator.clipboard.writeText(t).then(()=>toast('คัดลอกสรุปแล้ว วางใน LINE ได้เลย')).catch(()=>{openModal({type:'copy',text:t})})},
 async csv(){const r=summary(rangeDays(S.range,S.viewDay));const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const rows=[['วันที่','บิล','เวลา','รายการ','แบบ','ความหวาน','จำนวน','ยอดรายการ','ส่วนลดบิล','ยอดบิล','ชำระ','ประเภท','สถานะ']];
  r.all.forEach(s=>s.lines.forEach(l=>rows.push([s.day,s.no,new Date(s.ts).toLocaleTimeString('th-TH'),l.name,l.type,l.sweet,l.qty,lineTotal(l),s.discount,s.total,s.pay,s.mode,s.voided?'ยกเลิก':'ปกติ'])));
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
  if(e.target.id==='cfg'){saveConfig({name:$('c-name').value.trim()||'ร้านกาแฟ',promptpay:$('c-pp').value.trim(),addons:$('c-add').value});
    const pp=$('c-pp').value.trim();toast(pp&&!promptpayPayload(pp,1)?'เลขพร้อมเพย์ต้องมี 10, 13 หรือ 15 หลัก':'บันทึกการตั้งค่าแล้ว')}
  if(e.target.id==='mf'){const it=S.modal.item,prices={};TYPES.forEach((t,i)=>{const v=$('f-p'+i).value;if(v!=='')prices[t]=+v});
    if(!Object.keys(prices).length){toast('ใส่ราคาอย่างน้อย 1 ช่อง');return}
    const rec={...it,id:it.id||'m'+Date.now(),name:$('f-name').value.trim(),cat:$('f-cat').value.trim()||'อื่น ๆ',prices,sweet:$('f-sweet').checked,order:it.order??S.menu.length};
    delete rec.confirmDel;saveMenuItem(rec);closeModal();toast('บันทึกเมนูแล้ว')}
});
async function wake(){wake.on=true;try{if(navigator.wakeLock)await navigator.wakeLock.request('screen')}catch(e){}}
boot();
