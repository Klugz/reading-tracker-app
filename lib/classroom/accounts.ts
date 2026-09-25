import {z} from 'zod';
import {ApiError} from './errors';
import {hashPassword} from './passwords';
import {membershipStatements,assertReadyClasses} from './memberships';
export const enrollment=z.string().trim().regex(/^\d{1,32}$/,'Use apenas números, com até 32 dígitos.');
const studentFields={name:z.string().trim().min(2).max(160),email:z.union([z.literal(''),z.string().trim().email().max(254)]).default('')};
const id=z.string().min(1).max(160),version=z.number().int().min(0);
export const accountActions=['createStudent','editStudent','studentClasses','resetStudentPassword','studentActive','correctEnrollment','enrollStudent'];
const commands=z.discriminatedUnion('action',[
 z.object({action:z.literal('createStudent'),...studentFields,enrollment,classIds:z.array(id).max(20).default([])}),
 z.object({action:z.literal('enrollStudent'),studentId:id,enrollment,confirmed:z.literal(true)}),
 z.object({action:z.literal('editStudent'),studentId:enrollment,...studentFields,version}),
 z.object({action:z.literal('studentClasses'),studentId:id,classIds:z.array(id).max(20),versions:z.record(version)}),
 z.object({action:z.literal('resetStudentPassword'),studentId:enrollment,version,confirmed:z.literal(true)}),
 z.object({action:z.literal('studentActive'),studentId:enrollment,active:z.boolean(),version,confirmed:z.literal(true)}),
 z.object({action:z.literal('correctEnrollment'),studentId:enrollment,enrollment,version,confirmed:z.literal(true)}),
]);
type Account={student_id:string;teacher_id:string;version:number;active:number};
export async function manageStudent(db:D1Database,teacherId:string,input:unknown){
 const c=commands.parse(input),now=new Date().toISOString();
 const q=(sql:string,...args:unknown[])=>db.prepare(sql).bind(...args);
 const teacher=await q("SELECT id FROM reading_users WHERE id=? AND role='teacher'",teacherId).first();if(!teacher)throw new ApiError(403,'Apenas professores podem gerenciar alunos.');
 const audit=(studentId:string,action:string,detail:string)=>q('INSERT INTO student_account_events(id,student_id,teacher_id,action,detail,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),studentId,teacherId,action,detail,now);
 const owned=async(studentId:string)=>{const a=await q('SELECT student_id,teacher_id,version,active FROM managed_students WHERE student_id=? AND teacher_id=?',studentId,teacherId).first<Account>();if(!a)throw new ApiError(404,'Aluno não encontrado ou gerenciado por outro professor.');return a;};
 const linked=async(studentId:string)=>{if(!await q("SELECT l.id FROM teacher_students l JOIN reading_users u ON u.id=l.student_id WHERE l.teacher_id=? AND l.student_id=? AND u.role='student'",teacherId,studentId).first())throw new ApiError(404,'Aluno não encontrado.');};
 const guard=(studentId:string,v:number)=>q('UPDATE managed_students SET version=CASE WHEN version=? THEN version+1 ELSE NULL END WHERE student_id=? AND teacher_id=?',v,studentId,teacherId);
 const rekey=(oldId:string,newId:string)=>[
 q('PRAGMA defer_foreign_keys=ON'),
 q('UPDATE reading_classes SET version=version+1 WHERE id IN (SELECT class_id FROM reading_class_members WHERE student_id=?)',oldId),
 q("UPDATE reading_users SET id=? WHERE id=? AND role='student'",newId,oldId),
 ...['teacher_students','reading_class_members','reading_assignments','managed_students','student_account_events'].map(table=>q(`UPDATE ${table} SET student_id=? WHERE student_id=?`,newId,oldId)),
 q('UPDATE goals SET owner_id=? WHERE owner_id=?',newId,oldId),
 q('UPDATE reading_events SET actor_id=? WHERE actor_id=?',newId,oldId),
 q('DELETE FROM student_sessions WHERE student_id=?',oldId),
 ];
 try{
 if(c.action==='createStudent'){
  if(await q('SELECT id FROM reading_users WHERE id=?',c.enrollment).first())throw new ApiError(409,'Já existe um aluno cadastrado com esta matrícula.');
  const selected=[...new Set(c.classIds)],groups=[];
  for(const classId of selected){const group=await q('SELECT id,version FROM reading_classes WHERE id=? AND teacher_id=? AND archived_at IS NULL AND deleted_at IS NULL',classId,teacherId).first<{id:string;version:number}>();if(!group)throw new ApiError(404,'Selecione apenas suas turmas ativas.');groups.push(group);}
  const hash=await hashPassword('EDU123');
  await assertReadyClasses(db,selected);
  await db.batch([q("INSERT INTO reading_users(id,name,role,created_at) VALUES(?,?,'student',?)",c.enrollment,c.name,now),q('INSERT INTO managed_students(student_id,teacher_id,email,password_hash) VALUES(?,?,?,?)',c.enrollment,teacherId,c.email||null,hash),q('INSERT INTO teacher_students(id,teacher_id,student_id,created_at) VALUES(?,?,?,?)',crypto.randomUUID(),teacherId,c.enrollment,now),...membershipStatements(db,teacherId,groups.map(g=>({classId:g.id,version:g.version,add:[c.enrollment],remove:[]})),now),audit(c.enrollment,c.action,'Conta criada pelo professor')]);return {id:c.enrollment,enrollment:c.enrollment};
 }
 if(c.action==='enrollStudent'){
  await linked(c.studentId);if(await q('SELECT student_id FROM managed_students WHERE student_id=?',c.studentId).first())throw new ApiError(409,'Este aluno já possui acesso por matrícula.');
  if(await q('SELECT id FROM reading_users WHERE id=?',c.enrollment).first())throw new ApiError(409,'Já existe um aluno cadastrado com esta matrícula.');
  const hash=await hashPassword('EDU123');
  await db.batch([...rekey(c.studentId,c.enrollment),q('INSERT INTO managed_students(student_id,teacher_id,password_hash,legacy_identity) VALUES(?,?,?,?)',c.enrollment,teacherId,hash,c.studentId),audit(c.enrollment,c.action,'Acesso anterior convertido para matrícula')]);return {id:c.enrollment};
 }
 if(c.action==='studentClasses'){
  await linked(c.studentId);
  const groups=await q('SELECT id,version,archived_at AS archivedAt FROM reading_classes WHERE teacher_id=? AND deleted_at IS NULL',teacherId).all<{id:string;version:number;archivedAt:string|null}>();
  const current=await q('SELECT m.class_id FROM reading_class_members m JOIN reading_classes c ON c.id=m.class_id WHERE m.student_id=? AND c.teacher_id=? AND c.deleted_at IS NULL',c.studentId,teacherId).all<{class_id:string}>();
  const old=new Set(current.results.map(r=>r.class_id)),selected=new Set(c.classIds),affected=groups.results.filter(g=>old.has(g.id)||selected.has(g.id));
  if([...selected].some(i=>!groups.results.some(g=>g.id===i)))throw new ApiError(404,'Turma não encontrada.');
  for(const g of affected){if(c.versions[g.id]!==g.version)throw new ApiError(409,'As turmas mudaram. Reabra o formulário para revisar.');if(g.archivedAt&&old.has(g.id)!==selected.has(g.id))throw new ApiError(409,'Restaure a turma arquivada para alterar seus alunos.');}
  await assertReadyClasses(db,[...selected].filter(g=>!old.has(g)));
  const statements=membershipStatements(db,teacherId,affected.map(g=>({classId:g.id,version:g.version,add:selected.has(g.id)&&!old.has(g.id)?[c.studentId]:[],remove:old.has(g.id)&&!selected.has(g.id)?[c.studentId]:[]})),now);
  await db.batch([...statements,audit(c.studentId,c.action,JSON.stringify({classIds:[...selected]}))]);return {saved:true};
 }
 const a=await owned(c.studentId);if(a.version!==c.version)throw new ApiError(409,'O cadastro mudou. Reabra o formulário para atualizar.');
 // The guard changes a NOT NULL version to NULL on a race, rolling back the whole batch.
 const lock=guard(c.studentId,c.version);
 if(c.action==='editStudent'){
  await db.batch([lock,q('UPDATE reading_users SET name=? WHERE id=?',c.name,c.studentId),q('UPDATE managed_students SET email=? WHERE student_id=?',c.email||null,c.studentId),audit(c.studentId,c.action,'Nome ou e-mail atualizado')]);return {saved:true};
 }
 if(c.action==='correctEnrollment'){
  if(c.enrollment===c.studentId)throw new ApiError(400,'Informe uma matrícula diferente da atual.');
  if(await q('SELECT id FROM reading_users WHERE id=?',c.enrollment).first())throw new ApiError(409,'Já existe um aluno cadastrado com esta matrícula.');
  await db.batch([lock,...rekey(c.studentId,c.enrollment),q('UPDATE managed_students SET auth_version=auth_version+1 WHERE student_id=?',c.enrollment),audit(c.enrollment,c.action,JSON.stringify({previous:c.studentId,current:c.enrollment}))]);return {id:c.enrollment};
 }
 if(c.action==='resetStudentPassword'){
  const hash=await hashPassword('EDU123');await db.batch([lock,q('UPDATE managed_students SET password_hash=?,must_change_password=1,auth_version=auth_version+1 WHERE student_id=?',hash,c.studentId),q('DELETE FROM student_sessions WHERE student_id=?',c.studentId),audit(c.studentId,c.action,'Senha inicial redefinida')]);return {saved:true};
 }
 await db.batch([lock,q('UPDATE managed_students SET active=?,auth_version=auth_version+1 WHERE student_id=?',Number(c.active),c.studentId),q('DELETE FROM student_sessions WHERE student_id=?',c.studentId),audit(c.studentId,c.action,c.active?'Conta reativada':'Conta desativada')]);return {saved:true};
 }catch(e){const message=String(e);if(message.includes('UNIQUE constraint failed: reading_users.id')||message.includes('UNIQUE constraint failed: managed_students.student_id'))throw new ApiError(409,'Já existe um aluno cadastrado com esta matrícula.');if(message.includes('NOT NULL constraint failed:')||message.includes('FOREIGN KEY constraint failed'))throw new ApiError(409,'O cadastro ou a turma mudou. Atualize os dados e tente novamente.');throw e;}
}
