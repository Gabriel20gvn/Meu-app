const ENDPOINT_KEY='compasso-processor';
const TOKEN_KEY='compasso-processor-token';
export function processorConfig(){
  let endpoint='',token='';
  try {endpoint=localStorage.getItem(ENDPOINT_KEY)||'';token=sessionStorage.getItem(TOKEN_KEY)||'';}catch{}
  endpoint=endpoint||import.meta.env.VITE_TRANSCRIPTION_API_URL||'';
  return {endpoint,token};
}
export function normalizeEndpoint(value){
  const url=new URL(value);
  if(url.username||url.password||url.search||url.hash)throw new Error('Use somente o endereço do processador, sem chave ou parâmetros no link.');
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&local))throw new Error('O processador na nuvem deve usar um endereço HTTPS.');
  return url.href.replace(/\/$/,'');
}
export function storeProcessor(endpoint,token){
  localStorage.setItem(ENDPOINT_KEY,normalizeEndpoint(endpoint));
  sessionStorage.setItem(TOKEN_KEY,token.trim());
}
export async function processorRequest(path,{method='GET',body,config=processorConfig(),timeout=25000}={}){
  if(!config.endpoint||!config.token)throw Object.assign(new Error('Conecte seu processador para gerar a partitura.'),{code:'connection_required'});
  const headers={Authorization:`Bearer ${config.token}`};
  if(body && !(body instanceof FormData)){headers['Content-Type']='application/json';body=JSON.stringify(body);}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(config.endpoint+path,{method,body,headers,signal:controller.signal});
    if(!response.ok){
      const data=await response.json().catch(()=>({}));
      const message=typeof data.detail==='string'?data.detail:response.status===422?'Confira o link, o arquivo e o BPM informado.':'O processador não conseguiu atender ao pedido.';
      throw Object.assign(new Error(message),{code:response.status===401?'connection_required':response.status===404?'expired':'request_failed'});
    }
    return response;
  }catch(e){
    if(typeof e.code==='string')throw e;
    throw Object.assign(new Error('Não foi possível conectar ao processador. Confira a conexão e tente novamente.'),{code:'network'});
  }finally{clearTimeout(timer);}
}
export async function processorJSON(path,options){return (await processorRequest(path,options)).json();}
