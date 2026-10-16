// Synthesized mechanical foley. No game state, timers that drive gameplay, or RNG.
export class MachineAudio {
  constructor(){this.enabled=false;this.voices=new Set();this.motor=[];}
  setEnabled(enabled){
    this.enabled=enabled;
    if(!enabled){this.stopAll();return;}
    try{
      const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
      if(!Context)return;
      this.context??=new Context();
      if(!this.master){this.master=this.context.createGain();this.master.gain.value=.55;this.master.connect(this.context.destination);}
      this.context.resume().catch(()=>{});
    }catch{this.context=null;}
  }
  get ready(){return this.enabled&&this.context&&this.master;}
  noise(){
    if(this.buffer)return this.buffer;
    const c=this.context,b=c.createBuffer(1,c.sampleRate,c.sampleRate),data=b.getChannelData(0);let seed=1976;
    for(let i=0;i<data.length;i++){seed=(1664525*seed+1013904223)>>>0;data[i]=seed/2147483648-1;}
    return this.buffer=b;
  }
  track(node){this.voices.add(node);node.onended=()=>{this.voices.delete(node);node.disconnect();};return node;}
  bell(frequency,at,length,level){
    const c=this.context;
    for(const [multiple,strength] of [[1,1],[2.76,.28],[5.4,.09]]){
      const o=this.track(c.createOscillator()),g=c.createGain();o.type='sine';o.frequency.value=frequency*multiple;
      g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(level*strength,at+.003);g.gain.exponentialRampToValueAtTime(.0001,at+length);
      o.connect(g);g.connect(this.master);o.onended=()=>{this.voices.delete(o);o.disconnect();g.disconnect();};o.start(at);o.stop(at+length+.02);
    }
  }
  click(column=0){
    if(!this.ready)return;
    try{const c=this.context,at=c.currentTime,s=this.track(c.createBufferSource()),f=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise();f.type='bandpass';f.frequency.value=850+column*110;f.Q.value=.8;
      g.gain.setValueAtTime(.108,at);g.gain.exponentialRampToValueAtTime(.0001,at+.09);s.connect(f);f.connect(g);g.connect(this.master);s.onended=()=>{this.voices.delete(s);s.disconnect();f.disconnect();g.disconnect();};s.start(at);s.stop(at+.1);
      this.bell(180+column*14,at,.08,.021);
    }catch{}
  }
  startReels(speed=1){
    this.stopReels();if(!this.ready)return;
    try{const c=this.context,at=c.currentTime,n=this.track(c.createBufferSource()),filter=c.createBiquadFilter(),bed=c.createGain(),hum=this.track(c.createOscillator()),humGain=c.createGain(),flutter=this.track(c.createOscillator()),depth=c.createGain();
      n.buffer=this.noise();n.loop=true;n.playbackRate.value=speed===2?1.15:1;filter.type='lowpass';filter.frequency.value=900;bed.gain.setValueAtTime(0,at);bed.gain.linearRampToValueAtTime(.066,at+.16);
      n.connect(filter);filter.connect(bed);bed.connect(this.master);hum.type='triangle';hum.frequency.setValueAtTime(48,at);hum.frequency.exponentialRampToValueAtTime(speed===2?110:85,at+.25);humGain.gain.value=.021;hum.connect(humGain);humGain.connect(this.master);
      flutter.frequency.value=speed===2?31:23;depth.gain.value=.015;flutter.connect(depth);depth.connect(bed.gain);
      this.motor=[n,hum,flutter];this.motorGains=[bed,humGain,filter,depth];for(const source of this.motor)source.start(at);this.click();
    }catch{this.stopReels();}
  }
  stopReels(){
    const nodes=this.motor.splice(0),extras=this.motorGains?.splice(0)||[];
    for(const node of nodes){try{node.stop();node.disconnect();}catch{}this.voices.delete(node);}
    for(const node of extras)try{node.disconnect();}catch{}
  }
  cash(){
    if(!this.ready)return;
    try{const at=this.context.currentTime;this.bell(1318.51,at,.22,.105);this.bell(2093,at+.115,.85,.13);this.bell(2637.02,at+.14,.7,.06);}catch{}
  }
  stopAll(){this.stopReels();for(const source of this.voices){try{source.stop();}catch{}}this.voices.clear();}
}

