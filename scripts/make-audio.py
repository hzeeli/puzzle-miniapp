"""合成冲印室的纸张、金属与电钢音色，使用固定噪声种子复现素材。"""
from pathlib import Path
from subprocess import run

import numpy as np

OUT = Path(__file__).resolve().parents[1] / 'game/assets/audio'
OUT.mkdir(parents=True, exist_ok=True)
RATE = 24000
TWO_PI = 2 * np.pi
rng = np.random.default_rng(27)


def seconds(duration):
    return np.arange(round(duration * RATE)) / RATE


def note(frequency, duration, amplitude, attack=.009, decay=4, harmonic=.16):
    t = seconds(duration)
    envelope = np.minimum(1, t / attack) * np.minimum(1, (duration - t) / .045)
    envelope *= np.exp(-decay * t / duration)
    phase = TWO_PI * frequency * t
    return amplitude * envelope * (np.sin(phase) + harmonic * np.sin(phase * 2))


def arrange(notes, duration, repeat=False):
    track = np.zeros(round(duration * RATE))
    for at, sample in notes:
        start = round(at * RATE)
        indices = np.arange(start, start + len(sample))
        if repeat:
            track[indices % len(track)] += sample
        else:
            size = min(len(sample), len(track) - start)
            track[start:start + size] += sample[:size]
    return track


def chord(pitches, spacing, duration, amplitude):
    return arrange([(i * spacing, note(pitch, duration - i * spacing, amplitude))
                    for i, pitch in enumerate(pitches)], duration)


def paper(duration, weight):
    t = seconds(duration)
    noise = rng.normal(0, 1, len(t))
    rustle = np.convolve(noise, [.18, .42, .26, .14], mode='same')
    return rustle * np.sin(np.pi * t / duration) ** 2 * np.exp(-t * 18) * weight


def save(name, samples, bitrate='48k'):
    pcm = (np.tanh(samples) * 30000).astype('<i2')
    run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
         '-f', 's16le', '-ar', str(RATE), '-ac', '1', '-i', 'pipe:0',
         '-map_metadata', '-1', '-codec:a', 'libmp3lame', '-b:a', bitrate,
         str(OUT / (name + '.mp3'))], input=pcm.tobytes(), check=True)


save('tap', note(425, .10, .29, attack=.002, decay=5, harmonic=.48))
save('pickup', paper(.09, .35))
save('drop', paper(.13, .27) + note(158, .13, .27, attack=.003, decay=6))
save('pin-locked', note(194, .13, .30, attack=.002, decay=6, harmonic=.55))
save('unpin', chord([1320, 2077], .025, .19, .24))
save('merge', chord([523.25, 783.99], .065, .36, .32))
t = seconds(.28)
save('reveal', np.sin(TWO_PI * (515 * t + 390 * t*t)) * np.sin(np.pi*t/.28)**2 * .27
     + note(1046.5, .28, .14, attack=.06))
save('complete', chord([392, 493.88, 587.33, 739.99], .076, .78, .26))
save('combo-2', chord([493.88, 622.25, 739.99], .065, .39, .31))
save('combo-3', chord([554.37, 698.46, 830.61, 1108.73], .059, .47, .28))
save('win', chord([392, 493.88, 587.33, 783.99, 987.77], .102, 1.29, .26))

beat = 60 / 84
harmony = [[261.63, 329.63, 392, 493.88], [220, 261.63, 329.63, 392],
           [174.61, 220, 261.63, 329.63], [196, 246.94, 293.66, 392]]
score = []
for bar in range(16):
    pitches = harmony[(bar // 2) % len(harmony)]
    for step, degree in [(0, 0), (1.5, 2), (2.5, 1), (3.25, 3)]:
        frequency = pitches[degree] * (2 if degree == 3 and bar % 2 else 1)
        start = (bar * 4 + step) * beat
        sound = note(frequency, beat * 3, .22, attack=.035, decay=4.4)
        score.extend([(start, sound), (start + beat*.75, sound * .17)])
    score.append((bar * 4 * beat, note(pitches[0] / 2, beat * 3.7, .12, attack=.05)))
save('music', arrange(score, beat * 64, repeat=True), bitrate='32k')
