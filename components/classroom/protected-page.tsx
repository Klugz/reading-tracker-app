import { service } from '@/lib/classroom/server';
import { redirect,notFound } from 'next/navigation';
import type { Role } from '@/lib/classroom/types';
import ClassroomApp,{type Tab} from './app';
export default async function ProtectedPage({role,classId,initialTab}:{role:Role;classId?:string;initialTab?:Tab}){

  let profile;
  try{profile=await(await service()).user();}catch(e){const status=(e as {status?:number}).status;if(status===428)redirect('/aluno/nova-senha');if(status===401)redirect(role==='teacher'?'/entrar/professor':'/entrar');return <ClassroomApp expectedRole={role} initialError="Não foi possível carregar os dados. Tente novamente."/>;}
  if(!profile)redirect('/');
  if(profile.role!==role)redirect(profile.role==='teacher'?'/professor':'/aluno');
  if(classId){try{await(await service()).ownedClass(classId);}catch(e){if((e as {status?:number}).status===404)notFound();throw e;}}
  return <ClassroomApp expectedRole={role} initialClassId={classId} initialTab={initialTab}/>;
}
