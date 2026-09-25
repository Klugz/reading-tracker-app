import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

await mkdir('.sites-runtime',{recursive:true});
for(const name of ['errors','types','deadline-history','memberships','passwords','accounts','student-auth','service']){
 const code=await readFile(`lib/classroom/${name}.ts`,'utf8');
 const compiled=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/from '([.]\/[a-z-]+)'/g,"from '$1.mjs'");
 await writeFile(`.sites-runtime/${name}.mjs`,compiled);
}
const {classroomService,ApiError}=await import('../.sites-runtime/service.mjs');
const sql=new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
sql.exec(await readFile('drizzle/0000_reflective_the_fallen.sql','utf8'));
sql.prepare("INSERT INTO books VALUES (?,?,?,?,?,?,?,?,?)").run('legacy-book','teacher-a','Livro existente','Autor',200,50,'reading','2026-08-01','2026-08-01');
sql.exec(await readFile('drizzle/0001_fluffy_spirit.sql','utf8'));
sql.exec(await readFile('drizzle/0002_cheerful_tattoo.sql','utf8'));
sql.exec(await readFile('drizzle/0003_freezing_amazoness.sql','utf8'));
sql.exec(await readFile('drizzle/0004_gigantic_luminals.sql','utf8'));
sql.exec(await readFile('drizzle/0005_purple_golden_guardian.sql','utf8'));
sql.exec(await readFile('drizzle/0006_dear_boomerang.sql','utf8'));
const {readingDeadlineHistory}=await import('../.sites-runtime/deadline-history.mjs');
const db={prepare(query){return {args:[],bind(...args){this.args=args;return this;},async first(){return sql.prepare(query).get(...this.args)||null;},async all(){return {results:sql.prepare(query).all(...this.args),success:true,meta:{}};},async run(){const r=sql.prepare(query).run(...this.args);return {results:[],success:true,meta:{changes:Number(r.changes)}};},_query:query};},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements){const q=sql.prepare(s._query);if(/^SELECT/i.test(s._query.trim()))results.push({results:q.all(...s.args),meta:{},success:true});else {const r=q.run(...s.args);results.push({results:[],meta:{changes:Number(r.changes)},success:true});}}sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const teacher=classroomService(db,'teacher-a'),teacherB=classroomService(db,'teacher-b'),student=classroomService(db,'student-a'),studentB=classroomService(db,'student-b'),outsider=classroomService(db,'outsider');
async function rejected(action,status){await assert.rejects(action,e=>e instanceof ApiError && e.status===status);}
await teacher.mutate({action:'onboard',name:'Professor A',role:'teacher'});
await teacherB.mutate({action:'onboard',name:'Professor B',role:'teacher'});
sql.prepare("INSERT INTO reading_users(id,name,role,created_at) VALUES (?,?,'student',?)").run('student-a','Aluno A','2026-01-01');
sql.prepare("INSERT INTO reading_users(id,name,role,created_at) VALUES (?,?,'student',?)").run('student-b','Aluno B','2026-01-01');
sql.prepare("INSERT INTO reading_users(id,name,role,created_at) VALUES (?,?,'student',?)").run('outsider','Outro aluno','2026-01-01');
const invite=(await teacher.user()).inviteCode;
await student.mutate({action:'join',code:invite});
await studentB.mutate({action:'join',code:invite});
const book=await teacher.mutate({action:'saveBook',title:'Livro de teste',author:'Autor',totalPages:200,unit:'pages'});
let assignment;
await test('migração preserva livros e progresso existentes',async()=>{const row=sql.prepare('SELECT * FROM books WHERE id=?').get('legacy-book');assert.equal(row.current_page,50);assert.equal(row.total_pages,200);assert.equal(row.unit,'pages');});
await test('sem autenticação e sem perfil não há acesso',async()=>{assert.throws(()=>classroomService(db,null),e=>e.status===401);await rejected(()=>classroomService(db,'unregistered').mutate({action:'saveBook',title:'a',author:'b',unit:'pages',totalPages:10}),403);});
await test('papel é imutável e aluno não gerencia livros ou atribuições',async()=>{await rejected(()=>student.mutate({action:'onboard',name:'Aluno A',role:'teacher'}),409);await rejected(()=>student.mutate({action:'saveBook',title:'a',author:'b',unit:'pages',totalPages:10}),403);await rejected(()=>student.mutate({action:'assign',bookId:book.id,studentIds:['student-b'],deadline:null}),403);});
await test('professor não acessa livros ou alunos de outro professor',async()=>{await rejected(()=>teacherB.mutate({action:'assign',bookId:book.id,studentIds:['student-a'],deadline:null}),404);await rejected(()=>teacher.mutate({action:'assign',bookId:book.id,studentIds:['student-a','outsider'],deadline:null}),403);assert.equal((await teacher.snapshot()).assignments.length,0);assert.equal((await teacherB.snapshot()).students.length,0);});
await test('atribuição em lote é individual e idempotente',async()=>{const payload={action:'assign',bookId:book.id,studentIds:['student-a','student-b'],deadline:'2026-01-01'};assert.equal((await teacher.mutate(payload)).assigned,2);assert.equal((await teacher.mutate(payload)).assigned,0);const a=await student.snapshot(),b=await studentB.snapshot();assert.equal(a.assignments.length,1);assert.equal(b.assignments.length,1);assert.notEqual(a.assignments[0].id,b.assignments[0].id);assert.equal(a.students.length,0);assert.equal(a.books.length,0);assignment=a.assignments[0];});
await test('alunos só atualizam suas próprias leituras',async()=>{await rejected(()=>studentB.mutate({action:'progress',id:assignment.id,progress:100,version:0}),404);await rejected(()=>teacher.mutate({action:'progress',id:assignment.id,progress:100,version:0}),403);assert.equal((await outsider.snapshot()).assignments.length,0);});
await test('início ocorre no primeiro avanço; metade e conclusão geram histórico',async()=>{
 await student.mutate({action:'progress',id:assignment.id,progress:0,version:0});let s=await student.snapshot();assert.equal(s.assignments[0].startedAt,null);assert.equal(s.events.length,0);
 await student.mutate({action:'progress',id:assignment.id,progress:100,version:0});s=await teacher.snapshot();let a=s.assignments.find(a=>a.id===assignment.id);assert.equal(a.progress,100);assert.ok(a.startedAt);assert.equal(s.events.filter(e=>e.assignmentId===a.id).length,1);assert.equal((await studentB.snapshot()).events.length,0);
 await student.mutate({action:'progress',id:assignment.id,progress:200,version:1});a=(await student.snapshot()).assignments[0];assert.ok(a.completedAt);assert.equal(a.version,2);assert.equal((await student.mutate({action:'progress',id:assignment.id,progress:200,version:2})).unchanged,true);
});
await test('progresso inválido, regressão e versão antiga não geram histórico',async()=>{let a=(await studentB.snapshot()).assignments[0];await rejected(()=>studentB.mutate({action:'progress',id:a.id,progress:201,version:0}),400);await studentB.mutate({action:'progress',id:a.id,progress:50,version:0});await rejected(()=>studentB.mutate({action:'progress',id:a.id,progress:60,version:0}),409);await rejected(()=>studentB.mutate({action:'progress',id:a.id,progress:20,version:1}),400);assert.equal((await studentB.snapshot()).events.length,1);});
await test('alterar a unidade ou excluir livro atribuído preserva o histórico',async()=>{await rejected(()=>teacher.mutate({action:'saveBook',id:book.id,title:'Teste',author:'Autor',unit:'chapters',totalPages:10}),409);await rejected(()=>teacher.mutate({action:'deleteBook',id:book.id}),409);await rejected(()=>teacherB.mutate({action:'deleteBook',id:book.id}),404);await teacher.mutate({action:'saveBook',id:book.id,title:'Título corrigido',author:'Autor',unit:'pages',totalPages:200});assert.equal((await student.snapshot()).assignments[0].title,'Título corrigido');});
await test('prazo pertence ao professor responsável',async()=>{await rejected(()=>teacherB.mutate({action:'deadline',id:assignment.id,deadline:null}),404);await rejected(()=>student.mutate({action:'deadline',id:assignment.id,deadline:null}),403);await teacher.mutate({action:'deadline',id:assignment.id,deadline:null});assert.equal((await student.snapshot()).assignments[0].deadline,null);});
await test('datas e valores inválidos são rejeitados e metas são privadas',async()=>{await assert.rejects(()=>teacher.mutate({action:'assign',bookId:book.id,studentIds:['student-a'],deadline:'2026-02-31'}));await rejected(()=>student.mutate({action:'saveGoal',title:'Meta',targetBooks:2,startDate:'2026-10-01',endDate:'2026-09-01'}),400);await student.mutate({action:'saveGoal',title:'Meta',targetBooks:2,startDate:'2026-01-01',endDate:'2026-12-31'});assert.equal((await student.snapshot()).goals.length,1);assert.equal((await studentB.snapshot()).goals.length,0);});
await test('suporta capítulos e percentual',async()=>{for(const unit of ['chapters','percent']){const b=await teacher.mutate({action:'saveBook',title:unit,author:'Autor',totalPages:10,unit});await teacher.mutate({action:'assign',bookId:b.id,studentIds:['student-a'],deadline:null});const a=(await student.snapshot()).assignments.find(a=>a.bookId===b.id);assert.equal(a.totalPages,unit==='percent'?100:10);await student.mutate({action:'progress',id:a.id,progress:a.totalPages,version:0});assert.ok((await student.snapshot()).assignments.find(x=>x.id===a.id).completedAt);}});
await test('exclusão de livro não atribuído é permitida ao dono',async()=>{const b=await teacher.mutate({action:'saveBook',title:'Rascunho',author:'Autor',unit:'pages',totalPages:20});await teacher.mutate({action:'deleteBook',id:b.id});assert.equal(sql.prepare('SELECT id FROM books WHERE id=?').get(b.id),undefined);});
await test('atualizações concorrentes não perdem dados ou duplicam eventos',async()=>{
 const a=(await studentB.snapshot()).assignments[0];const before=(await studentB.snapshot()).events.length;
 const results=await Promise.allSettled([studentB.mutate({action:'progress',id:a.id,progress:80,version:a.version}),studentB.mutate({action:'progress',id:a.id,progress:90,version:a.version})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await studentB.snapshot()).events.length,before+1);
 assert.equal((await studentB.snapshot()).assignments[0].version,a.version+1);
});
await test('leitura pessoal do professor continua separada das atribuições',async()=>{
 await teacher.mutate({action:'personalProgress',id:'legacy-book',progress:200});
 const b=(await teacher.snapshot()).books.find(b=>b.id==='legacy-book');
 assert.equal(b.personalStatus,'completed');assert.ok(b.personalCompletedAt);
 await rejected(()=>student.mutate({action:'personalProgress',id:'legacy-book',progress:1}),403);
 assert.equal((await student.snapshot()).assignments.some(a=>a.bookId==='legacy-book'),false);
});

