import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ApiError, classroomService } from './service';
import { ZodError } from 'zod';
import {cookies} from 'next/headers';
import {studentAuth,SESSION_COOKIE} from './student-auth';
export function authService(){if(!env.DB)throw new ApiError(503,'Serviço indisponível. Tente novamente.');return studentAuth(env.DB);}
export async function service(){
  if(!env.DB)throw new ApiError(503,'O serviço está temporariamente indisponível. Tente novamente.');
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  if(token){const session=await studentAuth(env.DB).session(token);if(!session)throw new ApiError(401,'Sua sessão expirou. Entre novamente.');if(session.mustChangePassword)throw new ApiError(428,'Crie sua senha pessoal para continuar.');return classroomService(env.DB,session.studentId);}
  const identity=await getChatGPTUser();
  if(!identity)throw new ApiError(401,'Entre na sua conta para continuar.');
  const managed=await env.DB.prepare('SELECT student_id FROM managed_students WHERE student_id=? OR legacy_identity=?').bind(identity.userId,identity.userId).first();
  if(managed)throw new ApiError(401,'Entre com sua matrícula e senha.');
  return classroomService(env.DB,identity.userId);
}
export function apiError(error:unknown){
  if(error instanceof ApiError)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});
  if(error instanceof ZodError){const details=error.issues.map(i=>({field:i.path.join('.'),message:i.code==='custom'?i.message:i.code==='invalid_string'?(i.validation==='email'?'Informe um e-mail válido.':i.validation==='url'?'Informe um link HTTPS válido.':i.message.startsWith('Use ')?i.message:'Confira o formato informado.'):i.code==='too_small'?`Informe ${'minimum' in i?`pelo menos ${i.minimum}${i.type==='string'?' caracteres':''}`:'um valor válido'}.`:i.code==='too_big'?'O valor informado ultrapassa o limite permitido.':i.code==='invalid_type'?'Preencha este campo com um valor válido.':'Revise este campo.'}));return Response.json({error:'Revise os campos indicados.',details},{status:400,headers:{'Cache-Control':'no-store'}});}
  console.error('classroom',error);
  return Response.json({error:'Não foi possível salvar ou carregar os dados. Tente novamente.'},{status:503});
}
export function checkOrigin(request:Request){
  const origin=request.headers.get('origin');
  if(request.headers.get('sec-fetch-site')==='cross-site'||(origin&&origin!==new URL(request.url).origin))throw new ApiError(403,'Origem não permitida.');
}
