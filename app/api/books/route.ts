import {apiError,service,checkOrigin} from '@/lib/classroom/server';
export const dynamic='force-dynamic';
export async function GET(){try{const s=await service();await s.requireRole('teacher');const data=await s.snapshot();return Response.json({books:data.books},{headers:{'Cache-Control':'no-store'}});}catch(e){return apiError(e);}}
export async function POST(request:Request){try{checkOrigin(request);const s=await service();await s.requireRole('teacher');const b=await request.json() as Record<string,unknown>;return Response.json(await s.mutate({...b,action:'saveBook',unit:b.unit||'pages'}),{status:201});}catch(e){return apiError(e);}}
export async function PATCH(request:Request){return POST(request);}
export async function DELETE(request:Request){try{checkOrigin(request);return Response.json(await(await service()).mutate({action:'deleteBook',id:new URL(request.url).searchParams.get('id')}));}catch(e){return apiError(e);}}
