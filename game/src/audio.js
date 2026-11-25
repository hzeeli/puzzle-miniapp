const platform=require('./platform');
const volumes={
  tap:.34,pickup:.30,drop:.34,'pin-locked':.43,reveal:.53,unpin:.46,
  merge:.58,complete:.61,'combo-2':.59,'combo-3':.62,win:.65
};

class AudioManager {
  constructor(settings){
    this.settings=settings;this.sounds=new Map();this.last=new Map();
    this.music=null;this.unlocked=false;
  }
  unlock(){
    if(this.unlocked)return;
    this.unlocked=true;this.playMusic();
  }
  play(name){
    if(!this.unlocked||!this.settings.sound)return;
    const now=Date.now();
    if(now-(this.last.get(name)||0)<90)return;
    this.last.set(name,now);
    let sound=this.sounds.get(name);
    if(!sound){
      sound=platform.createAudio('assets/audio/'+name+'.mp3',volumes[name]);
      this.sounds.set(name,sound);
    }
    sound.stop();sound.play();
  }
  playMusic(){
    if(!this.unlocked||!this.settings.music)return;
    if(!this.music)this.music=platform.createAudio('assets/audio/music.mp3',.18,true);
    this.music.play();
  }
  pause(){
    for(const sound of this.sounds.values())sound.stop();
    if(this.music)this.music.pause();
  }
  sync(){
    if(!this.settings.sound)for(const sound of this.sounds.values())sound.stop();
    if(this.settings.music)this.playMusic();
    else if(this.music)this.music.pause();
  }
}
module.exports=AudioManager;
