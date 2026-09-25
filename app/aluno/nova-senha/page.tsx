import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {authService} from '@/lib/classroom/server';
import {SESSION_COOKIE} from '@/lib/classroom/student-auth';
import {FirstPassword} from '@/components/classroom/login';
export const dynamic='force-dynamic';
export default async function Page(){const session=await authService().session((await cookies()).get(SESSION_COOKIE)?.value);if(!session)redirect('/entrar');if(!session.mustChangePassword)redirect('/aluno');return <FirstPassword name={session.name} enrollment={session.studentId}/>;}
