import { z } from 'zod';
import type { Reader, Role, ReadingClass, AssignmentDraft } from './types';

import {ApiError} from './errors';
export {ApiError} from './errors';
import {accountActions,manageStudent} from './accounts';
import {normalizeClassAssignments,membershipStatements,syncClassReadings,assertReadyClasses,atomic} from './memberships';
import {schoolToday} from './types';
const text = z.string().trim().min(1).max(160);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=> !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s,'Data inválida');
const bookInput = z.object({title:text,author:text,totalPages:z.number().int().min(1).max(100000),unit:z.enum(['pages','chapters','percent']),coverUrl:z.union([z.literal(''),z.string().url().max(2000).refine(s=>new URL(s).protocol==='https:','Use uma imagem HTTPS')]).optional()});
const distributionInput=z.object({bookId:text,mode:z.enum(['class','individual']),classIds:z.array(text).max(20).default([]),studentIds:z.array(text).max(200).default([]),deadline:date.nullable()});
const commands = z.discriminatedUnion('action',[
  z.object({action:z.literal('onboard'),name:z.string().trim().min(2).max(60),role:z.enum(['teacher','student'])}),
  z.object({action:z.literal('join'),code:z.string().trim().min(20).max(100)}),
  bookInput.extend({action:z.literal('saveBook'),id:z.string().optional()}),
  z.object({action:z.literal('deleteBook'),id:text}),
  z.object({action:z.literal('personalProgress'),id:text,progress:z.number().int().min(0).max(100000)}),
  z.object({action:z.literal('assign'),bookId:text,studentIds:z.array(text).min(1).max(200),deadline:date.nullable()}),
  z.object({action:z.literal('saveClass'),id:text.optional(),name:z.string().trim().min(1).max(100),description:z.string().trim().max(1000).default(''),version:z.number().int().min(0).optional()}),
  z.object({action:z.literal('saveMembers'),classId:text,studentIds:z.array(text).max(200),version:z.number().int().min(0)}),
  z.object({action:z.literal('classState'),classId:text,state:z.enum(['archive','restore','delete']),version:z.number().int().min(0)}),
  distributionInput.extend({action:z.literal('previewAssignment')}),
  distributionInput.extend({action:z.literal('distribute'),versions:z.record(z.number().int().min(0)).default({})}),
  z.object({action:z.literal('deadline'),id:text,deadline:date.nullable(),version:z.number().int().min(0).optional()}),
  z.object({action:z.literal('classDeadline'),id:text,deadline:date.nullable(),version:z.number().int().min(0),confirmed:z.literal(true)}),
  z.object({action:z.literal('correctProgress'),id:text,progress:z.number().int().min(0).max(100000),version:z.number().int().min(0),reason:z.string().trim().min(3,'Explique brevemente o motivo.').max(300),confirmed:z.literal(true)}),
  z.object({action:z.literal('progress'),id:text,progress:z.number().int().min(0).max(100000),version:z.number().int().min(0)}),
  z.object({action:z.literal('saveGoal'),title:text,targetBooks:z.number().int().min(1).max(200),startDate:date,endDate:date}),
  z.object({action:z.literal('deleteGoal'),id:text}),
]);
const bookCols = 'id,title,author,total_pages AS totalPages,unit,cover_url AS coverUrl,current_page AS personalPage,status AS personalStatus,personal_completed_at AS personalCompletedAt,updated_at AS updatedAt';
const effectiveDeadline=`CASE WHEN a.class_id IS NOT NULL AND cb.deadline_initialized=1 THEN cb.deadline ELSE a.deadline END`;
const assignmentCols = `a.id,a.book_id AS bookId,a.teacher_id AS teacherId,a.student_id AS studentId,a.assigned_at AS assignedAt,${effectiveDeadline} AS deadline,a.progress,a.started_at AS startedAt,a.updated_at AS updatedAt,a.completed_at AS completedAt,a.version,a.class_id AS classId,COALESCE(a.class_assignment_id,cb.id) AS classAssignmentId,cb.version AS classAssignmentVersion,a.origin_key AS originKey,c.name AS className,c.archived_at AS classArchivedAt,c.deleted_at AS classDeletedAt,b.title,b.author,b.total_pages AS totalPages,b.unit,b.cover_url AS coverUrl,s.name AS studentName,ms.student_id AS studentEnrollment,t.name AS teacherName`;
const classAssignmentJoin='LEFT JOIN reading_class_books cb ON cb.class_id=a.class_id AND cb.book_id=a.book_id';

