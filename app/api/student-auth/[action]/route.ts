import {cookies} from 'next/headers';
import {authService,checkOrigin,apiError} from '@/lib/classroom/server';
import {SESSION_COOKIE} from '@/lib/classroom/student-auth';
import {ApiError} from '@/lib/classroom/errors';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}){
 try{checkOrigin(request);if(!request.headers.get('content-type')?.includes('application/json'))throw new ApiError(415,'Formato inválido.');const {action}=await params;const jar=await cookies(),auth=authService(),current=jar.get(SESSION_COOKIE)?.value;
  if(action==='logout'){await auth.logout(current);jar.set(SESSION_COOKIE,'',{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:0});return Response.json({saved:true},{headers:{'Cache-Control':'no-store'}});}
  const raw=await request.text();if(raw.length>4096)throw new ApiError(413,'Dados de acesso inválidos.');let input;try{input=JSON.parse(raw);}catch{throw new ApiError(400,'Dados de acesso inválidos.');}
  const result=action==='login'?await auth.login(input,request.headers.get('cf-connecting-ip')||'unknown'):action==='password'?await auth.changePassword(current,input):null;
  if(!result)throw new ApiError(404,'Ação não encontrada.');
  if(action==='login')await auth.logout(current);
  jar.set(SESSION_COOKIE,result.token,{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:result.maxAge});
  return Response.json({redirect:'mustChangePassword' in result&&result.mustChangePassword?'/aluno/nova-senha':'/aluno'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e);}
}
