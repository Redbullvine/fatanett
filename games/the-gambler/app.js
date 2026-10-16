import {CONFIG,PAYTABLE,PAYLINES,SYMBOLS} from './engine.js';
import {buildReelStrip,reelFrame} from './reel-motion.js';
import {cardArtwork} from './card-art.js';
import {GameSession} from './game-session.js';
import {WinEffects} from './win-effects.js';
import {lunaScatterArtwork,LunaScatterCelebration} from './luna-scatter.js';
const $=id=>document.getElementById(id),names={gambler:'The Gambler',lou:'Lucky Lou',heidi:'Heidi Ho',wild:'Wild',scatter:'Luna Moon · SCATTER'};
const saveKey='gambler-'+CONFIG.version;
let game;
try{const saved=sessionStorage.getItem(saveKey);game=saved?GameSession.restore(JSON.parse(saved)):new GameSession();}catch{game=new GameSession();}
function persist(){sessionStorage.setItem(saveKey,JSON.stringify(game.exportState()));}
let busy=false,forced=null,sound=false,audio,animationController;
let spinSpeed=sessionStorage.getItem('gambler-spin-speed')==='2'?2:1;
const fmt=n=>n.toLocaleString('en-US',{maximumFractionDigits:1});
function tone(freq=440,duration=.12){if(!sound)return;try{audio??=new AudioContext();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.frequency.value=freq;g.gain.setValueAtTime(.06,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.start();o.stop(audio.currentTime+duration);}catch{}}
function symbolHTML(s){if(['gambler','lou','heidi'].includes(s))return `<img alt="" src="assets/${{gambler:'the_gambler_1',lou:'lucky_lou_1',heidi:'heidi_ho_1'}[s]}.png"><span class="name">${names[s]}</span>`;if(s==='wild')return '<b>♠♣</b><span>WILD</span>';if(s==='scatter')return lunaScatterArtwork();return cardArtwork(s);}
function drawCell(cell,s){cell.className='symbol '+(s==='wild'?'wild':s==='scatter'?'scatter':['gambler','lou','heidi'].includes(s)?'character':'card');cell.dataset.symbol=s;cell.innerHTML=symbolHTML(s);cell.setAttribute('aria-label',names[s]||s);}
for(let c=0;c<5;c++){const reel=document.createElement('div');reel.className='reel';for(let r=0;r<3;r++){const cell=document.createElement('div');drawCell(cell,['A','gambler','K','lou','Q','heidi','J','wild','10','9'][(c*3+r)%10]);reel.append(cell);}$('reels').append(reel);}
const reels=[...$('reels').children];
const luna=new LunaScatterCelebration({reels:$('reels'),skip:$('skip')});
const effects=new WinEffects({reels:$('reels'),skip:$('skip'),sound:()=>sound,format:fmt});
function ui(){persist();const s=game.state,locked=busy||s.phase!=='idle',canStop=Boolean(animationController);$('balance').textContent=fmt(s.balance);$('wager').textContent=fmt(s.wager);$('lineBet').textContent=fmt(s.wager/10);$('less').disabled=locked||s.wager===CONFIG.wagers[0];$('more').disabled=locked||s.wager===CONFIG.wagers.at(-1);$('spin').disabled=!canStop&&(busy||!['idle','free'].includes(s.phase)||(s.phase==='idle'&&s.balance<s.wager));$('spin').innerHTML=canStop?'STOP<span>REVEAL YOUR HAND</span>':s.freeSpins?`SPIN<span>${s.freeSpins} FREE SPINS LEFT</span>`:'SPIN<span>TRY YOUR LUCK ↻</span>';$('speed').disabled=busy;$('speed').innerHTML=spinSpeed===2?'⚡⚡<span> FAST</span>':'⚡<span> NORMAL</span>';$('speed').setAttribute('aria-pressed',String(spinSpeed===2));$('speed').setAttribute('aria-label',`Spin speed: ${spinSpeed===2?'fast. Switch to normal':'normal. Switch to fast'}`);$('speed').title=spinSpeed===2?'Fast spin speed (2×)':'Normal spin speed';$('refill').disabled=locked;document.querySelectorAll('[data-force]').forEach(b=>b.disabled=locked);$('reset').disabled=locked;if($('devState'))$('devState').textContent=`${CONFIG.version} · ${s.phase} · event ${s.round?.id||'—'}: ${fmt(s.round?.credited||0)} / ${fmt(s.round?.cap||s.wager*CONFIG.maxEventMultiple)} credits · ${s.freeSpins} free spins remaining${s.round?.developerCap?' · DEVELOPER CAP FIXTURE':''}`;}
const counters=new WeakMap();
function count(el,value){const token={};counters.set(el,token);el.textContent=fmt(value);if($('skip').checked||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const start=performance.now();function frame(now){if(counters.get(el)!==token)return;const p=$('skip').checked?1:Math.min(1,(now-start)/850);el.textContent=fmt(Math.floor(value*(1-(1-p)**3)*10)/10);if(p<1)requestAnimationFrame(frame);}requestAnimationFrame(frame);}
function animate(grid){
  return new Promise(resolve=>{
    let finished=false,frameId;
    const tracks=[];
    const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
    function land(column){
      const reel=reels[column],track=tracks[column];
      track?.strip.remove();
      reel.classList.remove('reel-moving');
      reel.dataset.motion='stopped';
      [...reel.children].forEach((cell,row)=>drawCell(cell,grid[column][row]));
      if(track)track.stopped=true;
    }
    function finish(){
      if(finished)return;
      finished=true;
      cancelAnimationFrame(frameId);
      reducedMotion.removeEventListener('change',motionChanged);
      reels.forEach((_,column)=>land(column));
      animationController=null;
      ui();
      resolve();
    }
    function motionChanged(event){if(event.matches)finish();}
    animationController=finish;
    ui();
    if($('skip').checked||reducedMotion.matches){finish();return;}
    reducedMotion.addEventListener('change',motionChanged);
    reels.forEach((reel,column)=>{
      const initial=[...reel.children].map(cell=>cell.dataset.symbol);
      const steps=24+column*5;
      const plan=buildReelStrip(initial,grid[column],()=>SYMBOLS[Math.floor(Math.random()*SYMBOLS.length)],steps);
      const strip=document.createElement('div');
      strip.className='reel-strip';
      strip.setAttribute('aria-hidden','true');
      for(const symbol of plan.symbols){
        const cell=document.createElement('div');
        drawCell(cell,symbol);
        strip.append(cell);
      }
      // Keep the original three cells in layout so responsive CSS remains the
      // source of truth for window size, even during an orientation change.
      const track={strip,steps,...plan,stopped:false};
      tracks.push(track);
      reel.append(strip);
      reel.classList.add('reel-moving');
      reel.dataset.motion='spinning';
    });
    const speed=spinSpeed;
    const start=performance.now();
    function render(now){
      if(finished)return;
      // Measure the stationary layout cells. Every strip uses the current cell
      // pitch, so resizing never changes the target symbols or clips a row.
      const height=reels[0].children[0].getBoundingClientRect().height;
      const gap=parseFloat(getComputedStyle(reels[0]).rowGap)||0;
      for(const [column,track] of tracks.entries()){
        if(track.stopped)continue;
        const motion=reelFrame((now-start)*speed,column,track.steps);
        if(motion.state==='stopped'){
          land(column);
          tone(250+column*80);
          continue;
        }
        track.strip.style.setProperty('--cell-height',`${height}px`);
        track.strip.style.gap=`${gap}px`;
        track.strip.style.transform=`translate3d(0,${(-track.startIndex+motion.position)*(height+gap)}px,0)`;
        track.strip.style.filter=`blur(${motion.blur}px)`;
        reels[column].dataset.motion=motion.state;
      }
      if(tracks.every(track=>track.stopped))finish();
      else frameId=requestAnimationFrame(render);
    }
    render(start);
  });
}
function bonusChoice(stake){
  return new Promise(resolve=>{
    $('bonusTitle').textContent='LUNA MOON — BONUS UNLOCKED!';
    $('bonusContent').innerHTML=`<p>Three scatters. Two ways to make history. Maximum ${fmt(CONFIG.maxEventMultiple)}× total wager across the triggering spin and the whole feature.</p><div class="bonus-choices"><button id="chooseShowdown">Dead Man’s Hand<small>One pick. Up to 100× your wager.</small></button><button id="chooseFree">Heidi Ho<small>${CONFIG.heidiGuaranteedMultiple}× welcome award + ${CONFIG.freeSpins} free spins · ${CONFIG.freeSpinMultiplier}× line wins</small></button></div>${game.state.round.developerCap?'<p>DEVELOPER CAP TEST: choose Heidi. All ten free spins will land wild.</p>':''}`;
    $('bonus').showModal();$('bonus').oncancel=e=>e.preventDefault();
    $('chooseFree').onclick=async()=>{
      if(game.state.phase!=='choice')return;
      const grant=game.chooseHeidi();ui();count($('win'),grant.credited);$('bonus').close();
      $('status').textContent=`Heidi’s welcome award: ${fmt(grant.credited)} credits. ${CONFIG.freeSpins} free spins with ${CONFIG.freeSpinMultiplier}× line wins.`;
      await effects.play({id:`activation-${game.state.round.id}`,kind:'activation',amount:CONFIG.freeSpins,detail:`Heidi Ho · ${fmt(grant.credited)} credits welcome award`});
      resolve();
    };
    $('chooseShowdown').onclick=()=>{
      if(!['choice','pick'].includes(game.state.phase))return;
      if(game.state.phase==='choice')game.prepareShowdown();ui();
      $('bonusTitle').textContent='Dead Man’s Hand';
      $('bonusContent').innerHTML='<p>Aces and eights are on the table. Pick a concealed card to reveal your award.</p><div class="cards">'+Array.from({length:5},(_,i)=>`<button aria-label="Pick card ${i+1}">♠</button>`).join('')+'</div><p id="pickResult">Your hand is waiting.</p>';
      document.querySelectorAll('.cards button').forEach((button,index)=>button.onclick=()=>{
        if(game.state.phase!=='pick')return;
        const result=game.revealShowdown();
        document.querySelectorAll('.cards button').forEach((card,j)=>{card.disabled=true;card.classList.add('revealed');card.textContent=j===index?`${result.multiplier}×`:result.cards[j];});
        ui();count($('win'),result.credited);
        $('pickResult').textContent=`Dead Man’s Hand pays ${fmt(result.credited)} play credits. Event total: ${fmt(result.eventTotal)}.`;
        const done=document.createElement('button');done.textContent='Collect & return';$('bonusContent').append(done);
        done.onclick=async()=>{done.disabled=true;$('bonus').close();await effects.play({id:`showdown-${game.state.round.id}`,kind:'showdown',amount:result.credited,detail:'Aces and eights · The table is yours'});$('status').textContent=`Showdown won ${fmt(result.credited)} credits. The table is yours.`;resolve();};
        tone(550,.4);
      });
    };
    if(game.state.phase==='pick')$('chooseShowdown').click();
  });
}
async function play(){
  if(busy)return;
  busy=true;
  try{
    const isFree=game.state.phase==='free';
    const ticket=game.pendingSpin||game.beginSpin({forced:isFree?null:forced});
    luna.clear();effects.clear();
    forced=null;$('forced').textContent='';ui();
    $('status').textContent=ticket.isFree?'Heidi’s luck is riding with you…':'The cards are in motion…';tone(180);
    await animate(ticket.grid);
    const award=game.finishSpin(ticket.id);
    ticket.wins.forEach(win=>{for(let c=0;c<win.count;c++)reels[c].children[win.rows[c]].classList.add('winning');});
    ui();count($('win'),award.credited);
    $('status').textContent=award.credited?`${ticket.wins.length} winning line${ticket.wins.length===1?'':'s'} · ${fmt(award.credited)} credits${ticket.isFree?` · ${CONFIG.freeSpinMultiplier}× free-spin payout`:''}`:'No winning hand this time. Fortune awaits.';
    if(award.withheld>0)$('status').textContent=`Event maximum reached: ${fmt(award.eventTotal)} credits (${fmt(CONFIG.maxEventMultiple)}×). This spin credits ${fmt(award.credited)} of ${fmt(award.raw)} raw credits. Remaining free spins cost no credits.`;
    await effects.play({id:`spin-${ticket.id}`,amount:award.credited,wager:ticket.wager,wins:ticket.wins,big:CONFIG.bigWinMultiple});
    if(award.bonusPending){$('status').textContent=`${ticket.scatters} Luna Moon scatters · Bonus unlocked.`;await luna.play(`scatter-${ticket.id}`);await bonusChoice(ticket.wager);}
    if(award.featureComplete)await effects.play({id:`complete-${ticket.eventId}`,kind:'complete',amount:award.featureTotal,detail:'Heidi Ho · All free spins completed'});
    if(award.featureComplete)$('status').textContent=`Heidi’s feature complete · ${fmt(award.featureTotal)} feature credits · ${fmt(award.eventTotal)} total event credits${award.capReached?' · maximum reached':''}.`;
  }catch(error){$('status').textContent=error.message;console.error(error);}
  finally{busy=false;ui();}
}
$('speed').onclick=()=>{if(busy)return;spinSpeed=spinSpeed===1?2:1;sessionStorage.setItem('gambler-spin-speed',String(spinSpeed));ui();};
$('spin').onclick=()=>{if(animationController)animationController();else play();};
$('less').onclick=()=>{if(!busy&&game.state.phase==='idle'){game.setWager(CONFIG.wagers[Math.max(0,CONFIG.wagers.indexOf(game.state.wager)-1)]);ui();}};
$('more').onclick=()=>{if(!busy&&game.state.phase==='idle'){game.setWager(CONFIG.wagers[Math.min(CONFIG.wagers.length-1,CONFIG.wagers.indexOf(game.state.wager)+1)]);ui();}};
$('skip').onchange=()=>{if($('skip').checked){animationController?.();effects.finish();luna.finish();}};
$('sound').onclick=()=>{sound=!sound;if(!sound)effects.mute();$('sound').textContent=sound?'Sound on':'Sound off';$('sound').setAttribute('aria-pressed',String(sound));tone();};
$('refill').onclick=()=>{if(!busy&&game.state.phase==='idle'){game.refill();ui();$('status').textContent='Your balance is refilled to 1,000 play credits.';}};
$('devToggle').onclick=()=>{$('dev').hidden=!$('dev').hidden;};
const fixtureNames={bonus:'three scatters',big:'big win',cap:'Heidi cap test — choose Heidi, then ten all-wild free spins'};
 document.querySelectorAll('[data-force]').forEach(button=>button.onclick=()=>{if(!busy&&game.state.phase==='idle'){forced=button.dataset.force;$('forced').textContent=`Next spin: ${fixtureNames[forced]}`;}});
$('reset').onclick=()=>{if(!busy&&game.state.phase==='idle'){game.reset();forced=null;$('forced').textContent='';document.querySelectorAll('.winning').forEach(cell=>cell.classList.remove('winning'));count($('win'),0);$('status').textContent='New session. The table is yours.';ui();}};
$('payouts').innerHTML='<table><thead><tr><th>Symbol</th><th>3</th><th>4</th><th>5</th></tr></thead><tbody>'+Object.entries(PAYTABLE).map(([s,p])=>`<tr><td>${names[s]||s}</td>${p.map(value=>`<td>${value}×</td>`).join('')}</tr>`).join('')+'</tbody></table>';
$('lines').innerHTML=PAYLINES.map((rows,i)=>`<div class="line-diagram">LINE ${i+1}<pre>${[0,1,2].map(r=>rows.map(v=>v===r?'●':'·').join(' ')).join('\n')}</pre></div>`).join('');
const weightTotal=CONFIG.showdownWeights.reduce((a,b)=>a+b,0);
$('featureRules').textContent=`Showdown: preselected ${CONFIG.showdownMultipliers.map((m,i)=>`${m}× (${(100*CONFIG.showdownWeights[i]/weightTotal).toFixed(9).replace(/\.?0+$/,'')}%)`).join(', ')} total-wager awards. Card position does not change the odds. Heidi: ${CONFIG.heidiGuaranteedMultiple}× total wager paid as a guaranteed welcome award, plus ${CONFIG.freeSpins} free spins at the triggering wager with ${CONFIG.freeSpinMultiplier}× line wins. No retriggers. Maximum ${fmt(CONFIG.maxEventMultiple)}× total wager across one paid spin plus the entire feature, including all free spins. The cap never resets between free spins; all awarded spins remain playable. Big wins start at ${CONFIG.bigWinMultiple}×. Model return is approximately 95.00%: Showdown is calculated exactly; capped Heidi includes a rare-tail estimate. Free-play prototype; not certified.`;
$('freeFeatureCaption').textContent=`${CONFIG.freeSpins} free spins. ${CONFIG.freeSpinMultiplier}× line wins + ${CONFIG.heidiGuaranteedMultiple}× welcome award.`;
$('paytable').onclick=()=>$('rules').showModal();document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$(button.dataset.close).close());ui();
if(game.state.phase==='spinning')play();
else if(['choice','pick'].includes(game.state.phase)){busy=true;ui();bonusChoice(game.state.round.wager).finally(()=>{busy=false;ui();});}
