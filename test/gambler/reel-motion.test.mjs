import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildReelStrip,reelFrame,reelDuration,travelProgress,REEL_TIMING} from '../../games/the-gambler/reel-motion.js';
import {spin} from '../../games/the-gambler/engine.js';

test('each downward strip starts on the old grid and lands on the exact result',()=>{
  for(let column=0;column<5;column++){
    const initial=['A','lou','9'],outcome=['wild','scatter','heidi'];
    const steps=24+column*5;
    const plan=buildReelStrip(initial,outcome,()=> 'K',steps);
    assert.deepEqual(plan.symbols.slice(plan.startIndex,plan.startIndex+3),initial);
    const end=plan.startIndex-reelFrame(reelDuration(column),column,steps).position;
    assert.equal(end,plan.endIndex);
    assert.deepEqual(plan.symbols.slice(end,end+3),outcome);
  }
});

test('travel scrolls downward continuously with acceleration and braking',()=>{
  assert.equal(travelProgress(0),0);
  assert.ok(Math.abs(travelProgress(1)-1)<1e-12);
  for(let i=1;i<=1000;i++)assert.ok(travelProgress(i/1000)>=travelProgress((i-1)/1000));
  const speed=t=>(travelProgress(t+.001)-travelProgress(t))/.001;
  assert.ok(speed(.01)<speed(.1));
  assert.ok(speed(.1)<speed(.3));
  assert.ok(speed(.7)>speed(.9));
  assert.ok(speed(.9)>speed(.99));
});

test('all five reels move together, then stop strictly left to right',()=>{
  for(let c=0;c<5;c++){
    assert.equal(reelFrame(500,c,24+c*5).state,'spinning');
    assert.ok(reelFrame(500,c,24+c*5).position>0);
    assert.ok(reelFrame(500,c,24+c*5).blur>0);
    assert.equal(reelFrame(reelDuration(c),c,24+c*5).state,'stopped');
    if(c<4)assert.notEqual(reelFrame(reelDuration(c),c+1,29+c*5).state,'stopped');
  }
});

test('braking ends at the target and holds still throughout settlement',()=>{
  for(let c=0;c<5;c++){
    const steps=24+c*5,end=reelDuration(c),start=end-REEL_TIMING.settle;
    assert.equal(reelFrame(start,c,steps).position,steps);
    for(let t=start;t<=end+1000;t++){
      assert.equal(reelFrame(t,c,steps).position,steps);
      assert.equal(reelFrame(t,c,steps).blur,0);
    }
    assert.deepEqual(reelFrame(end+5000,c,steps),{position:steps,blur:0,state:'stopped'});
  }
});

test('twenty seeded spins never reverse or overshoot and retain their exact outcomes',()=>{
  let seed=19276;
  const rng=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2**32;};
  for(let trial=0;trial<20;trial++){
    const result=spin(10,rng),before=structuredClone(result);
    for(let c=0;c<5;c++){
      const steps=24+c*5,end=reelDuration(c);
      const plan=buildReelStrip(['A','K','Q'],result.grid[c],()=> '9',steps);
      let previous=0;
      for(let t=0;t<=end+1000;t++){
        const frame=reelFrame(t,c,steps);
        assert.ok(frame.position>=previous-1e-12,'reel must never reverse');
        assert.ok(frame.position<=steps+1e-12,'reel must never overshoot');
        previous=frame.position;
      }
      const landingIndex=plan.startIndex-reelFrame(end,c,steps).position;
      assert.deepEqual(plan.symbols.slice(landingIndex,landingIndex+3),result.grid[c]);
    }
    assert.deepEqual(result,before,'animation must not mutate the outcome or payout');
  }
});

