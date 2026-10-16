import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONFIG,SYMBOLS,evaluate} from '../../games/the-gambler/engine.js';
import {LUNA_ASSET,lunaScatterArtwork} from '../../games/the-gambler/luna-scatter.js';

test('Luna uses the approved PNG and existing scatter identifier',()=>{
  assert.equal(LUNA_ASSET,'assets/luna_moon.png');
  assert.equal(readFileSync(new URL('../../games/the-gambler/'+LUNA_ASSET,import.meta.url)).subarray(1,4).toString(),'PNG');
  assert.match(lunaScatterArtwork(),/SCATTER/);
  assert.equal(CONFIG.weights[SYMBOLS.indexOf('scatter')],3);
  assert.equal(CONFIG.weights.reduce((a,b)=>a+b,0),100);
  assert.equal(SYMBOLS.includes('luna'),false);
});

test('scatter threshold remains three anywhere, with no substitution or scatter line payout',()=>{
  for(let count=0;count<=15;count++){
    const grid=Array.from({length:5},(_,c)=>Array.from({length:3},(_,r)=>c*3+r<count?'scatter':['A','K','Q','J','9'][c]));
    const result=evaluate(grid,10);
    assert.equal(result.scatters,count);
    assert.equal(result.bonus,count>=3);
    assert.equal(result.total,0);
    assert.equal(result.wins.length,0);
  }
  for(let c=0;c<5;c++){
    const grid=Array.from({length:5},()=>['scatter','scatter','scatter']);
    grid[c][1]='wild';
    assert.equal(evaluate(grid,10).scatters,14);
  }
});
