/** Real compiled Next/Vinext routes and cookie sessions in an isolated Worker/D1.
 * Synthetic gateway headers model the hosting boundary locally; no deployed data
 * or authentication implementation is modified. This is HTTP integration, not UI QA.
 */
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const require=createRequire(import.meta.resolve('wrangler/package.json'));
const {Miniflare}=require('miniflare');
const files=(await readdir('dist/server',{recursive:true})).filter(f=>f.endsWith('.js')||f.endsWith('.mjs'));
const modules=['index.js',...files.filter(f=>f!=='index.js')].map(path=>({type:'ESModule',path:resolve('dist/server',path)}));
const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],assets:{directory:resolve('dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}}});
const teacher={'oai-authenticated-user-id':'http-teacher','oai-authenticated-user-email':'teacher@example.test'};
let assertions=0;
const check=(condition,message)=>{assert.ok(condition,message);assertions++;};
async function request(path,{body,headers={},cookie,status=200}={}){
 const response=await mf.dispatchFetch('https://classroom.test'+path,{method:body?'POST':'GET',redirect:'manual',headers:{...headers,...(body?{'Content-Type':'application/json',Origin:'https://classroom.test'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
 const text=await response.text();assert.equal(response.status,status,`${path}: ${text.slice(0,300)}`);assertions++;
 return {response,text,json:response.headers.get('content-type')?.includes('application/json')?JSON.parse(text):null,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
const mutation=(body,options={})=>request('/api/classroom',{body,headers:teacher,...options});
try{
 const db=await mf.getD1Database('DB');
 for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())for(const statement of (await readFile('drizzle/'+file,'utf8')).split(';').map(s=>s.replaceAll('--> statement-breakpoint','').trim()).filter(Boolean))await db.prepare(statement).run();
 await request('/api/classroom',{status:401});
 const entry=await request('/entrar');check(entry.text.includes('matrícula')||entry.text.includes('Matrícula'),'login page rendered');
 await mutation({action:'onboard',name:'Professor HTTP',role:'teacher'});
 const group=(await mutation({action:'saveClass',name:'Turma HTTP'})).json;
 const secondGroup=(await mutation({action:'saveClass',name:'Outra turma HTTP'})).json;
 await mutation({action:'createStudent',name:'Mesmo Nome',enrollment:'9070001',classIds:[group.id]});
 await mutation({action:'createStudent',name:'Mesmo Nome',enrollment:'9070002',classIds:[group.id,secondGroup.id]});
 await mutation({action:'createStudent',name:'Duplicado',enrollment:'9070001',classIds:[]},{status:409});
 let login=await request('/api/student-auth/login',{body:{enrollment:'9070001',password:'EDU123'}});
 check(login.json.redirect==='/aluno/nova-senha','first login redirects to mandatory password change');
 check(/HttpOnly/i.test(login.response.headers.get('set-cookie'))&&/Secure/i.test(login.response.headers.get('set-cookie'))&&/SameSite=Strict/i.test(login.response.headers.get('set-cookie')),'secure session cookie');
 await request('/api/classroom',{cookie:login.cookie,status:428});
 const gated=await request('/aluno',{cookie:login.cookie,status:307});check(gated.response.headers.get('location')==='/aluno/nova-senha','protected page enforces password change');
 const passwordPage=await request('/aluno/nova-senha',{cookie:login.cookie});check(passwordPage.text.includes('9070001'),'password page renders own enrollment');
 const changed=await request('/api/student-auth/password',{cookie:login.cookie,body:{password:'Minha senha HTTP 2026',confirmation:'Minha senha HTTP 2026'}});const cookie=changed.cookie;
 await request('/api/classroom',{cookie:login.cookie,status:401});
 check(changed.json.redirect==='/aluno','password change redirects to readings');
 await request('/aluno',{cookie});
 const wrongRole=await request('/professor',{cookie,status:307});check(wrongRole.response.headers.get('location')==='/aluno','student cannot open teacher page');
 await mutation({action:'saveClass',name:'Proibida'},{headers:{},cookie,status:403});
 const book=(await mutation({action:'saveBook',title:'Livro HTTP',author:'Autor de teste',unit:'pages',totalPages:200,coverUrl:'https://example.test/cover.png'})).json;
 const preview=(await mutation({action:'previewAssignment',mode:'class',bookId:book.id,classIds:[group.id],deadline:'2099-09-30'})).json;
 check(preview.recipients===2,'assignment preview counts recipients');
 await mutation({action:'distribute',mode:'class',bookId:book.id,classIds:[group.id],deadline:'2099-09-30',versions:preview.versions});
 let snapshot=(await request('/api/classroom',{cookie})).json;
 check(snapshot.assignments.length===1&&snapshot.students.length===0,'student sees only own reading');
 const reading=snapshot.assignments[0];
 await mutation({action:'progress',id:reading.id,progress:100,version:0},{headers:{},cookie});
 const after=(await request('/api/classroom',{headers:teacher})).json;
 check(after.assignments.find(a=>a.id===reading.id).progress===100,'teacher API sees new progress');
 const other=after.assignments.find(a=>a.studentId==='9070002');check(other.progress===0,'other student progress remains independent');
 await mutation({action:'progress',id:other.id,progress:200,version:0},{headers:{},cookie,status:404});
 await mutation({action:'progress',id:reading.id,progress:200,version:1},{headers:{},cookie});
 snapshot=(await request('/api/classroom',{cookie})).json;check(snapshot.assignments[0].completedAt&&snapshot.events.length===2,'completion and history persist');
 await mutation({action:'distribute',mode:'individual',bookId:book.id,studentIds:['9070001'],deadline:null});
 snapshot=(await request('/api/classroom',{cookie})).json;check(snapshot.assignments.length===2&&snapshot.assignments.some(a=>a.classId===null&&a.progress===0),'individual assignment remains independent');
 await mutation({action:'saveBook',id:book.id,title:'Livro HTTP editado',author:'Autor de teste',unit:'pages',totalPages:200,coverUrl:''});
 snapshot=(await request('/api/classroom',{cookie})).json;check(snapshot.assignments.every(a=>a.coverUrl===null&&a.title==='Livro HTTP editado'),'book edit and cover removal persist');
 const parent=after.classBooks.find(c=>c.bookId===book.id);
 await mutation({action:'classDeadline',id:parent.id,deadline:null,version:parent.version,confirmed:true});
 await mutation({action:'createStudent',name:'Novo Aluno',enrollment:'9070003',classIds:[group.id]});
 snapshot=(await request('/api/classroom',{headers:teacher})).json;check(snapshot.assignments.some(a=>a.studentId==='9070003'&&a.classId===group.id&&a.deadline===null),'new student receives existing class reading');
 await request('/professor',{headers:teacher});await request('/professor/turmas/'+group.id,{headers:teacher});
 await request('/professor/turmas/'+group.id,{headers:{'oai-authenticated-user-id':'other-teacher','oai-authenticated-user-email':'other@example.test'},status:307});
 const student=snapshot.students.find(s=>s.id==='9070001');
 await mutation({action:'resetStudentPassword',studentId:'9070001',version:student.version,confirmed:true});
 await request('/api/classroom',{cookie,status:401});
 login=await request('/api/student-auth/login',{body:{enrollment:'9070001',password:'EDU123'}});check(login.json.redirect==='/aluno/nova-senha','reset restores password gate');
 await request('/api/student-auth/logout',{cookie:login.cookie,body:{}});await request('/api/classroom',{cookie:login.cookie,status:401});
 check((await db.prepare('PRAGMA foreign_key_check').all()).results.length===0,'foreign key integrity');
 process.stdout.write(`HTTP journeys passed: ${assertions} assertions using compiled routes, isolated D1 and actual session cookies. Browser/visual QA not included.\n`);
}finally{await mf.dispose();}
