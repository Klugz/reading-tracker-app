import type {Assignment,DeadlineEvent} from './types';
export type DeadlineHistoryEntry=DeadlineEvent&{scope:'individual'|'collective'|'consolidation'};

/** A display projection only: the original audit rows are never removed or rewritten. */
export function readingDeadlineHistory(events:DeadlineEvent[],reading:Pick<Assignment,'id'|'classAssignmentId'|'teacherId'>):DeadlineHistoryEntry[]{
 const collective=events.filter(e=>!e.assignmentId&&e.classAssignmentId&&e.classAssignmentId===reading.classAssignmentId&&e.teacherId===reading.teacherId);
 const individual=events.filter(e=>e.assignmentId===reading.id&&e.teacherId===reading.teacherId);
 const compatible=(child:DeadlineEvent,parent:DeadlineEvent)=>!child.operationId&&child.createdAt===parent.createdAt&&child.deadline===parent.deadline&&child.teacherId===parent.teacherId;
 const covered=new Set<string>();
 for(const child of individual){
  if(child.operationId){if(collective.some(p=>p.id===child.operationId))covered.add(child.operationId);continue;}
  // Old rows lack an explicit operation link. Infer only a one-to-one match inside
  // this reading's class assignment, teacher, instant and target deadline.
  const candidates=collective.filter(parent=>compatible(child,parent));
  if(candidates.length===1&&individual.filter(other=>compatible(other,candidates[0])).length===1)covered.add(candidates[0].id);
 }
 return events.flatMap<DeadlineHistoryEntry>(e=>{
  if(individual.some(i=>i.id===e.id))return [{...e,scope:'individual' as const}];
  if(!collective.some(c=>c.id===e.id)||covered.has(e.id))return [];
  // An ambiguous legacy summary is labelled as a collective definition, never
  // presented as if its previous deadline applied to every student.
  const consolidation=!!e.consolidation||individual.some(child=>compatible(child,e));
  return [{...e,scope:consolidation?'consolidation' as const:'collective' as const}];
 });
}
