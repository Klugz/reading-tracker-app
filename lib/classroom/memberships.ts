import {ApiError} from './errors';

type Change={classId:string;version:number;add:string[];remove:string[]};

// All entry points use these statements in their own atomic batch. Distribution
// takes the same class version lock, so neither operation can miss the other.
export function membershipStatements(db:D1Database,teacherId:string,changes:Change[],now:string){
 const q=(sql:string,...args:unknown[])=>db.prepare(sql).bind(...args);
 const statements:D1PreparedStatement[]=[];
 for(const change of changes){
  if(!change.add.length&&!change.remove.length)continue;
  statements.push(q(`UPDATE reading_classes SET version=CASE WHEN version=? AND archived_at IS NULL AND deleted_at IS NULL
   AND (?=0 OR NOT EXISTS(SELECT 1 FROM reading_class_books cb WHERE cb.class_id=reading_classes.id AND cb.deadline_initialized=0))
   THEN version+1 ELSE NULL END WHERE id=? AND teacher_id=?`,change.version,change.add.length,change.classId,teacherId));
  for(const studentId of change.remove)statements.push(q('DELETE FROM reading_class_members WHERE class_id=? AND student_id=?',change.classId,studentId));
  for(const studentId of change.add)statements.push(q(`INSERT INTO reading_class_members(id,class_id,student_id,joined_at) VALUES(?,?,?,?) ON CONFLICT(class_id,student_id) DO NOTHING`,crypto.randomUUID(),change.classId,studentId,now));
  if(change.add.length)statements.push(syncClassReadings(db,teacherId,change.classId,now));
  for(const studentId of [...change.add,...change.remove])statements.push(q(`INSERT INTO student_account_events(id,student_id,teacher_id,action,detail,created_at) VALUES(?,?,?,'membershipChanged',?,?)`,crypto.randomUUID(),studentId,teacherId,JSON.stringify({classId:change.classId,change:change.add.includes(studentId)?'joined':'left'}),now));
 }
 return statements;
}

export function syncClassReadings(db:D1Database,teacherId:string,classId:string,now:string){
 return db.prepare(`INSERT INTO reading_assignments(id,teacher_id,student_id,book_id,assigned_at,deadline,progress,version,class_id,origin_key,class_assignment_id)
  SELECT lower(hex(randomblob(16))),c.teacher_id,m.student_id,cb.book_id,?,NULL,0,0,c.id,c.id,cb.id
  FROM reading_classes c JOIN reading_class_members m ON m.class_id=c.id JOIN reading_class_books cb ON cb.class_id=c.id
  WHERE c.id=? AND c.teacher_id=? AND cb.deadline_initialized=1 AND c.archived_at IS NULL AND c.deleted_at IS NULL
  ON CONFLICT(book_id,student_id,origin_key) DO NOTHING`).bind(now,classId,teacherId);
}

// Bounded, idempotent data conversion, separate from schema migrations. A shared
// NULL is authoritative. Divergent old deadlines remain untouched until reviewed.
export async function normalizeClassAssignments(db:D1Database,teacherId:string){
 const q=(sql:string,...args:unknown[])=>db.prepare(sql).bind(...args);
 const pending=await q(`SELECT cb.id,cb.class_id AS classId FROM reading_class_books cb JOIN reading_classes c ON c.id=cb.class_id WHERE c.teacher_id=? AND cb.deadline_initialized=0 LIMIT 200`,teacherId).all<{id:string;classId:string}>();
 if(!pending.results.length)return;
 const now=new Date().toISOString();
 for(const cb of pending.results){
  await db.batch([
   q(`UPDATE reading_assignments SET class_assignment_id=? WHERE teacher_id=? AND class_id=? AND book_id=(SELECT book_id FROM reading_class_books WHERE id=?) AND class_assignment_id IS NULL`,cb.id,teacherId,cb.classId,cb.id),
   q(`UPDATE reading_class_books SET deadline=(SELECT MIN(deadline) FROM reading_assignments WHERE class_assignment_id=?),deadline_initialized=1
    WHERE id=? AND deadline_initialized=0 AND (SELECT COUNT(DISTINCT COALESCE(deadline,'no-deadline')) FROM reading_assignments WHERE class_assignment_id=?)<=1`,cb.id,cb.id,cb.id),
   syncClassReadings(db,teacherId,cb.classId,now),
  ]);
 }
}

export async function assertReadyClasses(db:D1Database,classIds:string[]){
 for(const id of classIds){
  const row=await db.prepare('SELECT id FROM reading_class_books WHERE class_id=? AND deadline_initialized=0 LIMIT 1').bind(id).first();
  if(row)throw new ApiError(409,'Há prazos antigos diferentes nesta turma. Abra o livro da turma e defina o prazo coletivo antes de adicionar alunos.');
 }
}

export async function atomic(db:D1Database,statements:D1PreparedStatement[]){
 try{return await db.batch(statements);}catch(e){
  if(/NOT NULL constraint failed|FOREIGN KEY constraint failed/.test(String(e)))throw new ApiError(409,'Os dados mudaram em outra sessão. Revise os dados atualizados e tente novamente.');
  throw e;
 }
}
