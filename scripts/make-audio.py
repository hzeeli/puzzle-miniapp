"""原创轻音乐与交互音色，不使用第三方录音采样。"""
from pathlib import Path
import numpy as np
from scipy.io.wavfile import write
import subprocess
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'game/assets/audio';OUT.mkdir(parents=True,exist_ok=True)
SR=44100

def tone(freq,duration,amp=.2):
 t=np.arange(int(duration*SR))/SR
 attack=np.minimum(1,t/.012);release=np.minimum(1,(duration-t)/.10)
 env=attack*release*np.exp(-t*(2.0/duration))
 sound=(np.sin(2*np.pi*freq*t)+.22*np.sin(2*np.pi*2*freq*t)+.075*np.sin(2*np.pi*3*freq*t))*env*amp
 return sound

def save(name,sound):
 for delay,gain in [(.071,.12),(.119,.08),(.211,.035)]:
  shift=int(delay*SR)
  if shift<len(sound):sound[shift:]+=sound[:-shift].copy()*gain
 peak=max(.85,np.max(np.abs(sound)));sound=np.tanh(sound/peak)*.82
 raw=OUT/(name+'.wav');write(raw,SR,(sound*32767).astype(np.int16))
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(raw),'-codec:a','libmp3lame','-b:a','96k',str(OUT/(name+'.mp3'))],check=True)
 raw.unlink()

def phrase(notes,duration):
 out=np.zeros(int(duration*SR))
 for at,freq,length,volume in notes:
  a=int(at*SR);s=tone(freq,length,volume);n=min(len(s),len(out)-a);out[a:a+n]+=s[:n]
 return out
save('tap',phrase([(0,660,.10,.19)],.17))
save('merge',phrase([(0,523.25,.22,.24),(.065,783.99,.24,.22)],.42))
save('complete',phrase([(0,523.25,.5,.20),(.07,659.25,.5,.18),(.14,783.99,.6,.18),(.23,1046.5,.55,.16)],1.05))
save('win',phrase([(i*.11,f,.7,.18) for i,f in enumerate([523.25,659.25,783.99,1046.5,1318.51])]+[(.5,261.63,.9,.2)],1.6))
beat=60/84;length=beat*64;music=np.zeros(int(length*SR))
chords=[[261.63,329.63,392],[220,261.63,329.63],[174.61,220,261.63],[196,246.94,293.66]]
for bar in range(16):
 notes=chords[bar%4]
 for j in range(4):
  freq=notes[(j+bar)%3]*(2 if j%2==0 else 1);at=(bar*4+j)*beat
  s=tone(freq,beat*2.6,.10);start=int(at*SR)
  for k,v in enumerate(s):music[(start+k)%len(music)]+=v
 bass=tone(notes[0]/2,beat*3.9,.10);start=int(bar*4*beat*SR)
 for k,v in enumerate(bass):music[(start+k)%len(music)]+=v
save('music',music)
print('已生成原创交互音效与环境音乐')
