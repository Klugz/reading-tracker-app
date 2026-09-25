export type View='classes'|'library'|'students'|'reports'|'goals';
export type Navigation={view:View;classId:string|null;book:string|null;student:string|null;reading:string|null;query:string;filter:string;tab:string;scope:string};
export type Destination='class'|'book'|'student'|'reading'|'personal';
export type NavigationContext={state:Navigation;scroll:number};
export type Origins=Partial<Record<Destination,NavigationContext>>;
export const defaults:Navigation={view:'classes',classId:null,book:null,student:null,reading:null,query:'',filter:'all',tab:'books',scope:'current'};
export function readNavigation(url:string,student:boolean):Navigation{
 const u=new URL(url),p=u.searchParams,legacy=p.get('view');
 const view=student?(legacy==='goals'?'goals':'library'):['classes','library','students','reports','goals'].includes(legacy||'')?legacy as View:'classes';
 return {...defaults,view,classId:student?null:u.pathname.match(/^\/professor\/turmas\/([^/]+)$/)?.[1]||null,book:p.get('book'),student:p.get('student'),reading:p.get('reading'),query:p.get('q')||'',filter:p.get('status')||(student?'open':'all'),tab:p.get('tab')||'books',scope:p.get('scope')||'current'};
}
export function navigationUrl(n:Navigation,student=false){
 const p=new URLSearchParams();if((!student&&n.view!=='classes')||(student&&n.view==='goals'))p.set('view',n.view);
 for(const [key,value] of Object.entries({book:n.book,student:n.student,reading:n.reading,q:n.query,status:n.filter!==(student?'open':'all')?n.filter:null,tab:n.tab!=='books'?n.tab:null,scope:n.scope!=='current'?n.scope:null}))if(value)p.set(key,value);
 const path=student?'/aluno':n.classId?`/professor/turmas/${encodeURIComponent(n.classId)}`:'/professor';return path+(p.size?'?'+p.toString():'');
}
export function rememberOrigin(origins:Origins,destination:Destination,state:Navigation,scroll:number):Origins{
 // "Ver aluno" originates in the list below the reading sheet, never in the sheet itself.
 const origin=destination==='student'&&state.reading?origins.reading:{state,scroll};
 return {...origins,[destination]:{state:{...(origin?.state||state),reading:null},scroll:origin?.scroll??scroll}};
}
export function returnContext(origins:Origins,destination:Destination,fallback:Navigation):NavigationContext{
 const origin=origins[destination];
 return origin?{state:{...origin.state,reading:null},scroll:origin.scroll}:{state:{...fallback,reading:null},scroll:0};
}
