const platform=require('./platform');
class AudioManager {
  constructor(settings){this.settings=settings;this.sounds=new Map();this.last=new Map();this.music=null;this.unlocked=false;}
  unlock(){if(this.unlocked)return;this.unlocked=true;if(this.settings.music)this.playMusic();}
  play(name){if(!this.unlocked||!this.settings.sound)return;const now=Date.now();if(now-(this.last.get(name)||0)<250)return;this.last.set(name,now);let a=this.sounds.get(name);if(!a){a=platform.createAudio('assets/audio/'+name+'.mp3',name==='tap'?.3:.65);this.sounds.set(name,a);}a.stop();a.play();}
  playMusic(){if(!this.unlocked||!this.settings.music)return;if(!this.music)this.music=platform.createAudio('assets/audio/music.mp3',.14,true);this.music.play();}
  pause(){for(const a of this.sounds.values())a.stop();if(this.music)this.music.pause();}
  sync(){if(this.settings.music)this.playMusic();else if(this.music)this.music.pause();}
}
module.exports=AudioManager;
