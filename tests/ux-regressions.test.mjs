import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import ts from 'typescript';
await mkdir('.sites-runtime/ux-tests',{recursive:true});
for(const [name,path] of Object.entries({'membership-draft':'components/classroom/membership-draft.ts','navigation-model':'components/classroom/navigation-model.ts','deadline-history':'lib/classroom/deadline-history.ts'})){
 const code=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 await writeFile(`.sites-runtime/ux-tests/${name}.mjs`,code);
}
const {reconcileMembers}=await import('../.sites-runtime/ux-tests/membership-draft.mjs');
const {defaults,navigationUrl,readNavigation,rememberOrigin,returnContext}=await import('../.sites-runtime/ux-tests/navigation-model.mjs');
const {readingDeadlineHistory}=await import('../.sites-runtime/ux-tests/deadline-history.mjs');
const snapshot=(members,version=4)=>({classes:[{id:'A',version},{id:'B',version:2}],students:['old','add','remote','new'].map(id=>({id})),classMembers:members.map(studentId=>({classId:'A',studentId}))});
await test('V01/V03: contextual creation uses actual membership and version, including multiple classes',()=>{
 for(const version of [5,9])assert.deepEqual(reconcileMembers(['old'],['old'],snapshot(['old','new'],version),'A'),{original:['old','new'],selected:['old','new'],version});
});
await test('V02/V03: creating only in B or without a class never selects the new student in A',()=>{
 for(const classId of ['B',null]){const data=snapshot(['old']);if(classId)data.classMembers.push({classId,studentId:'new'});assert.deepEqual(reconcileMembers(['old'],['old'],data,'A'),{original:['old'],selected:['old'],version:4});}
});
await test('V04/V05: rebase preserves unsaved additions/removals and concurrent server additions',()=>{
 const original=['old'],selected=['add'];
 assert.deepEqual(reconcileMembers(original,selected,snapshot(['old','remote','new'],8),'A'),{original:['old','remote','new'],selected:['remote','new','add'],version:8});
 assert.deepEqual(original,['old']);assert.deepEqual(selected,['add']);
});
await test('V04: missing class cannot produce an invented version or discard the draft',()=>{
 const original=['old'],selected=['add'];assert.throws(()=>reconcileMembers(original,selected,{classes:[],classMembers:[],students:[]},'A'),/não está mais disponível/);assert.deepEqual(selected,['add']);
});
await test('V06: Turmas returns directly to the original class list with search and archived filter',()=>{
 const list={...defaults,query:'Literatura',scope:'archived'},origins=rememberOrigin({},'class',list,410);
 const detail={...defaults,classId:'A',book:'book',filter:'late'};
 const target=returnContext(origins,'class',{...detail,classId:null,book:null});
 assert.equal(navigationUrl(target.state),'/professor?q=Literatura&scope=archived');assert.equal(target.scroll,410);
});
await test('V07: reading → student → return restores the filtered book list, without reopening the reading',()=>{
 const list={...defaults,classId:'A',book:'book',filter:'late',scope:'history'};
 let origins=rememberOrigin({},'reading',list,620);
 origins=rememberOrigin(origins,'student',{...list,reading:'reading'},0);
 const target=returnContext(origins,'student',{...defaults,view:'students'});
 assert.deepEqual(target,{state:list,scroll:620});assert.ok(!navigationUrl(target.state).includes('reading='));
});
await test('V08: closing a reading preserves search, filter, class, book and scroll',()=>{
 const list={...defaults,view:'reports',query:'202600154',filter:'late',scope:'A'};
 const target=returnContext(rememberOrigin({},'reading',list,280),'reading',{...list,reading:null});
 assert.deepEqual(target,{state:list,scroll:280});
});
await test('V08: direct links round-trip and return to a safe fallback without relying on history depth',()=>{
 const state={...defaults,classId:'A',book:'book',reading:'r',filter:'late',scope:'history'};
 assert.deepEqual(readNavigation('https://example.test'+navigationUrl(state),false),state);
 assert.deepEqual(returnContext({},'student',{...defaults,view:'students'}).state,{...defaults,view:'students'});
 assert.equal(readNavigation('https://example.test/aluno?view=reports',true).view,'library');
});
const base={teacherId:'t',classAssignmentId:null,assignmentId:null,operationId:null,consolidation:0,previousDeadline:null,deadline:'2027-02-01',createdAt:'2026-09-24T10:00:00Z'};
const reading={id:'r',teacherId:'t',classAssignmentId:'ca'};
const root={...base,id:'op',classAssignmentId:'ca',consolidation:1};
const child={...base,id:'child',assignmentId:'r',operationId:'op',previousDeadline:'2026-12-01'};
await test('V09: consolidation appears once with the individual previous deadline and preserves raw audit',()=>{
 const raw=[root,child],copy=structuredClone(raw);const history=readingDeadlineHistory(raw,reading);
 assert.equal(history.length,1);assert.equal(history[0].previousDeadline,'2026-12-01');assert.deepEqual(raw,copy);
});
await test('V09: legacy one-to-one match is normalized without writing a backfill',()=>{
 const raw=[{...root,consolidation:0},{...child,operationId:null}];assert.equal(readingDeadlineHistory(raw,reading).length,1);assert.equal(raw[1].operationId,null);
});
await test('V10: ambiguous legacy roots are all retained and labelled as collective definitions',()=>{
 const raw=[{...root,consolidation:0},{...root,id:'other-op',consolidation:0},{...child,operationId:null}];
 const history=readingDeadlineHistory(raw,reading);assert.equal(history.length,3);assert.ok(history.filter(e=>!e.assignmentId).every(e=>e.scope==='consolidation'));
});
await test('V10: independent operations at the same instant and repeated deadlines remain distinct',()=>{
 const next={...root,id:'next',consolidation:0,previousDeadline:'2027-01-01'};
 const cleared={...root,id:'clear',consolidation:0,previousDeadline:'2027-02-01',deadline:null};
 const history=readingDeadlineHistory([root,child,next,cleared],reading);
 assert.deepEqual(history.map(e=>e.id),['child','next','clear']);
});
await test('deadline projection excludes other students, teachers and class assignments',()=>{
 const history=readingDeadlineHistory([root,child,{...child,id:'other-student',assignmentId:'s'},{...root,id:'other-teacher',teacherId:'foreign'},{...root,id:'other-class',classAssignmentId:'cb'}],reading);
 assert.deepEqual(history.map(e=>e.id),['child']);
});
await test('V09: additive migration preserves populated audit/history and enforces the new operation reference',async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const {readdir}=await import('node:fs/promises');
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON');
  for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')&&!f.startsWith('0006')).sort())db.exec(await readFile('drizzle/'+file,'utf8'));
  db.exec(`
   INSERT INTO reading_users(id,name,role,created_at) VALUES('t','Professor','teacher','2026-01-01'),('s','Aluno','student','2026-01-01');
   INSERT INTO books(id,owner_id,title,author,total_pages,created_at,updated_at) VALUES('b','t','Livro','Autor',200,'2026-01-01','2026-01-01');
   INSERT INTO reading_classes(id,teacher_id,name,created_at) VALUES('c','t','Turma','2026-01-01');
   INSERT INTO reading_class_books(id,class_id,book_id,assigned_at) VALUES('ca','c','b','2026-01-01');
   INSERT INTO reading_assignments(id,teacher_id,student_id,book_id,assigned_at,class_id,class_assignment_id,progress,started_at) VALUES('r','t','s','b','2026-01-01','c','ca',100,'2026-01-02');
   INSERT INTO reading_events(id,assignment_id,progress,previous_progress,created_at,version) VALUES('p','r',100,0,'2026-01-02',1);
   INSERT INTO reading_deadline_events(id,teacher_id,class_assignment_id,deadline,created_at) VALUES('op','t','ca','2027-02-01','2026-01-03');
   INSERT INTO reading_deadline_events(id,teacher_id,assignment_id,previous_deadline,deadline,created_at) VALUES('child','t','r','2026-12-01','2027-02-01','2026-01-03');
  `);
  const audit=db.prepare('SELECT * FROM reading_deadline_events ORDER BY id').all(),readings=db.prepare('SELECT * FROM reading_assignments').all(),progress=db.prepare('SELECT * FROM reading_events').all();
  db.exec(await readFile('drizzle/0006_dear_boomerang.sql','utf8'));
  assert.deepEqual(db.prepare('SELECT * FROM reading_deadline_events ORDER BY id').all().map(({operation_id,consolidation,...row})=>{assert.equal(operation_id,null);assert.equal(consolidation,0);return {...row};}),audit.map(row=>({...row})));
  assert.deepEqual(db.prepare('SELECT * FROM reading_assignments').all(),readings);assert.deepEqual(db.prepare('SELECT * FROM reading_events').all(),progress);
  assert.throws(()=>db.prepare('UPDATE reading_deadline_events SET operation_id=? WHERE id=?').run('missing','child'),/FOREIGN KEY/);
  db.prepare('UPDATE reading_deadline_events SET operation_id=? WHERE id=?').run('op','child');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
});
