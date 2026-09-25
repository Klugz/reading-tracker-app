'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {defaults,readNavigation,navigationUrl,rememberOrigin,returnContext,type Navigation,type Destination,type Origins} from './navigation-model';
import {focusPage} from './focus';
export {navigationUrl} from './navigation-model';
export type {Navigation,View} from './navigation-model';
export function useNavigation(student:boolean,initialClassId?:string){
 const[state,setState]=useState<Navigation>({...defaults,view:student?'library':'classes',classId:initialClassId||null,filter:student?'open':'all'});
 const ref=useRef(state);ref.current=state;
 useEffect(()=>{
  const read=()=>{const next=readNavigation(window.location.href,student);ref.current=next;setState(next);};
  read();const pop=(e:PopStateEvent)=>{read();requestAnimationFrame(()=>window.scrollTo(0,e.state?.trilhaScroll||0));};
  window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);
 },[student]);
 const go=useCallback((patch:Partial<Navigation>,options:{replace?:boolean;keepScroll?:boolean;origin?:Destination;scroll?:number}={})=>{
  const next={...ref.current,...patch},url=navigationUrl(next,student);
  if(url===window.location.pathname+window.location.search)return;
  const current=window.history.state||{},scroll=options.scroll??(options.keepScroll?window.scrollY:0);
  const origins:Origins=options.origin?rememberOrigin(current.trilhaOrigins||{},options.origin,ref.current,window.scrollY):current.trilhaOrigins||{};
  window.history.replaceState({...current,trilhaScroll:window.scrollY},'',window.location.href);
  const nextHistory={...current,trilhaOrigins:origins,trilhaScroll:scroll};
  if(options.replace)window.history.replaceState(nextHistory,'',url);else window.history.pushState(nextHistory,'',url);
  ref.current=next;setState(next);requestAnimationFrame(()=>{window.scrollTo(0,scroll);if(!options.keepScroll&&!next.reading)focusPage();});
 },[student]);
 const returnTo=useCallback((destination:Destination,fallback:Partial<Navigation>)=>{
  const context=returnContext(window.history.state?.trilhaOrigins||{},destination,{...ref.current,...fallback});
  go(context.state,{replace:destination==='reading',keepScroll:destination==='reading',scroll:context.scroll});
 },[go]);
 const origin=typeof window==='undefined'?undefined:window.history.state?.trilhaOrigins?.student?.state as Navigation|undefined;
 return {state,go,returnTo,studentOrigin:origin};
}
