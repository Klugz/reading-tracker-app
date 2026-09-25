'use client';
import {useEffect,useRef,type ComponentProps} from 'react';
import {AlertDialogContent} from '@/components/ui/alert-dialog';

type FocusOrigin={element:HTMLElement|null;key:string|null;id:string|null;context:string|null};
function pageContext(){const u=new URL(window.location.href);u.searchParams.delete('reading');return u.pathname+u.search;}
let interaction:{element:HTMLElement;at:number}|null=null;
export function useInteractionOrigin(){
 useEffect(()=>{
  const remember=(event:Event)=>{
   if(event instanceof KeyboardEvent&&event.key!=='Enter'&&event.key!==' ')return;
   const target=event.target instanceof Element?event.target.closest<HTMLElement>('button,a,[role="button"],[role="menuitem"]'):null;
   if(target)interaction={element:target,at:Date.now()};
  };
  document.addEventListener('pointerdown',remember,true);document.addEventListener('keydown',remember,true);
  return()=>{document.removeEventListener('pointerdown',remember,true);document.removeEventListener('keydown',remember,true);interaction=null;};
 },[]);
}
function captureOrigin():FocusOrigin{
 let element=typeof document==='undefined'?null:document.activeElement as HTMLElement|null;
 // Touch browsers may activate a button without making it document.activeElement.
 if(interaction?.element.isConnected&&Date.now()-interaction.at<1000)element=interaction.element;
 const menu=element?.closest('[role="menu"]');
 if(menu?.id)element=Array.from(document.querySelectorAll<HTMLElement>('[aria-controls]')).find(e=>e.getAttribute('aria-controls')===menu.id)||element;
 return {element,key:element?.getAttribute('data-focus-key')||null,id:element?.id||null,context:typeof window==='undefined'?null:pageContext()};
}
function usable(element:HTMLElement|null):element is HTMLElement{
 return !!element?.isConnected&&element.getClientRects().length>0&&!element.closest('[hidden],[inert],[aria-hidden="true"],[data-state="closed"]')&&!element.matches(':disabled');
}
export function focusPage(){
 const target=document.querySelector<HTMLElement>('#main-content h1')||document.querySelector<HTMLElement>('#main-content');
 if(usable(target)){target.tabIndex=-1;target.focus({preventScroll:true});}
}
export function focusOverlayStart(event:Event){
 event.preventDefault();
 const root=event.target as HTMLElement;
 const target=root.querySelector<HTMLElement>('[data-slot="alert-dialog-cancel"]')||Array.from(root.querySelectorAll<HTMLElement>('input:not([type="hidden"]),textarea,[role="combobox"]')).find(usable)||root.querySelector<HTMLElement>('button,[data-slot="dialog-title"]');
 if(target){if(!target.matches('button,input,textarea,[role="combobox"]'))target.tabIndex=-1;target.focus({preventScroll:true});}
}
function restoreOrigin(origin:FocusOrigin){
 const dialogs=Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"]')).filter(usable);
 const dialog=dialogs.at(-1),root=dialog||document;
 if(!dialog&&origin.context!==pageContext()){focusPage();return;}
 const replacement=origin.key?Array.from(root.querySelectorAll<HTMLElement>('[data-focus-key]')).find(e=>e.getAttribute('data-focus-key')===origin.key&&usable(e)):origin.id?document.getElementById(origin.id):null;
 const target=usable(origin.element)&&(!dialog||dialog.contains(origin.element))?origin.element:usable(replacement||null)&&(!dialog||dialog.contains(replacement!))?replacement:null;
 if(target){target.focus({preventScroll:true});return;}
 // A replacement form or nested dialog owns its own initial focus.
 if(dialog){
  if(dialog.contains(document.activeElement))return;
  const next=dialog.querySelector<HTMLElement>('input:not(:disabled),button:not(:disabled),[tabindex="0"]');
  if(usable(next)){next.focus({preventScroll:true});return;}
  dialog.focus({preventScroll:true});return;
 }
 const activeTab=Array.from(document.querySelectorAll<HTMLElement>('#main-content [role="tab"][data-state="active"]')).find(usable);
 if(activeTab)activeTab.focus({preventScroll:true});else focusPage();
}
/** Capture before Radix moves focus; restore after its portal has been removed. */
export function useReturnFocus(open=true){
 const previous=useRef(false),origin=useRef<FocusOrigin>({element:null,key:null,id:null,context:null});
 if(open&&!previous.current)origin.current=captureOrigin();
 previous.current=open;
 return (event:Event)=>{event.preventDefault();const saved=origin.current;requestAnimationFrame(()=>requestAnimationFrame(()=>restoreOrigin(saved)));};
}
export function RestoringAlertContent({open=true,...props}:ComponentProps<typeof AlertDialogContent>&{open?:boolean}){
 const restore=useReturnFocus(open);
 return <AlertDialogContent {...props} className={`reader-alert ${props.className||''}`} onOpenAutoFocus={focusOverlayStart} onCloseAutoFocus={restore}/>;
}
