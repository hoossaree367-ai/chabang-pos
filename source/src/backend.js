// Real backend: Firebase Auth + Firestore, exposed through the small store interface the POS uses.
import {initializeApp} from 'firebase/app';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'firebase/auth';
import {initializeFirestore,persistentLocalCache,persistentMultipleTabManager,collection,doc,setDoc,deleteDoc,getDocs,onSnapshot} from 'firebase/firestore';
import {getMessaging,getToken,isSupported} from 'firebase/messaging';
const app=initializeApp({
  apiKey:"AIzaSyAo79Ba45JpLmTpq-4cAdSCqLj0k6IFXlw",
  authDomain:"pos-chabang.firebaseapp.com",
  projectId:"pos-chabang",
  storageBucket:"pos-chabang.firebasestorage.app",
  messagingSenderId:"873185175060",
  appId:"1:873185175060:web:02660d11e3645393012901"
});
const auth=getAuth(app);
const fs=initializeFirestore(app,{ignoreUndefinedProperties:true,localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});
const wrapDoc=d=>({id:d.id,exists:d.exists(),data:()=>d.data()});
const wrapQ=s=>({docs:s.docs.map(wrapDoc),size:s.size,metadata:s.metadata});
const docRef=r=>({set:v=>setDoc(r,v),delete:()=>deleteDoc(r),onSnapshot:(n,e)=>onSnapshot(r,{includeMetadataChanges:true},d=>n({...wrapDoc(d),metadata:d.metadata}),e)});
export const db={
  doc:p=>docRef(doc(fs,p)),
  collection:p=>{const c=collection(fs,p);return{doc:id=>docRef(doc(c,id)),get:()=>getDocs(c).then(wrapQ),onSnapshot:(n,e)=>onSnapshot(c,{includeMetadataChanges:true},s=>n(wrapQ(s)),e)}}
};
export const onUser=fn=>onAuthStateChanged(auth,fn);
export const login=(email,pw)=>signInWithEmailAndPassword(auth,email,pw);
export const logout=()=>signOut(auth);
// Push notifications: the token identifies this device to Firebase Cloud Messaging; the ID token proves to the Apps Script relay that the caller is the shop account.
export const pushSupported=()=>isSupported().catch(()=>false);
export const pushToken=reg=>getToken(getMessaging(app),{serviceWorkerRegistration:reg});
export const idToken=()=>auth.currentUser?auth.currentUser.getIdToken():Promise.reject(new Error('not signed in'));
