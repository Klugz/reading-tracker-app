export type Role = 'teacher' | 'student';
export type Reader = {id:string;name:string;role:Role;inviteCode:string|null;enrollment:string|null;mustChangePassword:number|null;active:number|null};
export type Book = {id:string;title:string;author:string;totalPages:number;unit:'pages'|'chapters'|'percent';coverUrl:string|null;personalPage?:number;personalStatus?:string;personalCompletedAt?:string|null;updatedAt?:string|null};
export type Assignment = Book & {id:string;bookId:string;studentId:string;teacherId:string;studentName:string;studentEnrollment:string|null;teacherName:string;assignedAt:string;classId:string|null;classAssignmentId:string|null;classAssignmentVersion:number|null;className:string|null;classArchivedAt:string|null;classDeletedAt:string|null;originKey:string;deadline:string|null;progress:number;startedAt:string|null;updatedAt:string|null;completedAt:string|null;version:number;asOfDate?:string};
export type ReadingEvent = {id:string;assignmentId:string;progress:number;previousProgress:number;createdAt:string;version:number;title:string;studentName:string;studentEnrollment:string|null;totalPages:number;unit:Book['unit'];kind:'progress'|'correction';actorName:string|null;reason:string;completionDeadline:string|null;deadlineRecorded:number};
export type DeadlineEvent={id:string;teacherId:string;classAssignmentId:string|null;assignmentId:string|null;operationId:string|null;consolidation:number;previousDeadline:string|null;deadline:string|null;createdAt:string};
export type Goal = {id:string;title:string;targetBooks:number;startDate:string;endDate:string};
export type ReadingClass = {id:string;name:string;description:string;archivedAt:string|null;createdAt:string;version:number};
export type ClassMember = {classId:string;studentId:string};
export type ClassBook = {id:string;classId:string;bookId:string;assignedAt:string;deadline:string|null;deadlineInitialized:number;version:number};
export type AssignmentDraft = {bookId:string;mode:'class'|'individual';classIds:string[];studentIds:string[];deadline:string|null};
export type AssignmentPreview = {bookTitle:string;recipients:number;readings:number;newReadings:number;existingReadings:number;classes:{id:string;name:string;students:number}[];versions:Record<string,number>;recipientKeys:string[]};
export type Student={id:string;name:string;enrollment:string|null;email:string|null;active:number|null;mustChangePassword:number|null;version:number|null;managedBy:string|null};
export type Classroom = {user:Reader|null;today:string;books:Book[];students:Student[];teachers:{id:string;name:string}[];assignments:Assignment[];events:ReadingEvent[];deadlineEvents:DeadlineEvent[];goals:Goal[];classes:ReadingClass[];classMembers:ClassMember[];classBooks:ClassBook[]};
export const unitLabels = {pages:'páginas',chapters:'capítulos',percent:'%'};
export const percentage = (a:Pick<Assignment,'progress'|'totalPages'>) => a.totalPages>0?Math.min(100,Math.floor(a.progress/a.totalPages*100)):0;
export const schoolToday=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
export function readingStatus(a:Pick<Assignment,'completedAt'|'deadline'|'startedAt'>&{asOfDate?:string}, today = a.asOfDate||schoolToday()) {
  if(a.completedAt) return 'completed';
  if(a.deadline && a.deadline < today) return 'late';
  return a.startedAt ? 'reading' : 'pending';
}
export const statusLabels = {completed:'Concluída',late:'Atrasada',reading:'Em andamento',pending:'Não iniciada'};
export function metrics(items:Assignment[]) {
  return {total:items.length,completed:items.filter(a=>readingStatus(a)==='completed').length,reading:items.filter(a=>readingStatus(a)==='reading').length,late:items.filter(a=>readingStatus(a)==='late').length,pending:items.filter(a=>readingStatus(a)==='pending').length,average:items.length?Math.round(items.reduce((s,a)=>s+percentage(a),0)/items.length):0};
}
export function classReadings(data:Classroom,classId:string,includePast=false){const members=new Set(data.classMembers.filter(m=>m.classId===classId).map(m=>m.studentId));return data.assignments.filter(a=>a.classId===classId&&(includePast||members.has(a.studentId)));}
export function prioritizeReadings(items:Assignment[]){return [...items].sort((a,b)=>Number(readingStatus(b)==='late')-Number(readingStatus(a)==='late')||(a.deadline||'9999').localeCompare(b.deadline||'9999')||Number(!!b.startedAt)-Number(!!a.startedAt)||b.assignedAt.localeCompare(a.assignedAt));}