let groupA,groupB,groupBook;
const groupVersion=async id=>(await teacher.ownedClass(id)).version;
const preview=async(classIds,bookId=groupBook.id)=>teacher.mutate({action:'previewAssignment',mode:'class',classIds,studentIds:[],bookId,deadline:'2026-09-30'});
const distribute=async(classIds,bookId=groupBook.id)=>{const p=await preview(classIds,bookId);return teacher.mutate({action:'distribute',mode:'class',classIds,studentIds:[],bookId,deadline:'2026-09-30',versions:p.versions});};
await test('turmas pertencem ao professor e alunos podem participar de várias',async()=>{
 groupA=await teacher.mutate({action:'saveClass',name:'6º Ano A',description:'Leitura compartilhada'});
 groupB=await teacher.mutate({action:'saveClass',name:'Literatura 2026'});
 groupBook=await teacher.mutate({action:'saveBook',title:'O Pequeno Príncipe',author:'Antoine de Saint-Exupéry',totalPages:200,unit:'pages'});
 await teacher.mutate({action:'saveMembers',classId:groupA.id,studentIds:['student-a','student-b','student-a'],version:0});
 await teacher.mutate({action:'saveMembers',classId:groupB.id,studentIds:['student-a'],version:0});
 assert.equal((await teacher.snapshot()).classMembers.length,3);
 assert.equal((await student.snapshot()).classes.length,2);
 assert.equal((await student.snapshot()).classMembers.length,2);
 assert.ok((await student.snapshot()).classMembers.every(m=>m.studentId==='student-a'));
 assert.equal((await studentB.snapshot()).classes.length,1);
 assert.equal((await teacherB.snapshot()).classes.length,0);
 await teacher.mutate({action:'saveClass',id:groupA.id,name:'6º Ano A — Manhã',description:'Nova descrição',version:1});
 assert.equal((await teacher.ownedClass(groupA.id)).description,'Nova descrição');
});
await test('API rejeita ações administrativas de alunos e turmas de outro professor',async()=>{
 const v=await groupVersion(groupA.id);
 const actions=[{action:'saveClass',name:'Proibida'}, {action:'saveMembers',classId:groupA.id,studentIds:[],version:v},{action:'classState',classId:groupA.id,state:'delete',version:v},{action:'previewAssignment',mode:'class',classIds:[groupA.id],bookId:groupBook.id,deadline:null},{action:'distribute',mode:'class',classIds:[groupA.id],bookId:groupBook.id,deadline:null,versions:{[groupA.id]:v}}];
 for(const a of actions)await rejected(()=>student.mutate(a),403);
 await rejected(()=>teacherB.ownedClass(groupA.id),404);
 for(const a of actions.slice(1,3))await rejected(()=>teacherB.mutate(a),404);
 await rejected(()=>teacherB.mutate({action:'saveClass',id:groupA.id,name:'Invasão',version:v}),404);
 await rejected(()=>teacher.mutate({action:'saveMembers',classId:groupA.id,studentIds:['outsider'],version:v}),403);
 const foreign=await teacherB.mutate({action:'saveClass',name:'Outra turma'});
 await rejected(()=>preview([groupA.id,foreign.id]),404);
 assert.equal((await teacher.snapshot()).assignments.filter(a=>a.bookId===groupBook.id).length,0);
});
await test('resumo conta alunos únicos e leituras por origem; distribuição é individual',async()=>{
 const p=await preview([groupA.id,groupB.id]);assert.equal(p.recipients,2);assert.equal(p.readings,3);assert.equal(p.newReadings,3);assert.equal(p.existingReadings,0);
 assert.equal((await distribute([groupA.id,groupB.id])).assigned,3);
 const a=(await student.snapshot()).assignments.filter(a=>a.bookId===groupBook.id);
 assert.equal(a.length,2);assert.notEqual(a[0].id,a[1].id);assert.notEqual(a[0].classId,a[1].classId);
 assert.ok(a.every(a=>a.originKey===a.classId&&a.className&&a.progress===0));
 assert.equal((await studentB.snapshot()).assignments.filter(a=>a.bookId===groupBook.id).length,1);
 assert.equal((await teacher.snapshot()).classBooks.length,2);
});
await test('progresso de turma não altera colegas, outras turmas ou atribuição individual',async()=>{
 await teacher.mutate({action:'distribute',mode:'individual',bookId:groupBook.id,studentIds:['student-a'],classIds:[],deadline:null});
 const a=(await student.snapshot()).assignments.find(a=>a.bookId===groupBook.id&&a.classId===groupA.id);
 await student.mutate({action:'progress',id:a.id,progress:160,version:0});
 const items=(await teacher.snapshot()).assignments.filter(a=>a.bookId===groupBook.id);
 assert.equal(items.find(r=>r.id===a.id).progress,160);assert.ok(items.filter(r=>r.id!==a.id).every(r=>r.progress===0));
 const individual=items.find(r=>r.classId===null);assert.equal(individual.originKey,'individual');
 await rejected(()=>studentB.mutate({action:'progress',id:a.id,progress:200,version:1}),404);
});
await test('repetir distribuição preserva prazos, progresso e identidade',async()=>{
 const before=(await teacher.snapshot()).assignments.filter(a=>a.bookId===groupBook.id);
 const p=await preview([groupA.id,groupB.id]);assert.equal(p.newReadings,0);assert.equal(p.existingReadings,3);
 const r=await teacher.mutate({action:'distribute',mode:'class',classIds:[groupA.id,groupB.id],bookId:groupBook.id,deadline:'2027-01-01',versions:p.versions});assert.equal(r.assigned,0);
 const after=(await teacher.snapshot()).assignments.filter(a=>a.bookId===groupBook.id);assert.deepEqual(after,before);
 assert.equal((await teacher.mutate({action:'assign',bookId:groupBook.id,studentIds:['student-a'],deadline:'2027-01-01'})).assigned,0);
});
await test('novos membros recebem leituras automaticamente; saída mantém histórico',async()=>{
 await teacher.mutate({action:'saveMembers',classId:groupB.id,studentIds:['student-a','student-b'],version:await groupVersion(groupB.id)});
 assert.equal((await studentB.snapshot()).assignments.filter(a=>a.classId===groupB.id).length,1);
 const p=await preview([groupB.id]);assert.equal(p.newReadings,0);assert.equal(p.existingReadings,2);assert.equal((await distribute([groupB.id])).assigned,0);
 await teacher.mutate({action:'saveMembers',classId:groupA.id,studentIds:['student-b'],version:await groupVersion(groupA.id)});
 assert.equal((await student.snapshot()).classes.some(c=>c.id===groupA.id),false);
 const a=(await student.snapshot()).assignments.find(a=>a.classId===groupA.id);assert.equal(a.progress,160);assert.equal(a.className,'6º Ano A — Manhã');
 assert.ok((await student.snapshot()).events.some(e=>e.assignmentId===a.id));
});
await test('resumo desatualizado e edição concorrente não distribuem parcialmente',async()=>{
 const p=await preview([groupA.id,groupB.id],'legacy-book');
 await teacher.mutate({action:'saveMembers',classId:groupB.id,studentIds:['student-b'],version:await groupVersion(groupB.id)});
 await rejected(()=>teacher.mutate({action:'distribute',mode:'class',classIds:[groupA.id,groupB.id],bookId:'legacy-book',deadline:null,versions:p.versions}),409);
 assert.equal((await teacher.snapshot()).assignments.filter(a=>a.bookId==='legacy-book').length,0);
 await rejected(()=>teacher.mutate({action:'saveMembers',classId:groupB.id,studentIds:[],version:p.versions[groupB.id]}),409);
 assert.equal((await teacher.snapshot()).classMembers.filter(m=>m.classId===groupB.id).length,1);
});
await test('alteração entre planejamento e transação reverte a distribuição inteira',async()=>{
 const p=await preview([groupA.id,groupB.id],'legacy-book');let triggered=false;
 const raceDB={...db,async batch(statements){if(!triggered){triggered=true;sql.prepare('UPDATE reading_classes SET version=version+1 WHERE id=?').run(groupB.id);}return db.batch(statements);}};
 await rejected(()=>classroomService(raceDB,'teacher-a').mutate({action:'distribute',mode:'class',classIds:[groupA.id,groupB.id],bookId:'legacy-book',deadline:null,versions:p.versions}),409);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM reading_class_books WHERE book_id=?').get('legacy-book').n,0);
 assert.equal((await teacher.snapshot()).assignments.filter(a=>a.bookId==='legacy-book').length,0);
});
await test('turma vazia não pode receber livros; arquivar bloqueia novas ações e permite restaurar',async()=>{
 const empty=await teacher.mutate({action:'saveClass',name:'Turma vazia'});await rejected(()=>preview([empty.id]),400);
 await teacher.mutate({action:'classState',classId:groupA.id,state:'archive',version:await groupVersion(groupA.id)});
 await rejected(()=>preview([groupA.id]),409);
 await rejected(async()=>teacher.mutate({action:'saveMembers',classId:groupA.id,studentIds:[],version:await groupVersion(groupA.id)}),409);
 const a=(await student.snapshot()).assignments.find(a=>a.classId===groupA.id);assert.ok(a.classArchivedAt);
 await student.mutate({action:'progress',id:a.id,progress:200,version:a.version});
 await teacher.mutate({action:'classState',classId:groupA.id,state:'restore',version:await groupVersion(groupA.id)});
 assert.equal((await teacher.ownedClass(groupA.id)).archivedAt,null);await preview([groupA.id]);
});
await test('excluir turma oculta gestão e preserva origem, conclusão e histórico',async()=>{
 const a=(await student.snapshot()).assignments.find(a=>a.classId===groupA.id);
 await teacher.mutate({action:'classState',classId:groupA.id,state:'delete',version:await groupVersion(groupA.id)});
 const s=await teacher.snapshot();assert.ok(!s.classes.some(c=>c.id===groupA.id));assert.ok(!s.classBooks.some(c=>c.classId===groupA.id));
 const retained=(await student.snapshot()).assignments.find(r=>r.id===a.id);assert.equal(retained.progress,200);assert.ok(retained.completedAt);assert.ok(retained.classDeletedAt);assert.equal(retained.className,a.className);
 assert.ok((await student.snapshot()).events.some(e=>e.assignmentId===a.id));
 await rejected(()=>teacher.ownedClass(groupA.id),404);await rejected(()=>preview([groupA.id]),404);
});
await test('migração de turmas mantém atribuição e eventos anteriores',async()=>{
 const old=new DatabaseSync(':memory:');old.exec('PRAGMA foreign_keys=ON');for(const f of ['0000_reflective_the_fallen','0001_fluffy_spirit','0002_cheerful_tattoo'])old.exec(await readFile(`drizzle/${f}.sql`,'utf8'));
 old.exec("INSERT INTO reading_users(id,name,role,created_at) VALUES('t','Professor','teacher','2026-01-01'),('s','Aluno','student','2026-01-01'); INSERT INTO books(id,owner_id,title,author,total_pages,current_page,status,created_at,updated_at) VALUES('b','t','Livro','Autor',200,0,'want_to_read','2026-01-01','2026-01-01'); INSERT INTO reading_assignments(id,teacher_id,student_id,book_id,assigned_at,progress,version) VALUES('a','t','s','b','2026-01-01',100,1); INSERT INTO reading_events(id,assignment_id,progress,previous_progress,created_at,version) VALUES('e','a',100,0,'2026-01-02',1);");
 old.exec(await readFile('drizzle/0003_freezing_amazoness.sql','utf8'));
 const a=old.prepare('SELECT * FROM reading_assignments').get();assert.equal(a.id,'a');assert.equal(a.progress,100);assert.equal(a.class_id,null);assert.equal(a.origin_key,'individual');assert.equal(old.prepare('SELECT count(*) AS n FROM reading_events').get().n,1);old.close();
});