export function classroomService(db:D1Database, identity:string|null) {
  if(!identity) throw new ApiError(401,'Entre na sua conta para continuar.');
  const id=identity;
  const query=(sql:string,...args:unknown[])=>db.prepare(sql).bind(...args);
  const user=()=>query('SELECT u.id,u.name,u.role,u.invite_code AS inviteCode,m.student_id AS enrollment,m.must_change_password AS mustChangePassword,m.active FROM reading_users u LEFT JOIN managed_students m ON m.student_id=u.id WHERE u.id=?',id).first<Reader>();
  const requireRole=async(role?:Role)=>{const u=await user();if(!u)throw new ApiError(403,'Configure seu perfil para continuar.');if(!['teacher','student'].includes(u.role))throw new ApiError(403,'Seu perfil não permite esta ação.');if(u.enrollment&&!u.active)throw new ApiError(403,'Conta desativada. Procure seu professor.');if(u.enrollment&&u.mustChangePassword)throw new ApiError(428,'Crie sua senha pessoal para continuar.');if(role&&u.role!==role)throw new ApiError(403,'Seu perfil não permite esta ação.');return u;};
  async function ownedClass(classId:string,active=false){
    await requireRole('teacher');
    const group=await query('SELECT id,name,description,archived_at AS archivedAt,created_at AS createdAt,version FROM reading_classes WHERE id=? AND teacher_id=? AND deleted_at IS NULL',classId,id).first<ReadingClass>();
    if(!group)throw new ApiError(404,'Turma não encontrada.');
    if(active&&group.archivedAt)throw new ApiError(409,'Restaure a turma arquivada antes de realizar esta ação.');
    return group;
  }
  async function linkedStudents(ids:string[]){
    const linked=await query('SELECT student_id FROM teacher_students WHERE teacher_id=?',id).all<{student_id:string}>();
    const allowed=new Set(linked.results.map(s=>s.student_id));
    if(!ids.every(s=>allowed.has(s)))throw new ApiError(403,'Selecione apenas alunos vinculados a você.');
  }
  async function planDistribution(draft:AssignmentDraft){
    await requireRole('teacher');
    const book=await query('SELECT title FROM books WHERE id=? AND owner_id=?',draft.bookId,id).first<{title:string}>();
    if(!book)throw new ApiError(404,'Livro não encontrado.');
    const recipients:{studentId:string;classId:string|null;originKey:string}[]=[];
    const groups:{id:string;name:string;students:number}[]=[];const versions:Record<string,number>={};
    if(draft.mode==='class'){
      const ids=[...new Set(draft.classIds)];if(!ids.length||draft.studentIds.length)throw new ApiError(400,'Selecione ao menos uma turma.');
      await assertReadyClasses(db,ids);
      for(const groupId of ids){
        const group=await ownedClass(groupId,true);versions[group.id]=group.version;
        const members=await query('SELECT student_id AS studentId FROM reading_class_members WHERE class_id=?',groupId).all<{studentId:string}>();
        if(!members.results.length)throw new ApiError(400,`A turma “${group.name}” está vazia. Adicione alunos antes de atribuir.`);
        groups.push({id:groupId,name:group.name,students:members.results.length});
        for(const member of members.results)recipients.push({studentId:member.studentId,classId:groupId,originKey:groupId});
      }
    }else{
      const ids=[...new Set(draft.studentIds)];if(!ids.length||draft.classIds.length)throw new ApiError(400,'Selecione ao menos um aluno.');
      await linkedStudents(ids);for(const studentId of ids)recipients.push({studentId,classId:null,originKey:'individual'});
    }
    const existing=await query('SELECT student_id,origin_key FROM reading_assignments WHERE teacher_id=? AND book_id=?',id,draft.bookId).all<{student_id:string;origin_key:string}>();
    const keys=new Set(existing.results.map(a=>JSON.stringify([a.student_id,a.origin_key])));
    const newRecipients=recipients.filter(r=>!keys.has(JSON.stringify([r.studentId,r.originKey])));
    return {recipients,newRecipients,bookTitle:book.title,classes:groups,versions,readings:recipients.length,newReadings:newRecipients.length,existingReadings:recipients.length-newRecipients.length,recipientKeys:recipients.map(r=>JSON.stringify([r.studentId,r.originKey]))};
  }
  async function snapshot(){
    const u=await user();
    const empty={user:u,today:schoolToday(),books:[],students:[],teachers:[],assignments:[],events:[],deadlineEvents:[],goals:[],classes:[],classMembers:[],classBooks:[]};
    if(!u)return empty;await requireRole();
    if(u.role==='teacher')await normalizeClassAssignments(db,id);
    const owner=u.role==='teacher'?'a.teacher_id':'a.student_id';
    const joins='FROM reading_assignments a JOIN books b ON b.id=a.book_id JOIN reading_users s ON s.id=a.student_id JOIN reading_users t ON t.id=a.teacher_id LEFT JOIN reading_classes c ON c.id=a.class_id LEFT JOIN managed_students ms ON ms.student_id=s.id '+classAssignmentJoin;
    const rows=await db.batch([
      query(u.role==='teacher'?`SELECT ${bookCols} FROM books WHERE owner_id=? ORDER BY created_at DESC`:`SELECT ${bookCols} FROM books WHERE 0 AND owner_id=?`,id),
      query(`SELECT ${assignmentCols} ${joins} WHERE ${owner}=? ORDER BY a.assigned_at DESC`,id),
      query(`SELECT e.id,e.assignment_id AS assignmentId,e.progress,e.previous_progress AS previousProgress,e.created_at AS createdAt,e.version,e.kind,e.reason,e.completion_deadline AS completionDeadline,e.deadline_recorded AS deadlineRecorded,actor.name AS actorName,b.title,s.name AS studentName,ms.student_id AS studentEnrollment,b.total_pages AS totalPages,b.unit FROM reading_events e JOIN reading_assignments a ON a.id=e.assignment_id JOIN books b ON b.id=a.book_id JOIN reading_users s ON s.id=a.student_id LEFT JOIN managed_students ms ON ms.student_id=s.id LEFT JOIN reading_users actor ON actor.id=e.actor_id WHERE ${owner}=? ORDER BY e.created_at DESC,e.version DESC`,id),
      query(u.role==='teacher'?'SELECT u.id,u.name,m.student_id AS enrollment,m.email,m.active,m.must_change_password AS mustChangePassword,m.version,m.teacher_id AS managedBy FROM teacher_students l JOIN reading_users u ON u.id=l.student_id LEFT JOIN managed_students m ON m.student_id=u.id WHERE l.teacher_id=? ORDER BY u.name,u.id':'SELECT u.id,u.name FROM teacher_students l JOIN reading_users u ON u.id=l.teacher_id WHERE l.student_id=? ORDER BY u.name',id),
      query('SELECT id,title,target_books AS targetBooks,start_date AS startDate,end_date AS endDate FROM goals WHERE owner_id=? ORDER BY created_at DESC',id),
      query(u.role==='teacher'?'SELECT id,name,description,archived_at AS archivedAt,created_at AS createdAt,version FROM reading_classes WHERE teacher_id=? AND deleted_at IS NULL ORDER BY created_at DESC':'SELECT c.id,c.name,c.description,c.archived_at AS archivedAt,c.created_at AS createdAt,c.version FROM reading_classes c JOIN reading_class_members m ON m.class_id=c.id WHERE m.student_id=? AND c.deleted_at IS NULL',id),
      query(u.role==='teacher'?'SELECT m.class_id AS classId,m.student_id AS studentId FROM reading_class_members m JOIN reading_classes c ON c.id=m.class_id WHERE c.teacher_id=? AND c.deleted_at IS NULL':'SELECT class_id AS classId,student_id AS studentId FROM reading_class_members WHERE student_id=?',id),
      query(`SELECT cb.id,cb.class_id AS classId,cb.book_id AS bookId,cb.assigned_at AS assignedAt,cb.deadline,cb.version,cb.deadline_initialized AS deadlineInitialized FROM reading_class_books cb JOIN reading_classes c ON c.id=cb.class_id WHERE ${u.role==='teacher'?'c.teacher_id=? AND c.deleted_at IS NULL':'EXISTS (SELECT 1 FROM reading_assignments a WHERE a.class_id=cb.class_id AND a.book_id=cb.book_id AND a.student_id=?)'}`,id),
      query(`SELECT e.id,e.teacher_id AS teacherId,e.class_assignment_id AS classAssignmentId,e.assignment_id AS assignmentId,e.operation_id AS operationId,e.consolidation,e.previous_deadline AS previousDeadline,e.deadline,e.created_at AS createdAt FROM reading_deadline_events e WHERE ${u.role==='teacher'?'e.teacher_id=?':'EXISTS (SELECT 1 FROM reading_assignments a WHERE a.student_id=? AND (a.id=e.assignment_id OR a.class_assignment_id=e.class_assignment_id))'} ORDER BY e.created_at DESC`,id),
    ]);
    return {...empty,classes:rows[5].results,classMembers:rows[6].results,classBooks:rows[7].results,deadlineEvents:rows[8].results,books:rows[0].results,assignments:rows[1].results.map(a=>({...a as Record<string,unknown>,asOfDate:empty.today})),events:rows[2].results,students:u.role==='teacher'?rows[3].results:[],teachers:u.role==='student'?rows[3].results:[],goals:rows[4].results};
  }
  async function mutate(input:unknown){
    if(input&&typeof input==='object'&&accountActions.includes(String((input as {action?:unknown}).action))){await requireRole('teacher');await normalizeClassAssignments(db,id);return manageStudent(db,id,input);}
    const c=commands.parse(input);const now=new Date().toISOString();
    if(c.action==='onboard'){
      if(await query('SELECT student_id FROM managed_students WHERE legacy_identity=? OR student_id=?',id,id).first())throw new ApiError(403,'Entre com a matrícula fornecida pelo professor.');
      if(c.role==='student')throw new ApiError(403,'Peça ao professor para criar sua conta por matrícula.');
      const existing=await user();if(existing)throw new ApiError(409,'O perfil já foi definido e não pode ser alterado por esta ação.');
      await query('INSERT INTO reading_users (id,name,role,invite_code,created_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING',id,c.name,c.role,c.role==='teacher'?crypto.randomUUID().replaceAll('-',''):null,now).run();
      return {saved:true};
    }
    const u=await requireRole();
    if(u.role==='teacher')await normalizeClassAssignments(db,id);
    if(c.action==='join'){
      await requireRole('student');if(u.enrollment)throw new ApiError(403,'Seu professor gerencia os vínculos da sua conta.');
      const teacher=await query("SELECT id,name FROM reading_users WHERE invite_code=? AND role='teacher'",c.code).first<{id:string;name:string}>();
      if(!teacher)throw new ApiError(404,'Código não encontrado. Confira com seu professor.');
      await query('INSERT INTO teacher_students (id,teacher_id,student_id,created_at) VALUES (?,?,?,?) ON CONFLICT(teacher_id,student_id) DO NOTHING',crypto.randomUUID(),teacher.id,id,now).run();
      return {saved:true,teacherName:teacher.name};
    }
    if(c.action==='saveBook'){
      await requireRole('teacher');
      const total=c.unit==='percent'?100:c.totalPages;
      if(c.id){
        const b=await query('SELECT id,total_pages,unit FROM books WHERE id=? AND owner_id=?',c.id,id).first<{id:string;total_pages:number;unit:string}>();
        if(!b)throw new ApiError(404,'Livro não encontrado.');
        const assigned=await query('SELECT id FROM reading_assignments WHERE book_id=? LIMIT 1',c.id).first();
        if(assigned&&(b.total_pages!==total||b.unit!==c.unit))throw new ApiError(409,'Este livro já foi atribuído. Mantenha a unidade e o total para preservar os registros.');
        await query('UPDATE books SET title=?,author=?,total_pages=?,unit=?,cover_url=?,updated_at=? WHERE id=? AND owner_id=?',c.title,c.author,total,c.unit,c.coverUrl||null,now,c.id,id).run();
        return {id:c.id};
      }
      const bookId=crypto.randomUUID();
      await query("INSERT INTO books (id,owner_id,title,author,total_pages,unit,cover_url,current_page,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,0,'want_to_read',?,?)",bookId,id,c.title,c.author,total,c.unit,c.coverUrl||null,now,now).run();
      return {id:bookId};
    }
    if(c.action==='personalProgress'){
      await requireRole('teacher');
      const b=await query('SELECT total_pages FROM books WHERE id=? AND owner_id=?',c.id,id).first<{total_pages:number}>();
      if(!b)throw new ApiError(404,'Livro não encontrado.');
      if(c.progress>b.total_pages)throw new ApiError(400,'O progresso não pode ultrapassar o total do livro.');
      await query('UPDATE books SET current_page=?,status=?,personal_completed_at=CASE WHEN ?=total_pages THEN COALESCE(personal_completed_at,?) ELSE NULL END,updated_at=? WHERE id=? AND owner_id=?',c.progress,c.progress===b.total_pages?'completed':c.progress?'reading':'want_to_read',c.progress,now,now,c.id,id).run();return {saved:true};
    }
    if(c.action==='deleteBook'){
      await requireRole('teacher');
      const owned=await query('SELECT id FROM books WHERE id=? AND owner_id=?',c.id,id).first();if(!owned)throw new ApiError(404,'Livro não encontrado.');
      if(await query('SELECT id FROM reading_assignments WHERE book_id=? LIMIT 1',c.id).first())throw new ApiError(409,'Este livro possui leituras atribuídas. Ele é mantido para preservar o histórico dos alunos.');
      await query('DELETE FROM books WHERE id=? AND owner_id=?',c.id,id).run();return {deleted:true};
    }
    if(c.action==='assign'){
      await requireRole('teacher');
      if(!await query('SELECT id FROM books WHERE id=? AND owner_id=?',c.bookId,id).first())throw new ApiError(404,'Livro não encontrado.');
      const studentIds=[...new Set(c.studentIds)];
      const linked=await query('SELECT student_id FROM teacher_students WHERE teacher_id=?',id).all<{student_id:string}>();
      const permitted=new Set(linked.results.map(s=>s.student_id));
      if(!studentIds.every(s=>permitted.has(s)))throw new ApiError(403,'Selecione apenas alunos vinculados a você.');
      const results=await db.batch(studentIds.map(s=>query('INSERT INTO reading_assignments (id,teacher_id,student_id,book_id,assigned_at,deadline,progress,version) VALUES (?,?,?,?,?,?,0,0) ON CONFLICT(book_id,student_id,origin_key) DO NOTHING',crypto.randomUUID(),id,s,c.bookId,now,c.deadline)));
      return {assigned:results.reduce((sum,r)=>sum+(r.meta.changes||0),0)};
    }
    if(c.action==='saveClass'){
      await requireRole('teacher');
      if(c.id){await ownedClass(c.id);const r=await query('UPDATE reading_classes SET name=?,description=?,version=version+1 WHERE id=? AND teacher_id=? AND version=? AND deleted_at IS NULL',c.name,c.description,c.id,id,c.version??-1).run();if(!r.meta.changes)throw new ApiError(409,'A turma foi alterada. Atualize e tente novamente.');return {id:c.id};}
      const groupId=crypto.randomUUID();await query('INSERT INTO reading_classes (id,teacher_id,name,description,created_at) VALUES (?,?,?,?,?)',groupId,id,c.name,c.description,now).run();return {id:groupId};
    }
    if(c.action==='saveMembers'){
      const group=await ownedClass(c.classId,true);
      if(group.version!==c.version)throw new ApiError(409,'A lista da turma mudou. Reabra o formulário para atualizar.');
      const studentIds=[...new Set(c.studentIds)];await linkedStudents(studentIds);
      const current=await query('SELECT student_id FROM reading_class_members WHERE class_id=?',c.classId).all<{student_id:string}>();
      const old=current.results.map(r=>r.student_id),add=studentIds.filter(s=>!old.includes(s)),remove=old.filter(s=>!studentIds.includes(s));
      if(add.length)await assertReadyClasses(db,[c.classId]);
      const statements=membershipStatements(db,id,[{classId:c.classId,version:c.version,add,remove}],now);
      if(statements.length)await atomic(db,statements);return {saved:true,members:studentIds.length};
    }
    if(c.action==='classState'){
      await ownedClass(c.classId);
      const r=await query('UPDATE reading_classes SET archived_at=?,deleted_at=?,version=version+1 WHERE id=? AND teacher_id=? AND version=? AND deleted_at IS NULL',c.state==='restore'?null:now,c.state==='delete'?now:null,c.classId,id,c.version).run();
      if(!r.meta.changes)throw new ApiError(409,'A turma mudou. Atualize a página e tente novamente.');return {saved:true};
    }
    if(c.action==='previewAssignment'||c.action==='distribute'){
      const plan=await planDistribution(c);
      if(c.action==='previewAssignment')return {bookTitle:plan.bookTitle,classes:plan.classes,versions:plan.versions,readings:plan.readings,recipients:new Set(plan.recipients.map(r=>r.studentId)).size,newReadings:plan.newReadings,existingReadings:plan.existingReadings,recipientKeys:plan.recipientKeys};
      if(c.mode==='class'&&!plan.classes.every(g=>c.versions[g.id]===plan.versions[g.id]))throw new ApiError(409,'A composição de uma turma mudou. Revise o resumo antes de confirmar.');
      const statements:D1PreparedStatement[]=[],readingIndexes:number[]=[];
      for(const group of plan.classes){
       statements.push(query('UPDATE reading_classes SET version=CASE WHEN version=? AND archived_at IS NULL AND deleted_at IS NULL THEN version+1 ELSE NULL END WHERE id=? AND teacher_id=?',c.versions[group.id],group.id,id));
       statements.push(query('INSERT INTO reading_class_books(id,class_id,book_id,assigned_at,deadline,deadline_initialized) VALUES(?,?,?,?,?,1) ON CONFLICT(class_id,book_id) DO NOTHING',crypto.randomUUID(),group.id,c.bookId,now,c.deadline));
       readingIndexes.push(statements.length);statements.push(syncClassReadings(db,id,group.id,now));
      }
      if(c.mode==='individual')for(const r of plan.recipients){readingIndexes.push(statements.length);statements.push(query('INSERT INTO reading_assignments(id,teacher_id,student_id,book_id,assigned_at,deadline,progress,version) VALUES(?,?,?,?,?,?,0,0) ON CONFLICT(book_id,student_id,origin_key) DO NOTHING',crypto.randomUUID(),id,r.studentId,c.bookId,now,c.deadline));}
      const rows=await atomic(db,statements);return {assigned:readingIndexes.reduce((sum,index)=>sum+(rows[index].meta.changes||0),0),existing:plan.existingReadings};
    }
    if(c.action==='classDeadline'){
      await requireRole('teacher');
      const parent=await query('SELECT cb.deadline,cb.version,cb.deadline_initialized AS ready,cb.class_id AS classId FROM reading_class_books cb JOIN reading_classes cl ON cl.id=cb.class_id WHERE cb.id=? AND cl.teacher_id=?',c.id,id).first<{deadline:string|null;version:number;ready:number;classId:string}>();
      if(!parent)throw new ApiError(404,'Atribuição não encontrada.');
      if(parent.version!==c.version)throw new ApiError(409,'O prazo mudou em outra sessão. Revise o prazo atual antes de salvar.');
      if(parent.ready&&parent.deadline===c.deadline)return {saved:true,unchanged:true};
      const operationId=crypto.randomUUID();
      const statements=[query('UPDATE reading_class_books SET deadline=?,deadline_initialized=1,version=CASE WHEN version=? THEN version+1 ELSE NULL END WHERE id=?',c.deadline,c.version,c.id),query('INSERT INTO reading_deadline_events(id,teacher_id,class_assignment_id,previous_deadline,deadline,created_at,consolidation) VALUES(?,?,?,?,?,?,?)',operationId,id,c.id,parent.deadline,c.deadline,now,parent.ready?0:1)];
      if(!parent.ready){
       statements.push(query('INSERT INTO reading_deadline_events(id,teacher_id,assignment_id,previous_deadline,deadline,created_at,operation_id) SELECT lower(hex(randomblob(16))),teacher_id,id,deadline,?,?,? FROM reading_assignments WHERE class_assignment_id=?',c.deadline,now,operationId,c.id));
       statements.push(syncClassReadings(db,id,parent.classId,now));
      }
      await atomic(db,statements);return {saved:true};
    }
    if(c.action==='deadline'){
      await requireRole('teacher');
      const a=await query('SELECT deadline,class_id AS classId,version FROM reading_assignments WHERE id=? AND teacher_id=?',c.id,id).first<{deadline:string|null;classId:string|null;version:number}>();
      if(!a)throw new ApiError(404,'Leitura não encontrada.');
      if(a.classId)throw new ApiError(409,'Este prazo pertence à turma. Use Alterar prazo da turma.');
      if(c.version!==undefined&&c.version!==a.version)throw new ApiError(409,'A leitura mudou. Revise os dados atuais.');
      if(a.deadline===c.deadline)return {saved:true,unchanged:true};
      await atomic(db,[query('UPDATE reading_assignments SET deadline=?,version=CASE WHEN version=? THEN version+1 ELSE NULL END WHERE id=? AND teacher_id=?',c.deadline,a.version,c.id,id),query('INSERT INTO reading_deadline_events(id,teacher_id,assignment_id,previous_deadline,deadline,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),id,c.id,a.deadline,c.deadline,now)]);return {saved:true};
    }
    if(c.action==='progress'||c.action==='correctProgress'){
      const correction=c.action==='correctProgress';await requireRole(correction?'teacher':'student');
      const owner=correction?'teacher_id':'student_id';
      const a=await query(`SELECT a.*,b.total_pages FROM reading_assignments a JOIN books b ON b.id=a.book_id WHERE a.id=? AND a.${owner}=?`,c.id,id).first<{id:string;progress:number;total_pages:number;version:number;completed_at:string|null}>();
      if(!a)throw new ApiError(404,'Leitura não encontrada.');
      if(a.version!==c.version)throw new ApiError(409,'A leitura foi atualizada em outra sessão. Revise o progresso atual e tente novamente.');
      if(c.progress===a.progress)return {saved:true,unchanged:true,completed:!!a.completed_at};
      if(a.completed_at&&!correction)throw new ApiError(409,'Esta leitura já está concluída. Peça ao professor para corrigir um registro incorreto.');
      if((!correction&&c.progress<a.progress)||c.progress>a.total_pages)throw new ApiError(400,`Informe um valor entre ${correction?0:a.progress} e ${a.total_pages}.`);
      const completed=c.progress===a.total_pages?now:null;
      const result=await db.batch([
        query(`UPDATE reading_assignments SET progress=?,started_at=CASE WHEN ?>0 THEN COALESCE(started_at,?) ELSE started_at END,updated_at=?,completed_at=?,version=version+1 WHERE id=? AND ${owner}=? AND version=?`,c.progress,c.progress,now,now,completed,c.id,id,c.version),
        query(`INSERT INTO reading_events(id,assignment_id,progress,previous_progress,created_at,version,kind,actor_id,reason,completion_deadline,deadline_recorded) SELECT ?,a.id,?,?,?,a.version,?,?,?,${completed?effectiveDeadline:'NULL'},? FROM reading_assignments a ${classAssignmentJoin} WHERE a.id=? AND a.${owner}=? AND changes()=1`,crypto.randomUUID(),c.progress,a.progress,now,correction?'correction':'progress',id,correction?c.reason:'',completed?1:0,c.id,id),
      ]);
      if(!result[0].meta.changes)throw new ApiError(409,'Leitura atualizada em outra sessão. Atualize a página.');
      return {saved:true,completed:!!completed};
    }
    if(c.action==='saveGoal'){
      if(c.endDate<c.startDate)throw new ApiError(400,'O prazo deve ser posterior à data de início.');
      const goalId=crypto.randomUUID();await query('INSERT INTO goals (id,owner_id,title,target_books,start_date,end_date,created_at) VALUES (?,?,?,?,?,?,?)',goalId,id,c.title,c.targetBooks,c.startDate,c.endDate,now).run();return {id:goalId};
    }
    if(c.action==='deleteGoal'){await query('DELETE FROM goals WHERE id=? AND owner_id=?',c.id,id).run();return {deleted:true};}
    throw new ApiError(400,'Ação inválida.');
  }
  return {snapshot,mutate,requireRole,user,ownedClass};
}
