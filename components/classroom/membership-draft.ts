import type {Classroom} from '@/lib/classroom/types';

/** Reapply only the teacher's unsaved intent to the authoritative membership. */
export function reconcileMembers(original:string[],selected:string[],data:Classroom,classId:string){
 const group=data.classes.find(c=>c.id===classId);
 if(!group)throw new Error('Esta turma não está mais disponível. Feche o formulário para atualizar.');
 const current=data.classMembers.filter(m=>m.classId===classId).map(m=>m.studentId);
 const added=selected.filter(id=>!original.includes(id)&&data.students.some(s=>s.id===id));
 const removed=new Set(original.filter(id=>!selected.includes(id)));
 return {original:current,selected:[...new Set([...current.filter(id=>!removed.has(id)),...added])],version:group.version};
}
