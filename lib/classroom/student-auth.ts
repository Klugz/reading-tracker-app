import {z} from 'zod';
import {ApiError} from './errors';
import {digest,hashPassword,randomToken,verifyPassword} from './passwords';
import {enrollment} from './accounts';
export const SESSION_COOKIE='__Host-trilha-aluno';
export type StudentSession={studentId:string;name:string;mustChangePassword:number;authVersion:number;tokenHash:string;expiresAt:number};
export function studentAuth(db:D1Database){
 const q=(sql:string,...args:unknown[])=>db.prepare(sql).bind(...args);
 async function session(token:string|undefined):Promise<StudentSession|null>{if(!token||!/^[a-f0-9]{64}$/.test(token))return null;return q('SELECT s.student_id AS studentId,u.name,m.must_change_password AS mustChangePassword,m.auth_version AS authVersion,s.token_hash AS tokenHash,s.expires_at AS expiresAt FROM student_sessions s JOIN managed_students m ON m.student_id=s.student_id JOIN reading_users u ON u.id=s.student_id WHERE s.token_hash=? AND s.expires_at>? AND m.active=1 AND s.auth_version=m.auth_version',digest(token),Date.now()).first<StudentSession>();}
 async function throttle(key:string,max:number){const now=Date.now(),expiry=now+10*60*1000;const result=await q('INSERT INTO student_login_attempts(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING count',digest(key),expiry,now,now,expiry).first<{count:number}>();if(!result||result.count>max)throw new ApiError(429,'Muitas tentativas. Aguarde 10 minutos e tente novamente.');}
 async function login(input:unknown,clientKey:string){const c=z.object({enrollment,password:z.string().min(1).max(128)}).parse(input);await throttle('client:'+clientKey,500);
  const failures=await q('SELECT count FROM student_login_attempts WHERE key=? AND expires_at>?',digest('student:'+c.enrollment),Date.now()).first<{count:number}>();if(failures&&failures.count>=5)throw new ApiError(429,'Muitas tentativas. Aguarde 10 minutos e tente novamente.');
  const a=await q('SELECT m.*,u.name FROM managed_students m JOIN reading_users u ON u.id=m.student_id WHERE m.student_id=?',c.enrollment).first<{student_id:string;password_hash:string;active:number;must_change_password:number;auth_version:number}>();
  // Run the same KDF for unknown accounts to reduce account enumeration by timing.
  const dummy='scrypt$16384$8$5$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';
  const valid=await verifyPassword(c.password,a?.password_hash||dummy);if(!a||!valid||!a.active){await throttle('student:'+c.enrollment,5);throw new ApiError(401,'Matrícula ou senha inválida. Se precisar, procure seu professor.');}
  await q('DELETE FROM student_login_attempts WHERE key=?',digest('student:'+c.enrollment)).run();
  const token=randomToken(),expiresAt=Date.now()+(a.must_change_password?15*60*1000:8*60*60*1000);
  const result=await db.batch([q('DELETE FROM student_sessions WHERE expires_at<=?',Date.now()),q('DELETE FROM student_login_attempts WHERE expires_at<=?',Date.now()),q('INSERT INTO student_sessions(token_hash,student_id,auth_version,expires_at,created_at) SELECT ?,student_id,auth_version,?,? FROM managed_students WHERE student_id=? AND auth_version=? AND active=1',digest(token),expiresAt,new Date().toISOString(),a.student_id,a.auth_version)]);
  if(!result[2].meta.changes)throw new ApiError(401,'O acesso foi alterado. Entre novamente.');return {token,mustChangePassword:!!a.must_change_password,maxAge:Math.floor((expiresAt-Date.now())/1000)};
 }
 async function changePassword(token:string|undefined,input:unknown){const s=await session(token);if(!s)throw new ApiError(401,'Sua sessão expirou. Entre novamente.');if(!s.mustChangePassword)throw new ApiError(409,'A senha inicial já foi alterada.');
  const c=z.object({password:z.string().min(8,'Use pelo menos 8 caracteres.').max(128),confirmation:z.string()}).refine(v=>v.password===v.confirmation,{message:'As senhas devem ser iguais.',path:['confirmation']}).refine(v=>v.password!=='EDU123','Escolha uma senha pessoal.').parse(input);
  const hash=await hashPassword(c.password),next=randomToken(),now=Date.now();
  const r=await db.batch([q('UPDATE managed_students SET password_hash=?,must_change_password=0,auth_version=auth_version+1,version=version+1 WHERE student_id=? AND auth_version=? AND active=1 AND must_change_password=1',hash,s.studentId,s.authVersion),q('INSERT INTO student_sessions(token_hash,student_id,auth_version,expires_at,created_at) SELECT ?,student_id,auth_version,?,? FROM managed_students WHERE student_id=? AND changes()=1',digest(next),now+8*60*60*1000,new Date(now).toISOString(),s.studentId),q('DELETE FROM student_sessions WHERE student_id=? AND auth_version!= (SELECT auth_version FROM managed_students WHERE student_id=?)',s.studentId,s.studentId)]);
  if(!r[0].meta.changes)throw new ApiError(409,'Sua conta foi alterada. Entre novamente.');return {token:next,maxAge:8*60*60};
 }
 async function logout(token:string|undefined){if(token)await q('DELETE FROM student_sessions WHERE token_hash=?',digest(token)).run();}
 return {session,login,changePassword,logout};
}
