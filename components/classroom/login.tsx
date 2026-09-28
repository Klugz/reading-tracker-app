'use client';
import {useState} from 'react';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {Form,Field} from './forms';
import {Brand} from './common';
import {fetchJson,RequestError} from './client';
async function authRequest(action:string,body:Record<string,unknown>={}){return await fetchJson(`/api/student-auth/${action}`,body) as {redirect:string};}
export async function studentLogout(){await authRequest('logout');window.location.assign('/entrar');}
export function StudentLogin(){return <Login/>;}
function Login(){
 const [role,setRole]=useState('student');
 return <main className="entry-page"><div className="entry-card student-login"><Brand/>
  <Tabs value={role} onValueChange={setRole} className="login-tabs">
   <TabsList aria-label="Tipo de acesso" className="login-tab-list">
    <TabsTrigger value="student">Aluno</TabsTrigger>
    <TabsTrigger value="teacher">Professor</TabsTrigger>
   </TabsList>
   <div className="login-panels">
    <TabsContent value="student" forceMount className="login-panel" aria-hidden={role!=='student'} inert={role!=='student'}>
     <p className="eyebrow">ACESSO DO ALUNO</p><h1>Vamos continuar<br/>sua leitura?</h1><p className="login-description">Entre com a matrícula e a senha informadas pelo professor.</p>
     <Form label="Entrar" busyLabel="Entrando…" submit={async f=>{const result=await authRequest('login',{enrollment:f.get('enrollment'),password:f.get('password')});window.location.assign(result.redirect);}}>
      <Field label="Matrícula" id="enrollment"><Input id="enrollment" name="enrollment" inputMode="numeric" pattern="[0-9]{1,32}" maxLength={32} autoComplete="username" placeholder="Ex.: 202600154" required/></Field>
      <Field label="Senha" id="password"><Input id="password" name="password" type="password" autoComplete="current-password" maxLength={128} required/></Field>
     </Form><p className="muted login-help">Esqueceu sua senha? Peça ao professor para redefini-la.</p>
    </TabsContent>
    <TabsContent value="teacher" forceMount className="login-panel" aria-hidden={role!=='teacher'} inert={role!=='teacher'}>
     <p className="eyebrow">ACESSO DO PROFESSOR</p><h1>Bem-vindo de volta</h1><p className="login-description">Entre com seu e-mail e senha.</p>
     <Form label="Entrar" busyLabel="Entrando…" submit={async f=>{const result=await fetchJson('/api/teacher-auth/login',{email:f.get('email'),password:f.get('password')}) as {redirect:string};window.location.assign(result.redirect);}}>
      <Field label="E-mail" id="teacher-email" name="email"><Input id="teacher-email" name="email" type="email" autoComplete="username" maxLength={254} required/></Field>
      <Field label="Senha" id="teacher-password" name="password"><Input id="teacher-password" name="password" type="password" autoComplete="current-password" maxLength={128} required/></Field>
     </Form><p className="login-help" aria-hidden="true"/>
    </TabsContent>
   </div>
  </Tabs>
 </div></main>;
}
export function FirstPassword({name,enrollment}:{name:string;enrollment:string}){return <main className="entry-page"><div className="entry-card student-login"><Brand/><h1>Crie sua nova senha</h1><p>{name} · Matrícula {enrollment}</p><p>Antes de acessar as leituras, substitua a senha inicial. Use pelo menos 8 caracteres.</p><Form label="Salvar senha e continuar" submit={async f=>{const password=String(f.get('password')),confirmation=String(f.get('confirmation'));if(password!==confirmation)throw new RequestError('Confira a confirmação da senha.',400,{confirmation:'As senhas devem ser iguais.'});const result=await authRequest('password',{password,confirmation});window.location.assign(result.redirect);}}><Field label="Nova senha" id="new-password"><Input id="new-password" name="password" type="password" minLength={8} maxLength={128} autoComplete="new-password" required/></Field><Field label="Confirmar nova senha" id="confirm-password" name="confirmation"><Input id="confirm-password" name="confirmation" type="password" minLength={8} maxLength={128} autoComplete="new-password" required/></Field></Form><Button variant="ghost" onClick={()=>void studentLogout()}>Sair desta conta</Button></div></main>;}

export async function teacherLogout(){await fetchJson('/api/teacher-auth/logout',{});window.location.assign('/entrar/professor');}
export function TeacherLogin(){return <Login/>;}
