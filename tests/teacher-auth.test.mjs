import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const dir='.sites-runtime/teacher-auth-tests';
await mkdir(dir,{recursive:true});
for(const name of ['errors','passwords','teacher-auth']){
 const code=await readFile(`lib/classroom/${name}.ts`,'utf8');
 await writeFile(`${dir}/${name}.mjs`,ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/from '([.]\/[a-z-]+)'/g,"from '$1.mjs'"));
}
const {teacherAuth}=await import('../'+dir+'/teacher-auth.mjs');
const {digest}=await import('../'+dir+'/passwords.mjs');
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(await readFile('drizzle/'+file,'utf8'));
const db={prepare(query){return {args:[],bind(...args){this.args=args;return this;},async first(){return sql.prepare(query).get(...this.args)||null;},async run(){const r=sql.prepare(query).run(...this.args);return {meta:{changes:Number(r.changes)}};},query};},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const auth=teacherAuth(db),email='henriqueklug@gmail.com',teacherId='teacher-henrique-klug';
const rejected=(fn,status)=>assert.rejects(fn,e=>e.status===status);
const reset=()=>sql.exec('DELETE FROM teacher_login_attempts');
await test('seeded teacher authenticates with normalized email and hashed credentials',async()=>{
 const stored=sql.prepare('SELECT password_hash FROM teacher_accounts').get().password_hash;
 assert.ok(stored.startsWith('scrypt$'));assert.notEqual(stored,'admin');
 const login=await auth.login({email:' HENRIQUEKLUG@GMAIL.COM ',password:'admin'},'one');
 assert.equal(login.maxAge,28800);assert.equal((await auth.session(login.token)).teacherId,teacherId);
 assert.equal(sql.prepare('SELECT token_hash FROM teacher_sessions').get().token_hash,digest(login.token));
 assert.notEqual(sql.prepare('SELECT token_hash FROM teacher_sessions').get().token_hash,login.token);
});
await test('wrong password, missing account and disabled account are rejected alike',async()=>{
 reset();await rejected(()=>auth.login({email,password:'wrong'},'two'),401);
 await rejected(()=>auth.login({email:'missing@example.test',password:'admin'},'two'),401);
 sql.exec('UPDATE teacher_accounts SET active=0');await rejected(()=>auth.login({email,password:'admin'},'two'),401);sql.exec('UPDATE teacher_accounts SET active=1');
});
await test('teacher session rejects tampering, expiry, logout and auth version changes',async()=>{
 reset();assert.equal(await auth.session('bad-token'),null);assert.equal(await auth.session('0'.repeat(64)),null);
 let login=await auth.login({email,password:'admin'},'three');await auth.logout(login.token);assert.equal(await auth.session(login.token),null);
 login=await auth.login({email,password:'admin'},'three');sql.prepare('UPDATE teacher_sessions SET expires_at=0 WHERE token_hash=?').run(digest(login.token));assert.equal(await auth.session(login.token),null);
 login=await auth.login({email,password:'admin'},'three');sql.exec('UPDATE teacher_accounts SET auth_version=auth_version+1');assert.equal(await auth.session(login.token),null);
 login=await auth.login({email,password:'admin'},'three');sql.exec('UPDATE teacher_accounts SET active=0');assert.equal(await auth.session(login.token),null);sql.exec('UPDATE teacher_accounts SET active=1');
});
await test('teacher account cannot authenticate with student role',async()=>{
 reset();const login=await auth.login({email,password:'admin'},'role');
 sql.prepare("UPDATE reading_users SET role='student' WHERE id=?").run(teacherId);
 assert.equal(await auth.session(login.token),null);await rejected(()=>auth.login({email,password:'admin'},'role'),401);
 sql.prepare("UPDATE reading_users SET role='teacher' WHERE id=?").run(teacherId);
});
await test('five failures lock the account until the window expires',async()=>{
 reset();for(let i=0;i<5;i++)await rejected(()=>auth.login({email,password:'bad'},'four'),401);
 await rejected(()=>auth.login({email,password:'admin'},'four'),429);
 sql.exec('UPDATE teacher_login_attempts SET expires_at=0');assert.ok((await auth.login({email,password:'admin'},'four')).token);
});
await test('client throttling also covers requests to different accounts',async()=>{
 reset();sql.prepare('INSERT INTO teacher_login_attempts VALUES(?,?,?)').run(digest('client:busy'),50,Date.now()+60000);
 await rejected(()=>auth.login({email,password:'admin'},'busy'),429);
 assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);
});
