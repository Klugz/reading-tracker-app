import ProtectedPage from '@/components/classroom/protected-page';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <ProtectedPage role="teacher" classId={id} initialTab="classes"/>;}
