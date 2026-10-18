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
      this.resumeMusic();
    }catch{this.context=null;}
  }
  get ready(){return this.enabled&&this.context&&this.master;}
  resumeMusic(){
    if(!this.ready||typeof Audio==='undefined'||document.hidden)return;
    try{
      if(!this.musicElement){
        this.musicElement=new Audio('assets/old_west_pixabay.mp3');
        this.musicElement.loop=true;this.musicElement.preload='none';
        this.musicSource=this.context.createMediaElementSource(this.musicElement);
        this.musicGain=this.context.createGain();this.musicGain.gain.value=0;
        this.musicSource.connect(this.musicGain);this.musicGain.connect(this.master);
      }
      this.settleMusic();this.musicElement.play().catch(()=>{});
    }catch{}
  }
  settleMusic(){
    if(!this.musicGain)return;
    const at=this.context.currentTime,g=this.musicGain.gain;
    g.cancelScheduledValues(at);g.setValueAtTime(g.value,at);g.linearRampToValueAtTime(.07,at+.4);
  }
  liftMusic(){
    if(!this.ready||!this.musicGain||this.musicElement.paused)return;
    const at=this.context.currentTime,g=this.musicGain.gain;
    g.cancelScheduledValues(at);g.setValueAtTime(g.value,at);
    g.linearRampToValueAtTime(.14,at+.35);g.setValueAtTime(.14,at+1.8);g.linearRampToValueAtTime(.07,at+2.6);
  }
  pauseMusic(){
    this.musicElement?.pause();
    if(this.musicGain){const at=this.context.currentTime;this.musicGain.gain.cancelScheduledValues(at);this.musicGain.gain.setValueAtTime(0,at);}
  }
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
    try{const c=this.context,at=c.currentTime,n=this.track(c.createBufferSource()),filter=c.createBiquadFilter(),g=c.createGain();
      // Six light steel detents per cylinder revolution, with quiet bearing friction.
      if(!this.cylinderBuffer){const period=.045,length=Math.floor(c.sampleRate*period*6),b=c.createBuffer(1,length,c.sampleRate),d=b.getChannelData(0);let seed=1873;
        const accents=[1,.6,.82,.62,.9,.58];
        for(let i=0;i<length;i++){seed=(1664525*seed+1013904223)>>>0;const time=i/c.sampleRate,t=time%period,tooth=Math.min(5,Math.floor(time/period)),noise=seed/2147483648-1;
          d[i]=accents[tooth]*(noise*.32*Math.exp(-t*650)+Math.sin(2*Math.PI*1850*t)*.3*Math.exp(-t*260)+Math.sin(2*Math.PI*3270*t)*.12*Math.exp(-t*340))+noise*.012;
        }
        this.cylinderBuffer=b;}
      n.buffer=this.cylinderBuffer;n.loop=true;
      n.playbackRate.setValueAtTime(1.1,at);n.playbackRate.linearRampToValueAtTime(1.65,at+.14/speed);n.playbackRate.exponentialRampToValueAtTime(.38,at+3.1/speed);
      filter.type='lowpass';filter.frequency.value=4800;g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(.14,at+.025);
      n.connect(filter);filter.connect(g);g.connect(this.master);this.motor=[n];this.motorGains=[filter,g];n.start(at);
    }catch{this.stopReels();}
  }
  stopReels(){
    const nodes=this.motor.splice(0),extras=this.motorGains?.splice(0)||[];
    for(const node of nodes){try{node.stop();node.disconnect();}catch{}this.voices.delete(node);}
    for(const node of extras)try{node.disconnect();}catch{}
    if(nodes.length&&this.ready){try{const at=this.context.currentTime;this.mechanism(at,.045,2450,.09);this.bell(1180,at,.06,.025);}catch{}}
  }
  cash(){
    if(!this.ready)return;
    this.liftMusic();
    try{const c=this.context,at=c.currentTime;
      // Register lever, spring-loaded drawer, and the brass sale bell.
      this.mechanism(at,.075,620,.24);
      this.mechanism(at+.09,.26,1100,.105);
      this.mechanism(at+.38,.065,350,.14);
      this.bell(1760,at+.11,1.05,.16);
      this.bell(2464,at+.115,.55,.035);
    }catch{}
  }
  mechanism(at,duration,frequency,level){
    const c=this.context,s=this.track(c.createBufferSource()),f=c.createBiquadFilter(),g=c.createGain();
    s.buffer=this.noise();f.type='bandpass';f.frequency.value=frequency;f.Q.value=.65;
    g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(level,at+.004);g.gain.exponentialRampToValueAtTime(.0001,at+duration);
    s.connect(f);f.connect(g);g.connect(this.master);s.onended=()=>{this.voices.delete(s);s.disconnect();f.disconnect();g.disconnect();};s.start(at);s.stop(at+duration+.01);
  }
  stopAll(){this.pauseMusic();this.stopReels();for(const source of this.voices){try{source.stop();}catch{}}this.voices.clear();}
}

