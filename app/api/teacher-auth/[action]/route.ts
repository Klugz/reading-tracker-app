import {cookies} from 'next/headers';
import {teacherAuthService,authService,checkOrigin,apiError} from '@/lib/classroom/server';
import {TEACHER_COOKIE} from '@/lib/classroom/teacher-auth';
import {SESSION_COOKIE} from '@/lib/classroom/student-auth';
import {ApiError} from '@/lib/classroom/errors';
export const dynamic='force-dynamic';
const options={httpOnly:true,secure:true,sameSite:'strict' as const,path:'/'};
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}){
 try{
  checkOrigin(request);
  if(!request.headers.get('content-type')?.includes('application/json'))throw new ApiError(415,'Formato inválido.');
  const {action}=await params,jar=await cookies(),auth=teacherAuthService(),current=jar.get(TEACHER_COOKIE)?.value;
  if(action==='logout'){
   await auth.logout(current);jar.set(TEACHER_COOKIE,'',{...options,maxAge:0});
   return Response.json({saved:true},{headers:{'Cache-Control':'no-store'}});
  }
  if(action!=='login')throw new ApiError(404,'Ação não encontrada.');
  const raw=await request.text();if(raw.length>4096)throw new ApiError(413,'Dados de acesso inválidos.');
  let input;try{input=JSON.parse(raw);}catch{throw new ApiError(400,'Dados de acesso inválidos.');}
  const result=await auth.login(input,request.headers.get('cf-connecting-ip')||'unknown');
  await auth.logout(current);
  await authService().logout(jar.get(SESSION_COOKIE)?.value);
  jar.set(SESSION_COOKIE,'',{...options,maxAge:0});
  jar.set(TEACHER_COOKIE,result.token,{...options,maxAge:result.maxAge});
  return Response.json({redirect:'/professor'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e);}
}