const {studentAuth}=await import('../.sites-runtime/student-auth.mjs');
const auth=studentAuth(db);
const managedA=()=>classroomService(db,'202600154'),managedB=()=>classroomService(db,'202600287');
const account=async id=>(await teacher.snapshot()).students.find(s=>s.id===id);
let sessionA,sessionB,accountClass,otherClass;
await test('professor cadastra alunos homônimos por matrícula com turmas opcionais',async()=>{
 accountClass=await teacher.mutate({action:'saveClass',name:'7º Ano A'});otherClass=await teacher.mutate({action:'saveClass',name:'7º Ano B'});
 await teacher.mutate({action:'createStudent',name:'João Silva',enrollment:'202600154',email:'joao@example.com',classIds:[accountClass.id,otherClass.id]});
 await teacher.mutate({action:'createStudent',name:'João Silva',enrollment:'202600287'});
 const a=await account('202600154'),b=await account('202600287');assert.equal(a.name,b.name);assert.notEqual(a.id,b.id);assert.equal(a.enrollment,a.id);assert.equal(a.mustChangePassword,1);assert.equal(b.email,null);
 assert.equal((await teacher.snapshot()).classMembers.filter(m=>m.studentId===a.id).length,2);
 const hash=sql.prepare('SELECT password_hash FROM managed_students WHERE student_id=?').get(a.id).password_hash;
 assert.ok(hash.startsWith('scrypt$'));assert.ok(!hash.includes('EDU123'));
 const snapshot=JSON.stringify(await teacher.snapshot());assert.ok(!snapshot.includes('password_hash'));assert.ok(!snapshot.includes(hash));
});
await test('matrícula é única, preserva zeros e cadastro de aluno exige professor',async()=>{
 await rejected(()=>teacher.mutate({action:'createStudent',name:'Outro João',enrollment:'202600154'}),409);
 await rejected(()=>teacherB.mutate({action:'createStudent',name:'Outro João',enrollment:'202600154'}),409);
 await rejected(()=>student.mutate({action:'createStudent',name:'Proibido',enrollment:'123'}),403);
 await rejected(()=>classroomService(db,'new-student').mutate({action:'onboard',name:'Aluno novo',role:'student'}),403);
 await teacher.mutate({action:'createStudent',name:'Ana Souza',enrollment:'00154'});assert.ok(await account('00154'));
 await assert.rejects(()=>teacher.mutate({action:'createStudent',name:'Ana Souza',enrollment:'ABC'}));
 const foreign=await teacherB.mutate({action:'saveClass',name:'Turma externa'});
 await rejected(()=>teacher.mutate({action:'createStudent',name:'Ana Souza',enrollment:'00155',classIds:[accountClass.id,foreign.id]}),404);
 assert.equal(sql.prepare('SELECT id FROM reading_users WHERE id=?').get('00155'),undefined);
});
await test('primeiro login exige senha nova, sem dados ou mutações antes da troca',async()=>{
 await rejected(()=>auth.login({enrollment:'202600154',password:'errada'},'test-a'),401);
 sessionA=await auth.login({enrollment:'202600154',password:'EDU123'},'test-a');assert.equal(sessionA.mustChangePassword,true);
 const s=await auth.session(sessionA.token);assert.equal(s.studentId,'202600154');assert.equal(s.mustChangePassword,1);assert.ok(s.expiresAt<Date.now()+16*60*1000);
 await rejected(()=>managedA().snapshot(),428);
 await rejected(()=>managedA().mutate({action:'saveGoal',title:'Teste',targetBooks:1,startDate:'2026-01-01',endDate:'2026-12-31'}),428);
 await assert.rejects(()=>auth.changePassword(sessionA.token,{password:'EDU123',confirmation:'EDU123'}));
 await assert.rejects(()=>auth.changePassword(sessionA.token,{password:'senha pessoal longa',confirmation:'diferente'}));
 const old=sessionA.token;sessionA=await auth.changePassword(old,{password:'Minha senha pessoal 154',confirmation:'Minha senha pessoal 154'});
 assert.equal(await auth.session(old),null);assert.equal((await auth.session(sessionA.token)).mustChangePassword,0);assert.equal((await managedA().snapshot()).user.enrollment,'202600154');
 assert.equal(sql.prepare('SELECT token_hash FROM student_sessions WHERE student_id=?').get('202600154').token_hash===sessionA.token,false);
});
await test('senha pessoal funciona, senha inicial deixa de funcionar e alunos são isolados',async()=>{
 sessionB=await auth.login({enrollment:'202600287',password:'EDU123'},'test-b');sessionB=await auth.changePassword(sessionB.token,{password:'Minha senha pessoal 287',confirmation:'Minha senha pessoal 287'});
 await rejected(()=>auth.login({enrollment:'202600154',password:'EDU123'},'test-a'),401);
 const normal=await auth.login({enrollment:'202600154',password:'Minha senha pessoal 154'},'test-a');assert.equal(normal.mustChangePassword,false);
 await teacher.mutate({action:'assign',bookId:book.id,studentIds:['202600154','202600287'],deadline:null});
 const a=(await managedA().snapshot()).assignments.find(a=>a.bookId===book.id);await managedA().mutate({action:'progress',id:a.id,progress:100,version:0});
 assert.equal((await managedB().snapshot()).assignments[0].progress,0);
 await rejected(()=>managedB().mutate({action:'progress',id:a.id,progress:200,version:1}),404);
 await rejected(()=>managedA().mutate({action:'resetStudentPassword',studentId:'202600287',version:0,confirmed:true}),403);
 assert.equal((await managedA().snapshot()).students.length,0);
});
await test('editar nome, e-mail e transferir turmas preserva matrícula e histórico',async()=>{
 const before=(await managedA().snapshot()).assignments[0];const a=await account('202600154');
 await teacher.mutate({action:'editStudent',studentId:a.id,name:'João Silva Santos',email:'',version:a.version});
 const classes=(await teacher.snapshot()).classes;
 await teacher.mutate({action:'studentClasses',studentId:a.id,classIds:[otherClass.id],versions:Object.fromEntries(classes.map(c=>[c.id,c.version]))});
 const after=(await managedA().snapshot()).assignments[0];assert.equal(after.id,before.id);assert.equal(after.progress,100);assert.equal(after.studentId,'202600154');assert.equal(after.studentName,'João Silva Santos');assert.ok((await managedA().snapshot()).events.length);
 assert.deepEqual((await teacher.snapshot()).classMembers.filter(m=>m.studentId===a.id).map(m=>m.classId),[otherClass.id]);
 await rejected(()=>teacher.mutate({action:'editStudent',studentId:a.id,name:'Dado antigo',version:a.version}),409);
});
await test('professor alheio não edita, corrige, redefine ou desativa contas',async()=>{
 const a=await account('202600154');for(const action of [
 {action:'editStudent',name:'Invasão'}, {action:'correctEnrollment',enrollment:'99999',confirmed:true}, {action:'resetStudentPassword',confirmed:true},{action:'studentActive',active:false,confirmed:true}
 ])await rejected(()=>teacherB.mutate({...action,studentId:a.id,version:a.version}),404);
 await rejected(()=>teacherB.mutate({action:'studentClasses',studentId:a.id,classIds:[],versions:{}}),404);
});
await test('reset encerra sessões e retorna ao primeiro acesso sem mudar matrícula ou leituras',async()=>{
 const a=await account('202600154');const old=sessionA.token;const before=(await teacher.snapshot()).assignments.filter(r=>r.studentId===a.id);
 await teacher.mutate({action:'resetStudentPassword',studentId:a.id,version:a.version,confirmed:true});assert.equal(await auth.session(old),null);
 await rejected(()=>managedA().snapshot(),428);assert.deepEqual((await teacher.snapshot()).assignments.filter(r=>r.studentId===a.id),before);
 // Clear prior login test attempts to test the reset independently of the throttle case below.
 sql.prepare('DELETE FROM student_login_attempts').run();
 await rejected(()=>auth.login({enrollment:a.id,password:'Minha senha pessoal 154'},'test-reset'),401);
 sessionA=await auth.login({enrollment:a.id,password:'EDU123'},'test-reset');assert.equal(sessionA.mustChangePassword,true);
 sessionA=await auth.changePassword(sessionA.token,{password:'Minha senha nova 154',confirmation:'Minha senha nova 154'});
});
await test('desativação impede login e sessões; reativação mantém os registros',async()=>{
 let a=await account('202600287');await teacher.mutate({action:'studentActive',studentId:a.id,active:false,version:a.version,confirmed:true});assert.equal(await auth.session(sessionB.token),null);
 await rejected(()=>auth.login({enrollment:a.id,password:'Minha senha pessoal 287'},'test-disabled'),401);await rejected(()=>managedB().snapshot(),403);
 a=await account(a.id);await teacher.mutate({action:'studentActive',studentId:a.id,active:true,version:a.version,confirmed:true});
 sessionB=await auth.login({enrollment:a.id,password:'Minha senha pessoal 287'},'test-enabled');assert.equal(sessionB.mustChangePassword,false);assert.equal((await managedB().snapshot()).assignments.length,1);
});
await test('correção administrativa muda chave de matrícula e preserva toda a conta',async()=>{
 let a=await account('202600154');await rejected(()=>teacher.mutate({action:'correctEnrollment',studentId:a.id,enrollment:'202600287',version:a.version,confirmed:true}),409);
 const before=(await managedA().snapshot());await managedA().mutate({action:'saveGoal',title:'Meta preservada',targetBooks:2,startDate:'2026-01-01',endDate:'2026-12-31'});
 await teacher.mutate({action:'correctEnrollment',studentId:a.id,enrollment:'202600155',version:a.version,confirmed:true});
 assert.equal(await auth.session(sessionA.token),null);assert.equal(await account('202600154'),undefined);a=await account('202600155');assert.equal(a.name,'João Silva Santos');
 const corrected=classroomService(db,a.id),after=await corrected.snapshot();assert.equal(after.assignments[0].id,before.assignments[0].id);assert.equal(after.assignments[0].progress,100);assert.equal(after.events.length,before.events.length);assert.equal(after.goals.length,1);assert.ok(after.classMembers.every(m=>m.studentId===a.id));
 assert.equal(sql.prepare('SELECT count(*) AS n FROM student_account_events WHERE student_id=?').get(a.id).n>=4,true);
 await rejected(()=>auth.login({enrollment:'202600154',password:'Minha senha nova 154'},'test-old'),401);
 sessionA=await auth.login({enrollment:a.id,password:'Minha senha nova 154'},'test-corrected');assert.equal(sessionA.mustChangePassword,false);
 assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);
});
await test('alunos antigos podem migrar para matrícula sem perder leituras nem entrar pelo ID antigo',async()=>{
 const before=await student.snapshot();await teacher.mutate({action:'enrollStudent',studentId:'student-a',enrollment:'202600999',confirmed:true});
 const migrated=await account('202600999');assert.ok(migrated);assert.equal(migrated.mustChangePassword,1);
 const after=(await teacher.snapshot()).assignments.filter(a=>a.studentId===migrated.id);assert.equal(after.length,before.assignments.length);assert.deepEqual(after.map(a=>a.id).sort(),before.assignments.map(a=>a.id).sort());
 assert.equal(sql.prepare('SELECT legacy_identity FROM managed_students WHERE student_id=?').get(migrated.id).legacy_identity,'student-a');
 await rejected(()=>student.mutate({action:'onboard',name:'Professor indevido',role:'teacher'}),403);
 const login=await auth.login({enrollment:migrated.id,password:'EDU123'},'test-legacy');assert.equal(login.mustChangePassword,true);assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);
});
await test('limite persistente bloqueia tentativas excessivas, inclusive matrícula inexistente',async()=>{
 for(let i=0;i<5;i++)await rejected(()=>auth.login({enrollment:'404404',password:'errada'},'test-throttle'),401);
 await rejected(()=>auth.login({enrollment:'404404',password:'errada'},'test-throttle'),429);
 sql.prepare('UPDATE student_login_attempts SET expires_at=0').run();await rejected(()=>auth.login({enrollment:'404404',password:'errada'},'test-throttle'),401);
});
await test('sessões expiram, logout revoga token e valores arbitrários não autenticam',async()=>{
 assert.equal(await auth.session('forged-token'),null);assert.equal(await auth.session('f'.repeat(64)),null);
 const s=await auth.login({enrollment:'202600287',password:'Minha senha pessoal 287'},'test-logout');await auth.logout(s.token);assert.equal(await auth.session(s.token),null);
 sql.prepare('UPDATE student_sessions SET expires_at=0 WHERE student_id=?').run('202600155');assert.equal(await auth.session(sessionA.token),null);
});

