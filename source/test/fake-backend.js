// In-memory stand-in for the Firebase layer, for testing POS flows only.
const store=window.__store=new Map(JSON.parse(localStorage.getItem('__fake')||'[]'));const ls=new Set();
const save=()=>localStorage.setItem('__fake',JSON.stringify([...store]));const emit=()=>ls.forEach(f=>f());
const wait=()=>new Promise(r=>setTimeout(r,20));
const docRef=p=>({set:async v=>{if(window.__deny)throw{code:'permission-denied'};if(window.__offline)await new Promise(r=>{const t=setInterval(()=>{if(!window.__offline){clearInterval(t);r()}},50)});JSON.stringify(v);store.set(p,JSON.parse(JSON.stringify(v)));save();emit()},delete:async()=>{store.delete(p);save();emit()},
 onSnapshot(n,e){const f=()=>{if(window.__deny)return e&&e({code:'permission-denied'});n({id:p,exists:store.has(p),data:()=>store.get(p),metadata:{fromCache:false}})};ls.add(f);setTimeout(f,10);return()=>ls.delete(f)}});
const snap=p=>{const d=[...store.keys()].filter(k=>k.startsWith(p+'/')&&k.slice(p.length+1).indexOf('/')<0).sort().map(k=>({id:k,exists:true,data:()=>store.get(k)}));return{docs:d,size:d.length,metadata:{fromCache:false}}};
export const db={doc:docRef,collection:p=>({doc:id=>docRef(p+'/'+id),get:async()=>snap(p),onSnapshot(n,e){const f=()=>{if(window.__deny)return e&&e({code:'permission-denied'});n(snap(p))};ls.add(f);setTimeout(f,10);return()=>ls.delete(f)}})};
let cb,user=JSON.parse(localStorage.getItem('__u')||'null');
export const onUser=f=>{cb=f;setTimeout(()=>f(user),10);return()=>{}};
export const login=async(e,p)=>{await wait();if(p!=='ok')throw{code:'auth/invalid-credential'};user={email:e};localStorage.setItem('__u',JSON.stringify(user));cb(user)};
export const logout=async()=>{user=null;localStorage.removeItem('__u');cb(null)};
