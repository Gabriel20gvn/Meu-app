let dbPromise;
function database(){
  return dbPromise??=new Promise((resolve,reject)=>{
    const request=indexedDB.open('compasso-sessions',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('sessions',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>{dbPromise=null;reject(new Error('O navegador não permitiu abrir a biblioteca local.'));};
  });
}
async function transaction(mode,action){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('sessions',mode),request=action(tx.objectStore('sessions'));
    tx.oncomplete=()=>resolve(request.result);
    tx.onerror=tx.onabort=()=>reject(new Error('Não foi possível salvar a música. Verifique o espaço disponível e as permissões do navegador.'));
  });
}
export const saveSession=session=>transaction('readwrite',store=>store.put(session));
export const getSession=id=>transaction('readonly',store=>store.get(id));
export const deleteSession=id=>transaction('readwrite',store=>store.delete(id));
export async function listSessions(){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const out=[],tx=db.transaction('sessions'),req=tx.objectStore('sessions').openCursor();
    req.onsuccess=()=>{const cursor=req.result;if(cursor){const {id,title,duration,score}=cursor.value;out.push({id,title,duration,hasScore:!!score});cursor.continue();}};
    tx.oncomplete=()=>resolve(out);tx.onerror=()=>reject(new Error('Não foi possível carregar a biblioteca local.'));
  });
}
