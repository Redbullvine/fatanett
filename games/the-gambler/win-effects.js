// Presentation only: callers supply confirmed, already-settled awards.
export function winTier(amount,wager,big=10){return amount>=wager*100?'mega':amount>=wager*big?'big':amount>=wager*5?'medium':'small';}
export class WinEffects {
  constructor({reels,skip,sound,format}){
    Object.assign(this,{reels,skip,sound,format});this.seen=new Set();this.active=null;
    this.motion=matchMedia('(prefers-reduced-motion: reduce)');
    this.dialog=document.createElement('dialog');this.dialog.id='winShow';this.dialog.setAttribute('aria-labelledby','victoryTitle');
    this.dialog.innerHTML='<div class="victory-glow"></div><div class="saloon-door door-left"></div><div class="saloon-door door-right"></div><div class="victory-art"></div><div class="victory-particles" aria-hidden="true"></div><div class="victory-copy"><span class="eyebrow">DEAD MAN’S HAND · HIGH STAKES</span><h2 id="victoryTitle"></h2><p class="victory-detail"></p><strong class="victory-amount"></strong><span class="victory-unit">PLAY CREDITS</span><button class="victory-skip">Skip animation</button><button class="victory-mute">Sound off</button></div>';
    document.body.append(this.dialog);this.dialog.querySelector('button').onclick=()=>this.finish();this.dialog.querySelector('.victory-mute').onclick=()=>{document.querySelector('#sound').click();this.dialog.querySelector('.victory-mute').textContent=this.sound()?'Mute sound':'Sound off';};this.dialog.oncancel=e=>{e.preventDefault();this.finish();};
    this.motion.addEventListener('change',e=>{if(e.matches)this.finish();});
  }
  clear(){this.reels.querySelectorAll('.winning').forEach(x=>x.classList.remove('winning'));this.reels.parentElement.querySelector('.winning-lines')?.remove();}
  lines(wins){
    this.clear();const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('winning-lines');svg.setAttribute('viewBox','0 0 1000 600');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
    for(const win of wins){const points=[];for(let c=0;c<win.count;c++){this.reels.children[c].children[win.rows[c]].classList.add('winning');points.push(`${100+c*200},${100+win.rows[c]*200}`);}const line=document.createElementNS(svg.namespaceURI,'polyline');line.setAttribute('points',points.join(' '));svg.append(line);}
    this.reels.parentElement.append(svg);
    // Measure the rendered cells, including responsive gaps and frame padding.
    const frame=this.reels.parentElement.getBoundingClientRect();
    svg.setAttribute('viewBox',`0 0 ${frame.width} ${frame.height}`);
    [...svg.children].forEach((line,i)=>line.setAttribute('points',Array.from({length:wins[i].count},(_,c)=>{const cell=this.reels.children[c].children[wins[i].rows[c]].getBoundingClientRect();return `${cell.left-frame.left+cell.width/2},${cell.top-frame.top+cell.height/2}`;}).join(' ')));
  }
  finish(){this.active?.finish();}
  play({id,amount,wager,wins=[],kind,big=10,detail=''}){
    if(this.seen.has(id))return Promise.resolve(false);
    this.seen.add(id);if(this.seen.size>512)this.seen.delete(this.seen.values().next().value);
    if(!kind&&amount<=0)return Promise.resolve(false);
    this.finish();if(wins.length)this.lines(wins);
    kind??=winTier(amount,wager,big);
    const d=this.dialog,reduced=this.motion.matches||this.skip.checked;
    d.className=`victory victory-${kind}${reduced?' victory-static':''}`;d.dataset.event=id;d.querySelector('.victory-mute').textContent=this.sound()?'Mute sound':'Sound off';
    const titles={small:'Winning hand',medium:'WIN',big:'BIG WIN',mega:'MEGA WIN',showdown:'SHOWDOWN VICTORY',activation:'FREE SPINS AWARDED',complete:'BONUS COMPLETE'};
    d.querySelector('h2').textContent=titles[kind];d.querySelector('.victory-detail').textContent=detail;
    const counter=d.querySelector('strong');counter.textContent=this.format(reduced?amount:0);
    d.querySelector('.victory-unit').textContent=kind==='activation'?'FREE SPINS':'PLAY CREDITS';
    const particles=d.querySelector('.victory-particles');particles.replaceChildren();
    if(kind==='small'||kind==='medium'){this.reels.parentElement.append(particles);particles.classList.add('reel-victory-particles');}
    if(!reduced){const n=innerWidth<600?18:36;for(let i=0;i<n;i++){const p=document.createElement('i');p.className=kind==='small'||kind==='big'?'gold-spark':'gold-coin';p.style.cssText=`--x:${(i*37)%100}%;--dx:${Math.cos(i*2.4)*320}px;--dy:${Math.sin(i*2.4)*240}px;--delay:${i%6*.09}s;`;if(kind==='medium'){p.classList.add('reel-coin-burst');const win=wins[i%Math.max(1,wins.length)];p.style.left=`${10+(i%(win?.count||5))*20}%`;p.style.top=`${25+(win?.rows[i%(win?.count||5)]||0)*18}%`;}particles.append(p);}}
    const duration=reduced?850:({small:1500,medium:2400,big:3300,mega:4600,showdown:3800,activation:2600,complete:3400}[kind]);
    return new Promise(resolve=>{
      let frame,timer,closed=false;const started=performance.now();
      const finish=()=>{if(closed)return;closed=true;cancelAnimationFrame(frame);clearTimeout(timer);counter.textContent=this.format(amount);this.stopAudio?.();this.reels.closest('.machine').classList.remove('victory-shake');d.close();particles.replaceChildren();particles.classList.remove('reel-victory-particles');d.append(particles);this.active=null;resolve(true);};
      this.active={finish};
      // Keep reel pulses and coin origins visible for the two smaller tiers.
      if(kind==='small'||kind==='medium')d.show();else d.showModal();
      if(!reduced){if(kind==='big')this.reels.closest('.machine').classList.add('victory-shake');this.music(kind);const tick=now=>{const t=Math.min(1,(now-started)/(duration*.7));counter.textContent=this.format(Math.floor(amount*(1-(1-t)**3)*10)/10);if(t<1)frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);}
      timer=setTimeout(finish,duration);
    });
  }
  music(kind){
    if(!this.sound()||kind==='small')return;
    try{this.audio??=new AudioContext();this.audio.resume();const ctx=this.audio,nodes=[];const notes=kind==='medium'?[293.66,369.99,440,587.33]:[146.83,220,293.66,369.99,440,587.33,440,587.33];
      notes.forEach((f,i)=>{const o=ctx.createOscillator(),g=ctx.createGain(),at=ctx.currentTime+i*.19;o.type=i%3===0?'triangle':'sine';o.frequency.value=f;o.connect(g);g.connect(ctx.destination);g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(.035,at+.015);g.gain.exponentialRampToValueAtTime(.0001,at+.65);o.start(at);o.stop(at+.7);nodes.push(o);});
      this.stopAudio=()=>{nodes.forEach(o=>{try{o.stop();}catch{}});this.stopAudio=null;};
    }catch{}
  }
  mute(){this.stopAudio?.();}
}
