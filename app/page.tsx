import {getChatGPTUser} from './chatgpt-auth';
import {cookies} from 'next/headers';
import {service} from '@/lib/classroom/server';
import {SESSION_COOKIE} from '@/lib/classroom/student-auth';
import {redirect} from 'next/navigation';
import ClassroomApp from '@/components/classroom/app';
import {StudentLogin} from '@/components/classroom/login';
export const dynamic='force-dynamic';
export default async function Page(){
 const identity=await getChatGPTUser(),token=(await cookies()).get(SESSION_COOKIE)?.value;
 if(!identity&&!token)return <StudentLogin/>;
 let profile;try{profile=await(await service()).user();}catch(e){const status=(e as {status?:number}).status;if(status===428)redirect('/aluno/nova-senha');if(status===401)return <StudentLogin/>;return <ClassroomApp expectedRole={null} initialError="Não foi possível carregar seu perfil. Tente novamente."/>;}
 if(profile)redirect(profile.role==='teacher'?'/professor':'/aluno');
 return <ClassroomApp expectedRole={null}/>;
}
