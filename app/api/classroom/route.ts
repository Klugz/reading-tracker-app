import { apiError,checkOrigin,service } from '@/lib/classroom/server';
export const dynamic='force-dynamic';
export async function GET(){try{return Response.json(await (await service()).snapshot(),{headers:{'Cache-Control':'no-store'}});}catch(e){return apiError(e);}}
export async function POST(request:Request){try{checkOrigin(request);const s=await service();return Response.json(await s.mutate(await request.json()),{headers:{'Cache-Control':'no-store'}});}catch(e){return apiError(e);}}