// Integration scenarios for the approved simplification plan.
const {readingStatus,metrics,percentage,classReadings}=await import('../.sites-runtime/types.mjs');
const ux=classroomService(db,'ux-teacher');
await ux.mutate({action:'onboard',name:'Professor UX',role:'teacher'});
for(const id of ['ux-a','ux-b','ux-c']){
 sql.prepare("INSERT INTO reading_users(id,name,role,created_at) VALUES (?,?,'student',?)").run(id,id,'2026-01-01');
 await classroomService(db,id).mutate({action:'join',code:(await ux.user()).inviteCode});
}
const uxA=await ux.mutate({action:'saveClass',name:'Turma UX A'}),uxB=await ux.mutate({action:'saveClass',name:'Turma UX B'});
const uxBook=await ux.mutate({action:'saveBook',title:'Livro UX',author:'Autora',unit:'pages',totalPages:200});
await ux.mutate({action:'saveMembers',classId:uxA.id,studentIds:['ux-a','ux-b'],version:0});
await ux.mutate({action:'saveMembers',classId:uxB.id,studentIds:['ux-a'],version:0});
const uxPlan=await ux.mutate({action:'previewAssignment',mode:'class',classIds:[uxA.id,uxB.id],bookId:uxBook.id,deadline:'2001-01-01'});
await ux.mutate({action:'distribute',mode:'class',classIds:[uxA.id,uxB.id],bookId:uxBook.id,deadline:'2001-01-01',versions:uxPlan.versions});
await ux.mutate({action:'assign',bookId:uxBook.id,studentIds:['ux-a'],deadline:'2002-02-02'});
const uxSnapshot=()=>ux.snapshot(),uxStudent=classroomService(db,'ux-a');
const uxParent=async classId=>(await uxSnapshot()).classBooks.find(cb=>cb.classId===classId&&cb.bookId===uxBook.id);
const uxReading=async(studentId,classId)=>(await uxSnapshot()).assignments.find(a=>a.studentId===studentId&&a.classId===classId&&a.bookId===uxBook.id);
await test('prazo coletivo alcança ex-alunos, preserva conclusões e isola outras origens',async()=>{
 let a=await uxReading('ux-a',uxA.id);await uxStudent.mutate({action:'progress',id:a.id,progress:200,version:a.version});
 a=await uxReading('ux-a',uxA.id);const completed=a.completedAt;
 assert.equal((await uxSnapshot()).events.find(e=>e.assignmentId===a.id).completionDeadline,'2001-01-01');
 await ux.mutate({action:'saveMembers',classId:uxA.id,studentIds:['ux-b'],version:(await ux.ownedClass(uxA.id)).version});
 const parent=await uxParent(uxA.id);
 await ux.mutate({action:'classDeadline',id:parent.id,deadline:'2099-09-30',version:parent.version,confirmed:true});
 const s=await uxSnapshot();assert.ok(s.assignments.filter(a=>a.classId===uxA.id).every(a=>a.deadline==='2099-09-30'));
 a=s.assignments.find(r=>r.id===a.id);assert.equal(a.completedAt,completed);assert.equal(readingStatus(a),'completed');
 assert.equal((await uxReading('ux-a',uxB.id)).deadline,'2001-01-01');assert.equal((await uxReading('ux-a',null)).deadline,'2002-02-02');
 assert.equal(s.events.find(e=>e.assignmentId===a.id).completionDeadline,'2001-01-01');
 assert.equal(s.deadlineEvents.filter(e=>e.classAssignmentId===parent.id).length,1);
 await rejected(()=>teacherB.mutate({action:'classDeadline',id:parent.id,deadline:null,version:parent.version+1,confirmed:true}),404);
 await rejected(()=>uxStudent.mutate({action:'classDeadline',id:parent.id,deadline:null,version:parent.version+1,confirmed:true}),403);
 await rejected(()=>ux.mutate({action:'deadline',id:a.id,deadline:null,version:a.version}),409);
});
await test('remover prazo coletivo é definitivo e alterações concorrentes não sobrescrevem',async()=>{
 const parent=await uxParent(uxA.id);
 sql.prepare('UPDATE reading_assignments SET deadline=? WHERE class_id=?').run('2000-01-01',uxA.id);
 const result=await Promise.allSettled([ux.mutate({action:'classDeadline',id:parent.id,deadline:null,version:parent.version,confirmed:true}),ux.mutate({action:'classDeadline',id:parent.id,deadline:'2098-01-01',version:parent.version,confirmed:true})]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
 let next=await uxParent(uxA.id);if(next.deadline!==null)await ux.mutate({action:'classDeadline',id:next.id,deadline:null,version:next.version,confirmed:true});
 const s=await uxSnapshot();assert.ok(s.assignments.filter(a=>a.classId===uxA.id).every(a=>a.deadline===null));
 assert.equal(readingStatus(await uxReading('ux-b',uxA.id)),'pending');
 next=await uxParent(uxA.id);const before=s.deadlineEvents.length;
 assert.equal((await ux.mutate({action:'classDeadline',id:next.id,deadline:null,version:next.version,confirmed:true})).unchanged,true);
 assert.equal((await uxSnapshot()).deadlineEvents.length,before);
});
await test('cadastro em turma recebe leituras e prazos vencidos automaticamente',async()=>{
 const p=await uxParent(uxA.id);await ux.mutate({action:'classDeadline',id:p.id,deadline:'2001-01-01',version:p.version,confirmed:true});
 const before=Date.now();await ux.mutate({action:'createStudent',name:'Aluno recém-chegado',enrollment:'00333001',classIds:[uxA.id]});
 const a=await uxReading('00333001',uxA.id);assert.ok(a);assert.equal(a.progress,0);assert.equal(a.startedAt,null);assert.equal(a.completedAt,null);assert.equal(a.deadline,'2001-01-01');assert.ok(Date.parse(a.assignedAt)>=before);assert.equal(readingStatus(a),'late');
 assert.equal((await uxSnapshot()).students.find(s=>s.id==='00333001').mustChangePassword,1);
});
await test('transferir e reingressar conserva leituras, identidade e histórico de origem',async()=>{
 const old=await uxReading('00333001',uxA.id);
 let snapshot=await uxSnapshot();await ux.mutate({action:'studentClasses',studentId:'00333001',classIds:[uxB.id],versions:Object.fromEntries(snapshot.classes.map(c=>[c.id,c.version]))});
 snapshot=await uxSnapshot();assert.equal(snapshot.classMembers.some(m=>m.classId===uxA.id&&m.studentId==='00333001'),false);
 assert.equal((await uxReading('00333001',uxA.id)).id,old.id);assert.ok(await uxReading('00333001',uxB.id));
 await ux.mutate({action:'studentClasses',studentId:'00333001',classIds:[uxA.id,uxB.id],versions:Object.fromEntries(snapshot.classes.map(c=>[c.id,c.version]))});
 assert.equal((await uxReading('00333001',uxA.id)).id,old.id);assert.equal((await uxSnapshot()).assignments.filter(a=>a.studentId==='00333001').length,2);
});
await test('gestão de membros recebe leituras existentes sem redistribuição',async()=>{
 const s=await uxSnapshot(),members=s.classMembers.filter(m=>m.classId===uxA.id).map(m=>m.studentId);
 await ux.mutate({action:'saveMembers',classId:uxA.id,studentIds:[...members,'ux-c'],version:(await ux.ownedClass(uxA.id)).version});
 const added=await uxReading('ux-c',uxA.id);assert.ok(added);assert.equal(added.progress,0);assert.equal(added.deadline,'2001-01-01');
 const before=sql.prepare('SELECT joined_at FROM reading_class_members WHERE class_id=? AND student_id=?').get(uxA.id,'ux-c').joined_at;
 await ux.mutate({action:'saveMembers',classId:uxA.id,studentIds:[...members,'ux-c'],version:(await ux.ownedClass(uxA.id)).version});
 assert.equal((await uxReading('ux-c',uxA.id)).id,added.id);assert.equal(sql.prepare('SELECT joined_at FROM reading_class_members WHERE class_id=? AND student_id=?').get(uxA.id,'ux-c').joined_at,before);
});
await test('transferência concorrente reverte membros, leituras e auditoria em conjunto',async()=>{
 const s=await uxSnapshot();let raced=false;
 const raceDB={...db,async batch(statements){if(!raced){raced=true;sql.prepare('UPDATE reading_classes SET version=version+1 WHERE id=?').run(uxB.id);}return db.batch(statements);}};
 const beforeEvents=sql.prepare('SELECT count(*) n FROM student_account_events').get().n;
 await rejected(()=>classroomService(raceDB,'ux-teacher').mutate({action:'studentClasses',studentId:'ux-c',classIds:[uxB.id],versions:Object.fromEntries(s.classes.map(c=>[c.id,c.version]))}),409);
 const after=await uxSnapshot();assert.deepEqual(after.classMembers,s.classMembers);assert.deepEqual(after.assignments,s.assignments);assert.equal(sql.prepare('SELECT count(*) n FROM student_account_events').get().n,beforeEvents);
});
await test('correção auditada reabre leitura sem apagar conclusão anterior',async()=>{
 const a=await uxReading('ux-a',uxA.id),s=await uxSnapshot(),previous=s.events.filter(e=>e.assignmentId===a.id);
 await rejected(()=>teacherB.mutate({action:'correctProgress',id:a.id,progress:100,version:a.version,reason:'Registro incorreto',confirmed:true}),404);
 await rejected(()=>uxStudent.mutate({action:'correctProgress',id:a.id,progress:100,version:a.version,reason:'Registro incorreto',confirmed:true}),403);
 await assert.rejects(()=>ux.mutate({action:'correctProgress',id:a.id,progress:100,version:a.version,reason:'',confirmed:true}));
 await ux.mutate({action:'correctProgress',id:a.id,progress:100,version:a.version,reason:'Página informada incorretamente',confirmed:true});
 const corrected=await uxReading('ux-a',uxA.id),events=(await uxSnapshot()).events.filter(e=>e.assignmentId===a.id);
 assert.equal(corrected.completedAt,null);assert.equal(corrected.progress,100);assert.equal(corrected.startedAt,a.startedAt);assert.equal(events.length,previous.length+1);assert.ok(events.some(e=>e.kind==='correction'&&e.reason==='Página informada incorretamente'&&e.actorName==='Professor UX'));assert.ok(events.some(e=>e.id===previous[0].id&&e.progress===200));
 await uxStudent.mutate({action:'progress',id:a.id,progress:200,version:corrected.version});assert.ok((await uxReading('ux-a',uxA.id)).completedAt);
});
await test('métricas são exclusivas, usam alunos atuais e nunca antecipam 100%',async()=>{
 const s=await uxSnapshot(),items=classReadings(s,uxA.id),all=classReadings(s,uxA.id,true);
 assert.ok(all.length>items.length);assert.equal(items.some(a=>a.studentId==='ux-a'),false);assert.equal(all.some(a=>a.studentId==='ux-a'),true);
 const m=metrics(all);assert.equal(m.total,m.completed+m.late+m.reading+m.pending);assert.equal(percentage({progress:199,totalPages:200}),99);assert.equal(percentage({progress:200,totalPages:200}),100);
 const sample={completedAt:null,startedAt:null,deadline:'2026-09-24',asOfDate:'2026-09-24'};assert.equal(readingStatus(sample),'pending');assert.equal(readingStatus({...sample,asOfDate:'2026-09-25'}),'late');assert.equal(readingStatus({...sample,completedAt:'2026-09-25'}),'completed');
});
await test('professor vinculado gerencia suas turmas mas não as credenciais alheias',async()=>{
 sql.prepare('INSERT INTO teacher_students(id,teacher_id,student_id,created_at) VALUES(?,?,?,?)').run('linked-other','teacher-b','00333001','2026-09-24');
 const group=await teacherB.mutate({action:'saveClass',name:'Outro professor'});
 await teacherB.mutate({action:'studentClasses',studentId:'00333001',classIds:[group.id],versions:{[group.id]:0}});
 assert.ok((await teacherB.snapshot()).classMembers.some(m=>m.studentId==='00333001'));
 const account=(await uxSnapshot()).students.find(s=>s.id==='00333001');await rejected(()=>teacherB.mutate({action:'resetStudentPassword',studentId:account.id,version:account.version,confirmed:true}),404);
 assert.equal((await teacherB.snapshot()).assignments.some(a=>a.teacherId==='ux-teacher'),false);
});
await test('desativar mantém vínculos e leituras; arquivar bloqueia novas entradas',async()=>{
 const before=await uxSnapshot(),a=before.students.find(s=>s.id==='00333001');await ux.mutate({action:'studentActive',studentId:a.id,version:a.version,active:false,confirmed:true});
 const after=await uxSnapshot();assert.deepEqual(after.assignments,before.assignments);assert.deepEqual(after.classMembers,before.classMembers);
 await ux.mutate({action:'classState',classId:uxB.id,state:'archive',version:(await ux.ownedClass(uxB.id)).version});
 await rejected(()=>ux.mutate({action:'createStudent',name:'Não deve criar',enrollment:'00333002',classIds:[uxB.id]}),404);assert.equal(sql.prepare('SELECT id FROM reading_users WHERE id=?').get('00333002'),undefined);
 const parent=await uxParent(uxB.id);await ux.mutate({action:'classDeadline',id:parent.id,deadline:null,version:parent.version,confirmed:true});assert.equal((await uxReading('ux-a',uxB.id)).deadline,null);
});
async function legacyClass(name,dates){
 const group=await ux.mutate({action:'saveClass',name});
 await ux.mutate({action:'saveMembers',classId:group.id,studentIds:['ux-a','ux-b'],version:0});
 const parent=crypto.randomUUID();sql.prepare('INSERT INTO reading_class_books(id,class_id,book_id,assigned_at) VALUES(?,?,?,?)').run(parent,group.id,uxBook.id,'2026-01-01');
 for(const [i,id] of ['ux-a','ux-b'].entries())sql.prepare('INSERT INTO reading_assignments(id,teacher_id,student_id,book_id,assigned_at,deadline,class_id,origin_key) VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),'ux-teacher',id,uxBook.id,'2026-01-01',dates[i],group.id,group.id);
 return {group,parent};
}
await test('normalização de dados antigos uniformes é idempotente e preserva datas',async()=>{
 const {group,parent}=await legacyClass('Dados uniformes',['2026-12-01','2026-12-01']);
 let s=await uxSnapshot();assert.equal(s.classBooks.find(c=>c.id===parent).deadline,'2026-12-01');assert.equal(s.classBooks.find(c=>c.id===parent).deadlineInitialized,1);assert.ok(s.assignments.filter(a=>a.classId===group.id).every(a=>a.classAssignmentId===parent&&a.assignedAt==='2026-01-01'));
 const before=s.assignments.filter(a=>a.classId===group.id);s=await uxSnapshot();assert.deepEqual(s.assignments.filter(a=>a.classId===group.id),before);assert.equal(s.events.some(e=>before.some(a=>a.id===e.assignmentId)),false);
});
await test('prazos antigos divergentes exigem revisão e ficam auditados por leitura',async()=>{
 const {group,parent}=await legacyClass('Dados divergentes',[null,'2026-12-01']);
 let s=await uxSnapshot();assert.equal(s.classBooks.find(c=>c.id===parent).deadlineInitialized,0);assert.equal(s.assignments.find(a=>a.classId===group.id&&a.studentId==='ux-a').deadline,null);assert.equal(s.assignments.find(a=>a.classId===group.id&&a.studentId==='ux-b').deadline,'2026-12-01');
 await rejected(()=>ux.mutate({action:'saveMembers',classId:group.id,studentIds:['ux-a','ux-b','ux-c'],version:(s.classes.find(c=>c.id===group.id)).version}),409);
 await ux.mutate({action:'classDeadline',id:parent,deadline:'2027-02-01',version:0,confirmed:true});s=await uxSnapshot();assert.equal(s.classBooks.find(c=>c.id===parent).deadlineInitialized,1);assert.ok(s.assignments.filter(a=>a.classId===group.id).every(a=>a.deadline==='2027-02-01'));
 const ids=s.assignments.filter(a=>a.classId===group.id).map(a=>a.id),audits=s.deadlineEvents.filter(e=>ids.includes(e.assignmentId));assert.equal(audits.length,2);assert.deepEqual(audits.map(e=>e.previousDeadline).sort(),['2026-12-01',null].sort());
 const collective=s.deadlineEvents.find(e=>e.classAssignmentId===parent);assert.equal(collective.consolidation,1);assert.ok(audits.every(e=>e.operationId===collective.id));
 for(const reading of s.assignments.filter(a=>a.classId===group.id)){const history=readingDeadlineHistory(s.deadlineEvents,reading);assert.equal(history.length,1);assert.equal(history[0].previousDeadline,reading.studentId==='ux-a'?null:'2026-12-01');}
 await ux.mutate({action:'saveMembers',classId:group.id,studentIds:['ux-a','ux-b','ux-c'],version:(s.classes.find(c=>c.id===group.id)).version});assert.equal((await uxSnapshot()).assignments.find(a=>a.classId===group.id&&a.studentId==='ux-c').deadline,'2027-02-01');
});
await test('60 acessos legítimos na mesma rede escolar não atingem o limite por matrícula',async()=>{
 sql.prepare('DELETE FROM student_login_attempts').run();
 for(let i=0;i<60;i++){const login=await auth.login({enrollment:'202600287',password:'Minha senha pessoal 287'},'school-network');assert.equal(login.mustChangePassword,false);}
 for(let i=0;i<5;i++)await rejected(()=>auth.login({enrollment:'202600287',password:'incorreta'},'school-network'),401);
 await rejected(()=>auth.login({enrollment:'202600287',password:'Minha senha pessoal 287'},'school-network'),429);
});
await test('todas as relações preservam integridade após os novos fluxos',()=>{assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);});
await test('cadastro contextual preserva os vínculos escolhidos e versões reais das turmas',async()=>{
 const a=await teacher.mutate({action:'saveClass',name:'Cadastro contextual A'}),b=await teacher.mutate({action:'saveClass',name:'Cadastro contextual B'});
 const scenarios=[[a.id],[b.id],[],[a.id,b.id]];
 for(const [i,classIds] of scenarios.entries()){
  const before=await teacher.snapshot(),enrollment='905000'+i;
  await teacher.mutate({action:'createStudent',name:'Mesmo nome de teste',enrollment,classIds});
  const after=await teacher.snapshot();
  assert.deepEqual(after.classMembers.filter(m=>m.studentId===enrollment).map(m=>m.classId).sort(),[...classIds].sort());
  for(const id of [a.id,b.id])assert.equal(after.classes.find(c=>c.id===id).version,before.classes.find(c=>c.id===id).version+(classIds.includes(id)?1:0));
 }
});
sql.close();
