'use client';
export class RequestError extends Error{
 constructor(message:string,public status:number,public fields:Record<string,string>={}){super(message);}
}
export async function fetchJson(url:string,command?:Record<string,unknown>){
 const r=await fetch(url,{method:command?'POST':'GET',cache:'no-store',headers:command?{'Content-Type':'application/json'}:undefined,body:command?JSON.stringify(command):undefined});
 let body:Record<string,unknown>;try{body=await r.json();}catch{throw new RequestError('Não foi possível acessar o serviço. Tente novamente.',r.status);}
 if(!r.ok){const fields=Object.fromEntries(((body.details||[]) as {field:string;message:string}[]).map(e=>[e.field,e.message]));if(String(body.error).includes('esta matrícula'))fields.enrollment=String(body.error);throw new RequestError(String(body.error||'Não foi possível concluir a ação.'),r.status,fields);}
 return body;
}
