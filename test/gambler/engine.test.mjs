import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluate,spin,showdown,PAYLINES,PAYTABLE,CONFIG} from '../../games/the-gambler/engine.js';
const grid=()=>Array.from({length:5},()=>['scatter','scatter','scatter']);
test('every paytable entry pays exactly for three, four and five symbols',()=>{for(const [s,pays] of Object.entries(PAYTABLE)){for(let n=3;n<=5;n++){const g=grid();for(let c=0;c<n;c++)g[c][1]=s;const r=evaluate(g,10);assert.equal(r.wins.length,1);assert.equal(r.total,pays[n-3]);}}});
test('leading wilds select highest eligible payout, never double-pay',()=>{const g=grid();g[0][1]='wild';g[1][1]='wild';g[2][1]='gambler';g[3][1]='gambler';g[4][1]='gambler';assert.equal(evaluate(g,10).total,1550);});
test('all wild pays once per line; wager scales linearly',()=>{const g=Array.from({length:5},()=>['wild','wild','wild']);assert.equal(evaluate(g,20).total,3075*2*10);});
test('scatter never substitutes and matches must start at left',()=>{const g=grid();g[1][1]=g[2][1]=g[3][1]='A';assert.equal(evaluate(g,10).total,0);});
test('three scatter threshold counts anywhere',()=>{const g=Array.from({length:5},()=>['9','K','Q']);g[0][0]=g[1][1]='scatter';assert.equal(evaluate(g,10).bonus,false);g[4][2]='scatter';assert.equal(evaluate(g,10).bonus,true);});
test('seeded inputs repeat exactly and developer fixtures trigger features',()=>{assert.deepEqual(spin(10,()=>.42),spin(10,()=>.42));assert.equal(spin(10,()=>.42,'bonus').scatters,3);assert.ok(spin(10,()=>.42,'big').total>=100);assert.throws(()=>spin(13));});
test('weighted Showdown boundaries and approved mean',()=>{const total=100000000000;let start=0,mean=0;for(const [i,m] of [5,10,20,50,100].entries()){const weight=CONFIG.showdownWeights[i];assert.equal(showdown(20,()=>(start+.5)/total).total,m*20);assert.equal(showdown(20,()=>(start+weight-.5)/total).total,m*20);mean+=m*weight/total;start+=weight;}assert.ok(Math.abs(mean-31.27527226)<1e-12);assert.equal(start,total);});
test('all ten paylines pay and grid inputs are unchanged',()=>{for(const rows of PAYLINES){const g=grid();rows.forEach((r,c)=>g[c][r]='lou');const copy=structuredClone(g);assert.equal(evaluate(g,50).total,1025*5);assert.deepEqual(g,copy);}});
test('generated grids contain valid dimensions and finite payouts',()=>{for(let i=0;i<1000;i++){const r=spin(CONFIG.wagers[i%4]);assert.equal(r.grid.length,5);assert.ok(r.grid.every(c=>c.length===3));assert.ok(Number.isFinite(r.total)&&r.total>=0);}});

