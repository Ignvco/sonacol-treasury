import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const db=new PGlite();
const writer='10000000-0000-0000-0000-000000000001',reader='10000000-0000-0000-0000-000000000002';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const row=(origin:string,index:number,extra:Record<string,unknown>={})=>({sheet:'BASE',row:index,status:'VALID',entityType:({BANCO:'cash_flow',CLIENTES:'invoice',COLOCACIONES:'investment',MANUAL:'projection'})[origin],raw:{R:100},normalized:{sourceId:origin+':'+index,sourceProfile:'BASE-ONLY-v7-test',sourceOrigin:origin,company:'TEST',ledgerCode:'LEDGER',bank:'Test bank',voucher:String(index),document:String(index),customer:'Test customer',description:'Test '+index,amount:100,currency:'CLP',type:'income',date:'2026-09-12',cutoffDate:'2026-09-12',dueDate:'2026-09-20',category:'other_income',status:origin==='MANUAL'?'proyectado':'confirmado',...extra}});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const query=async(sql:string,args:unknown[]=[]) => (await db.query<{s:any}>(sql,args)).rows[0]?.s;
const compare=(rows:unknown[])=>query('select compare_daily_base($1::jsonb) s',[JSON.stringify(rows)]);
const snapshot=(id:string|null=null)=>query('select get_daily_base_snapshot($1::uuid) s',[id]);
const apply=async(name:string,rows:unknown[],selected:number[]=[])=>{const p=await compare(rows);return query('select import_daily_base($1,$2,$3::jsonb,$4,$5::int[]) s',[name,hash(name),JSON.stringify(rows),p.revision,selected]);};
before(async()=>{
 const tests=await readFile('tests/database.test.ts','utf8');
 const setup=tests.slice(tests.indexOf('before(async()=>{')+'before(async()=>{'.length,tests.indexOf('\nafter(')).trim().replace(/\}\);$/,'');
 await new Function('db','writer','reader','readFile','return (async()=>{'+setup+'})();')(db,writer,reader,readFile);
 // Upgrade an actual v6 batch, with an edited MANUAL row, rather than an empty DB.
 const legacy=[row('BANCO',9),row('MANUAL',10)];
 const p=await query('select compare_base_import($1::jsonb) s',[JSON.stringify(legacy)]);
 await query('select import_base_changes($1,$2,$3::jsonb,$4,$5::int[]) s',['legacy.xlsx',hash('legacy'),JSON.stringify(legacy),p.revision,[]]);
 await db.exec("update projections set amount=150 where description='Test 10'; reset role;");
 await db.exec("create role service_role");
 await db.exec(await readFile('supabase/migrations/20260917000000000_daily_base_v7.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260917010000000_sap_daily_receiver.sql','utf8'));
 await db.exec(`set role authenticated; set request.jwt.claim.sub='${writer}';`);
});
after(()=>db.close());
test('daily BASE: upgrade preserves previous BASE and platform MANUAL edits',async()=>{
 const s=await snapshot();assert.equal(s.rows.length,1);assert.equal(s.manual[0].normalized.amount,150);assert.equal(s.manual[0].edited,true);
});
let first:string,second:string,manualId:string;
test('daily BASE: distinct second day replaces ERP, preserves MANUAL and freezes history',async()=>{
 const a=[row('BANCO',11,{amount:1200}),row('CLIENTES',12),row('COLOCACIONES',13),row('MANUAL',14)];
 first=(await apply('day-a.xlsx',a)).id;
 const old=await snapshot();const manual=old.manual.find(r=>r.normalized.description==='Test 14');manualId=manual.id;
 await query('select save_daily_manual($1,$2,$3,$4::jsonb) s',[first,manualId,manual.revision,JSON.stringify({...manual.normalized,amount:240,description:'Edited platform'})]);
 const b=[row('BANCO',11,{amount:1500,cutoffDate:'2026-09-13'}),row('CLIENTES',12,{amount:400,dueDate:'2026-09-28',cutoffDate:'2026-09-13'}),row('MANUAL',14,{cutoffDate:'2026-09-13'})];
 second=(await apply('day-b.xlsx',b)).id;
 const current=await snapshot();assert.equal(current.batch.id,second);assert.equal(current.rows.length,2);
 assert.equal(current.rows.find(r=>r.kind==='cash_flow').normalized.amount,1500);
 assert.equal(current.rows.find(r=>r.kind==='invoice').normalized.dueDate,'2026-09-28');
 assert.equal(current.manual.find(r=>r.id===manualId).normalized.amount,240);
 const past=await snapshot(first);assert.equal(past.rows.find(r=>r.kind==='cash_flow').normalized.amount,1200);assert.equal(past.rows.length,3);
 assert.equal((await apply('day-b.xlsx',b)).id,second);
});
test('daily BASE: editing a historical day cannot change the current MANUAL workspace',async()=>{
 const past=await snapshot(first),m=past.manual.find(r=>r.id===manualId);
 await query('select save_daily_manual($1,$2,$3,$4::jsonb) s',[first,m.id,m.revision,JSON.stringify({...m.normalized,amount:999})]);
 assert.equal((await snapshot(first)).manual.find(r=>r.id===manualId).normalized.amount,999);
 assert.equal((await snapshot()).manual.find(r=>r.id===manualId).normalized.amount,240);
});
test('daily BASE: uploading an older file does not move the active day backwards',async()=>{
 const historical=await apply('historical.xlsx',[row('BANCO',9,{cutoffDate:'2026-09-01'})]);
 assert.equal((await snapshot()).batch.id,second);assert.equal((await snapshot(historical.id)).batch.cutoff,'2026-09-01');
});
test('daily BASE: rejected input and stale previews cannot leave half a daily snapshot',async()=>{
 const records=[row('BANCO',9,{cutoffDate:'2026-09-14'})],p=await compare(records),s=await snapshot(),m=s.manual[0];
 await query('select save_daily_manual($1,$2,$3,$4::jsonb) s',[second,m.id,m.revision,JSON.stringify({...m.normalized,amount:222})]);
 await assert.rejects(query('select import_daily_base($1,$2,$3::jsonb,$4,$5::int[]) s',['stale.xlsx',hash('stale'),JSON.stringify(records),p.revision,[]]),/cambiaron/);
 await assert.rejects(apply('invalid.xlsx',[{...records[0],status:'ERROR'}]),/inválida/);
 await assert.rejects(apply('wrong-origin.xlsx',[{...records[0],sheet:'MACRO BANCO'}]),/inválida/);
 assert.equal((await snapshot()).batch.id,second);
});
test('daily BASE: protected ERP and read-only users cannot write through alternate paths',async()=>{
 for(const table of ['daily_base_rows','daily_manual','cash_flow','invoices','investments','projections']) await assert.rejects(db.exec(`delete from ${table}`),/permission denied/);
 await assert.rejects(query('select import_base_changes($1,$2,$3::jsonb,$4,$5::int[]) s',['bypass',hash('bypass'),'[]','',[]]),/permission denied/);
 await db.exec(`set request.jwt.claim.sub='${reader}'`);
 try{await assert.rejects(apply('readonly.xlsx',[row('BANCO',9)]),/rol no permite/);await assert.rejects(query('select save_daily_manual($1,null,null,$2::jsonb) s',[second,'{}']),/rol no permite/);}
 finally{await db.exec(`set request.jwt.claim.sub='${writer}'`);}
});
test('daily BASE: deleting MANUAL survives reimport; user can explicitly restore it from Excel',async()=>{
 const s=await snapshot(),m=s.manual.find(r=>r.id===manualId);
 await query('select save_daily_manual($1,$2,$3,$4::jsonb,true) s',[second,m.id,m.revision,'{}']);
 const records=[row('BANCO',11,{cutoffDate:'2026-09-15'}),row('MANUAL',14,{cutoffDate:'2026-09-15'})];
 await apply('deleted-stays.xlsx',records);assert.ok(!(await snapshot()).manual.some(r=>r.id===manualId));
 await apply('restore.xlsx',records,[14]);assert.equal((await snapshot()).manual.find(r=>r.id===manualId).normalized.amount,100);
});
test('daily SAP: service-only delivery refreshes ERP while preserving every MANUAL row',async()=>{
 const before=await snapshot();
 const rows=[row('BANCO',91,{cutoffDate:'2026-09-16',amount:15000}),row('CLIENTES',92,{cutoffDate:'2026-09-16'})];
 await assert.rejects(query('select import_sap_daily($1,$2,$3::jsonb) s',[writer,hash('sap'),JSON.stringify(rows)]),/permission denied/);
 await db.exec('reset role; set role service_role');
 try{
  const b=await query('select import_sap_daily($1,$2,$3::jsonb) s',[writer,hash('sap'),JSON.stringify(rows)]);assert.equal(b.source,'sap');
  await assert.rejects(query('select import_sap_daily($1,$2,$3::jsonb) s',[writer,hash('bad-sap'),JSON.stringify([...rows,row('MANUAL',93)])]),/no puede enviar/);
 }finally{await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${writer}'`);}
 const after=await snapshot();assert.equal(after.batch.source,'sap');assert.equal(after.rows[0].normalized.amount,15000);
 assert.deepEqual(after.manual.map(r=>[r.id,r.normalized,r.revision]),before.manual.map(r=>[r.id,r.normalized,r.revision]));
 const status=await query('select get_daily_import_status() s');assert.equal(status.records,2);assert.equal(status.history[0].source,'sap');
});
test('daily BASE: missing cutoff uses the last bank date; ambiguous edited MANUAL cannot be reassigned',async()=>{
 const noCutoff=row('BANCO',9,{cutoffDate:null,date:'2026-09-18'});assert.equal((await apply('fallback-date.xlsx',[noCutoff])).cutoff,'2026-09-18');
 const rows=[row('BANCO',9,{cutoffDate:'2026-09-19'}),row('MANUAL',80,{voucher:'SAME',document:'SAME',description:'Equal identity',cutoffDate:'2026-09-19'}),row('MANUAL',81,{voucher:'SAME',document:'SAME',description:'Equal identity',amount:200,cutoffDate:'2026-09-19'})];
 const b=await apply('manual-group.xlsx',rows),s=await snapshot();const m=s.manual.find(r=>r.normalized.description==='Equal identity'&&r.normalized.amount===100);
 await query('select save_daily_manual($1,$2,$3,$4::jsonb) s',[b.id,m.id,m.revision,JSON.stringify({...m.normalized,amount:300})]);
 rows[1].normalized.amount=400;const plan=await compare(rows);assert.equal(plan.rows.find(r=>r.row===80).change,'conflict');
 await apply('manual-group-changed.xlsx',rows,[80,81]);
 const final=await snapshot();assert.deepEqual(final.manual.filter(r=>r.normalized.description==='Equal identity').map(r=>r.normalized.amount).sort((a,b)=>a-b),[200,300]);
});
