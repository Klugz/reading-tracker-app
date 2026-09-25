import ProtectedPage from '@/components/classroom/protected-page';
export const dynamic='force-dynamic';
export default function Page(){return <ProtectedPage role="teacher" initialTab="classes"/>;}
