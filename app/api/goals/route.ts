import {apiError,service,checkOrigin} from '@/lib/classroom/server';
export const dynamic='force-dynamic';
export async function GET(){try{return Response.json({goals:(await(await service()).snapshot()).goals},{headers:{'Cache-Control':'no-store'}});}catch(e){return apiError(e);}}
export async function POST(request:Request){try{checkOrigin(request);const body=await request.json() as Record<string,unknown>;return Response.json(await(await service()).mutate({...body,action:'saveGoal'}),{status:201});}catch(e){return apiError(e);}}
export async function DELETE(request:Request){try{checkOrigin(request);return Response.json(await(await service()).mutate({action:'deleteGoal',id:new URL(request.url).searchParams.get('id')}));}catch(e){return apiError(e);}}
