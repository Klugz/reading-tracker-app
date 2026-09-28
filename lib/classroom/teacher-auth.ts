import {z} from 'zod';
import {ApiError} from './errors';
import {digest,randomToken,verifyPassword} from './passwords';

export const TEACHER_COOKIE='__Host-trilha-professor';
const dummy='scrypt$16384$8$5$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';
export function teacherAuth(db:D1Database){
 const q=(sql:string,...args:unknown[])=>db.prepare(sql).bind(...args);
 async function session(token:string|undefined){
  if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  return q("SELECT s.teacher_id AS teacherId,u.name FROM teacher_sessions s JOIN teacher_accounts a ON a.teacher_id=s.teacher_id JOIN reading_users u ON u.id=a.teacher_id WHERE s.token_hash=? AND s.expires_at>? AND a.active=1 AND s.auth_version=a.auth_version AND u.role='teacher'",digest(token),Date.now()).first<{teacherId:string;name:string}>();
 }
 async function throttle(key:string,max:number){
  const now=Date.now(),expiry=now+10*60*1000;
  const result=await q('INSERT INTO teacher_login_attempts(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING count',digest(key),expiry,now,now,expiry).first<{count:number}>();
  if(!result||result.count>max)throw new ApiError(429,'Muitas tentativas. Aguarde 10 minutos e tente novamente.');
 }
 async function login(input:unknown,clientKey:string){
  const c=z.object({email:z.string().trim().toLowerCase().email().max(254),password:z.string().min(1).max(128)}).parse(input);
  await throttle('client:'+clientKey,50);
  // Count attempts atomically before the password check, including concurrent requests.
  await throttle('teacher:'+c.email,5);
  const a=await q("SELECT a.* FROM teacher_accounts a JOIN reading_users u ON u.id=a.teacher_id WHERE a.email=? AND u.role='teacher'",c.email).first<{teacher_id:string;password_hash:string;active:number;auth_version:number}>();
  const valid=await verifyPassword(c.password,a?.password_hash||dummy);
  if(!a||!valid||!a.active)throw new ApiError(401,'E-mail ou senha inválidos.');
  const token=randomToken(),now=Date.now(),maxAge=8*60*60;
  const results=await db.batch([
   q('DELETE FROM teacher_sessions WHERE expires_at<=?',now),
   q('DELETE FROM teacher_login_attempts WHERE expires_at<=? OR key=?',now,digest('teacher:'+c.email)),
   q('INSERT INTO teacher_sessions(token_hash,teacher_id,auth_version,expires_at,created_at) SELECT ?,teacher_id,auth_version,?,? FROM teacher_accounts WHERE teacher_id=? AND auth_version=? AND active=1',digest(token),now+maxAge*1000,new Date(now).toISOString(),a.teacher_id,a.auth_version),
  ]);
  if(!results[2].meta.changes)throw new ApiError(401,'O acesso foi alterado. Entre novamente.');
  return {token,maxAge};
 }
 async function logout(token:string|undefined){if(token)await q('DELETE FROM teacher_sessions WHERE token_hash=?',digest(token)).run();}
 return {session,login,logout};
}
