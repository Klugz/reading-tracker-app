import ProtectedPage from '@/components/classroom/protected-page';
import type {Tab} from '@/components/classroom/app';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{view?:string}>}){const {view}=await searchParams;const allowed=['dashboard','library','students','reports','goals'];return <ProtectedPage role="teacher" initialTab={allowed.includes(view||'')?view as Tab:'dashboard'}/>;}
