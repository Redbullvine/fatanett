import {CONFIG,spin,showdown} from './engine.js';

function credits(n){if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid credit amount');return n;}
function immutableResult(result){result.grid.forEach(Object.freeze);Object.freeze(result.grid);return Object.freeze(result);}

// Owns credit settlement and the paid event shared by all feature awards.
// Presentation receives a fixed ticket; animation cannot reroll or recredit it.
export class GameSession {
  #balance=1000;#wager=10;#phase='idle';#round=null;#pending=null;#showdown=null;#nextTicket=1;#nextRound=1;#free=0;#featureTotal=0;#last=null;
  get state(){return {balance:this.#balance,wager:this.#wager,phase:this.#phase,freeSpins:this.#free,featureTotal:this.#featureTotal,round:this.#round?{...this.#round}:null,lastRound:this.#last?{...this.#last}:null};}
  get pendingSpin(){return this.#pending;}
  exportState(){return {version:CONFIG.version,balance:this.#balance,wager:this.#wager,phase:this.#phase,round:this.#round,pending:this.#pending,showdown:this.#showdown,nextTicket:this.#nextTicket,nextRound:this.#nextRound,free:this.#free,featureTotal:this.#featureTotal,last:this.#last};}
  static restore(data){
    if(data.version!==CONFIG.version||!['idle','spinning','choice','pick','free'].includes(data.phase)||!CONFIG.wagers.includes(data.wager))throw new Error('Invalid saved session');
    for(const key of ['balance','nextTicket','nextRound','free','featureTotal'])credits(data[key]);
    if(data.free>CONFIG.freeSpins)throw new Error('Invalid free-spin count');
    if(data.round){const r=data.round;credits(r.raw);credits(r.credited);if(!CONFIG.wagers.includes(r.wager)||r.cap!==r.wager*CONFIG.maxEventMultiple||r.credited>r.cap||r.raw<r.credited)throw new Error('Invalid saved event');}
    if(data.phase!=='idle'&&!data.round)throw new Error('Missing saved event');
    if(data.phase==='spinning'&&(!data.pending||data.pending.eventId!==data.round.id||data.pending.wager!==data.round.wager||data.pending.expectedCredit!==Math.min(data.pending.raw,data.round.cap-data.round.credited)))throw new Error('Invalid saved ticket');
    if(data.phase==='free'&&!data.free)throw new Error('Missing free spins');
    if(data.phase==='pick'&&(!data.showdown||!CONFIG.showdownMultipliers.includes(data.showdown.multiplier)||data.showdown.total!==data.showdown.multiplier*data.round.wager))throw new Error('Invalid saved Showdown');
    const g=new GameSession();g.#balance=data.balance;g.#wager=data.wager;g.#phase=data.phase;g.#round=data.round;g.#pending=data.pending?immutableResult(data.pending):null;g.#showdown=data.showdown?Object.freeze(data.showdown):null;g.#nextTicket=data.nextTicket;g.#nextRound=data.nextRound;g.#free=data.free;g.#featureTotal=data.featureTotal;g.#last=data.last;return g;
  }
  setWager(wager){if(this.#phase!=='idle')throw new Error('Wager locked during an event');if(!CONFIG.wagers.includes(wager))throw new Error('Invalid wager');this.#wager=wager;}
  refill(){if(this.#phase!=='idle')throw new Error('Complete the event first');this.#balance=1000;}
  reset(){if(this.#phase!=='idle')throw new Error('Complete the event first');this.#balance=1000;this.#wager=10;this.#round=null;this.#last=null;this.#free=0;this.#featureTotal=0;}
  #credit(raw){credits(raw);if(!this.#round)throw new Error('Missing paid event');const round=this.#round;round.raw+=raw;const credited=Math.min(raw,round.cap-round.credited);round.credited+=credited;this.#balance+=credited;return {raw,credited,withheld:raw-credited,eventTotal:round.credited,eventCap:round.cap,capReached:round.credited===round.cap};}
  #complete(){this.#last={...this.#round};this.#phase='idle';}
  beginSpin({rng=Math.random,forced=null}={}){
    if(!['idle','free'].includes(this.#phase))throw new Error('A spin or bonus is already pending');
    const isFree=this.#phase==='free';
    if(isFree&&forced!==null)throw new Error('Developer fixture cannot interrupt a live feature');
    const wager=isFree?this.#round.wager:this.#wager;
    if(!isFree&&this.#balance<wager)throw new Error('Insufficient play credits');
    const fixture=isFree?(this.#round.developerCap?'wild':null):forced;
    const result=spin(wager,rng,fixture);
    if(!isFree){this.#balance-=wager;this.#featureTotal=0;this.#round={id:this.#nextRound++,wager,cap:wager*CONFIG.maxEventMultiple,credited:0,raw:0,developerCap:forced==='cap'};}
    else this.#free--;
    const raw=credits(result.total*(isFree?CONFIG.freeSpinMultiplier:1));
    const ticket=immutableResult({...result,id:this.#nextTicket++,eventId:this.#round.id,wager,isFree,raw,expectedCredit:Math.min(raw,this.#round.cap-this.#round.credited)});
    this.#pending=ticket;this.#phase='spinning';return ticket;
  }
  finishSpin(id){
    if(this.#phase!=='spinning'||!this.#pending||id!==this.#pending.id)throw new Error('Invalid or already settled spin');
    const ticket=this.#pending,award=this.#credit(ticket.raw);
    if(award.credited!==ticket.expectedCredit)throw new Error('Event budget changed during animation');
    this.#pending=null;
    if(ticket.isFree)this.#featureTotal+=award.credited;
    const featureComplete=ticket.isFree&&this.#free===0;
    if(ticket.isFree){if(this.#free)this.#phase='free';else this.#complete();}
    else if(ticket.bonus)this.#phase='choice';else this.#complete();
    return {...award,bonusPending:this.#phase==='choice',featureComplete,featureTotal:this.#featureTotal,freeSpins:this.#free};
  }
  chooseHeidi(){
    if(this.#phase!=='choice')throw new Error('No feature choice pending');
    const award=this.#credit(this.#round.wager*CONFIG.heidiGuaranteedMultiple);
    if(award.credited!==award.raw)throw new Error('Guaranteed feature award exceeds remaining budget');
    this.#featureTotal=award.credited;this.#free=CONFIG.freeSpins;this.#phase='free';return award;
  }
  prepareShowdown(rng=Math.random){
    if(this.#phase!=='choice')throw new Error('No feature choice pending');
    this.#showdown=Object.freeze(showdown(this.#round.wager,rng));this.#phase='pick';return this.#showdown;
  }
  revealShowdown(){
    if(this.#phase!=='pick'||!this.#showdown)throw new Error('No unrevealed Showdown award');
    const result=this.#showdown,award=this.#credit(result.total);
    this.#showdown=null;this.#featureTotal=award.credited;this.#complete();return {...result,...award};
  }
}
