import test from 'node:test';
import assert from 'node:assert/strict';
import {sapRecords} from '../supabase/functions/_shared/sap-contract.ts';
const payload=()=>({cutoff:'2026-09-17',counts:{BANCO:1,CLIENTES:0,COLOCACIONES:0},sources:{BANCO:[{sourceId:'journal-1',amount:100,currency:'CLP',type:'income',date:'2026-09-16'}],CLIENTES:[],COLOCACIONES:[]}});
test('SAP contract requires complete feeds, explicit counts, unique identifiers and no MANUAL',()=>{
 assert.equal(sapRecords(payload())[0].normalized.sourceOrigin,'BANCO');
 assert.throws(()=>sapRecords({...payload(),counts:{BANCO:2}}),/incompleta/);
 assert.throws(()=>sapRecords({...payload(),sources:{BANCO:payload().sources.BANCO}}),/incompleta/);
 assert.throws(()=>sapRecords({...payload(),sources:{...payload().sources,MANUAL:[]}}),/MANUAL/);
 assert.throws(()=>sapRecords({...payload(),cutoff:'2026-02-30'}),/Fecha/);
 const duplicate=payload();duplicate.sources.BANCO.push(duplicate.sources.BANCO[0]);duplicate.counts.BANCO=2;
 assert.throws(()=>sapRecords(duplicate),/repetido/);
});
