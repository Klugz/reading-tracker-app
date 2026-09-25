import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.resolve('wrangler/package.json'));
const {Miniflare}=require('miniflare');const {build}=require('esbuild');
await writeFile('.sites-runtime/auth-worker-entry.ts',`import {classroomService} from '../lib/classroom/service';import {studentAuth} from '../lib/classroom/student-auth';export default {async fetch(request,env){try{const body=await request.json();const service=classroomService(env.DB,body.id||'test-teacher');const auth=studentAuth(env.DB);const result=body.kind==='login'?await auth.login(body.input,'runtime-test'):body.kind==='password'?await auth.changePassword(body.token,body.input):body.kind==='snapshot'?await service.snapshot():await service.mutate(body.input);return Response.json(result);}catch(e){return Response.json({error:e.message},{status:e.status||500});}}};`);
const output=await build({entryPoints:['.sites-runtime/auth-worker-entry.ts'],bundle:true,write:false,format:'esm',platform:'node',target:'es2022',external:['node:crypto']});
const mf=new Miniflare({modules:true,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],script:output.outputFiles[0].text,d1Databases:['DB']});
try{
 const db=await mf.getD1Database('DB');
 for(const f of ['0000_reflective_the_fallen','0001_fluffy_spirit','0002_cheerful_tattoo','0003_freezing_amazoness','0004_gigantic_luminals','0005_purple_golden_guardian','0006_dear_boomerang']){const sql=await readFile(`drizzle/${f}.sql`,'utf8');for(const statement of sql.split(';').map(s=>s.replaceAll('--> statement-breakpoint','').trim()).filter(Boolean))await db.prepare(statement).run();}
 async function request(body,status=200){const r=await mf.dispatchFetch('http://localhost',{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;}
 await request({input:{action:'onboard',name:'Professor de teste',role:'teacher'}});
 const group=await request({input:{action:'saveClass',name:'Turma de teste'}});
 await request({input:{action:'createStudent',name:'Aluno de teste',enrollment:'202600101',classIds:[group.id]}});
 const first=await request({kind:'login',input:{enrollment:'202600101',password:'EDU123'}});assert.equal(first.mustChangePassword,true);
 await request({kind:'snapshot',id:'202600101'},428);
 await request({kind:'password',token:first.token,input:{password:'Senha de teste 101',confirmation:'Senha de teste 101'}});
 const book=await request({input:{action:'saveBook',title:'Livro de teste',author:'Autor',totalPages:200,unit:'pages'}});
 const summary=await request({input:{action:'previewAssignment',mode:'class',classIds:[group.id],bookId:book.id,deadline:null}});
 await request({input:{action:'distribute',mode:'class',classIds:[group.id],bookId:book.id,deadline:null,versions:summary.versions}});
 let s=await request({kind:'snapshot',id:'202600101'});const reading=s.assignments[0];
 await request({id:'202600101',input:{action:'progress',id:reading.id,progress:100,version:0}});
 await request({input:{action:'correctEnrollment',studentId:'202600101',enrollment:'202600102',version:1,confirmed:true}});
 s=await request({kind:'snapshot',id:'202600102'});assert.equal(s.assignments[0].id,reading.id);assert.equal(s.assignments[0].progress,100);assert.equal(s.events.length,1);assert.equal(s.classMembers[0].studentId,'202600102');
 await request({kind:'login',input:{enrollment:'202600102',password:'Senha de teste 101'}});
 const parent=s.classBooks[0];
 await request({input:{action:'classDeadline',id:parent.id,deadline:'2001-01-01',version:parent.version,confirmed:true}});
 await request({input:{action:'createStudent',name:'Novo aluno',enrollment:'202600103',classIds:[group.id]}});
 let teacher=await request({kind:'snapshot'});const added=teacher.assignments.find(a=>a.studentId==='202600103');assert.equal(added.deadline,'2001-01-01');assert.equal(added.progress,0);
 await request({id:'202600102',input:{action:'progress',id:reading.id,progress:200,version:1}});
 await request({input:{action:'classDeadline',id:parent.id,deadline:null,version:parent.version+1,confirmed:true}});
 s=await request({kind:'snapshot',id:'202600102'});assert.equal(s.assignments[0].deadline,null);assert.equal(s.events[0].completionDeadline,'2001-01-01');
 await request({input:{action:'correctProgress',id:reading.id,progress:150,version:2,reason:'Página incorreta',confirmed:true}});
 s=await request({kind:'snapshot',id:'202600102'});assert.equal(s.assignments[0].completedAt,null);assert.equal(s.events[0].kind,'correction');assert.equal(s.events.length,3);
 assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 process.stdout.write('Worker + D1 smoke passed: migrations, authentication, enrollment rekey, automatic readings, shared deadlines and audited corrections.\n');
}finally{await mf.dispose();}
