import { useEffect, useRef, useState } from "react";

class CalmVoice {
  private context?: AudioContext;
  private buffers?: Promise<AudioBuffer[]>;
  private playing = new Set<AudioBufferSourceNode>();
  private version = 0;

  async unlock() {
    try {
      const context = this.context ??= new AudioContext();
      await context.resume();
      this.buffers ??= Promise.all(Array.from({ length: 5 }, async (_, i) => {
        const response = await fetch(`/assets/rocky/calm/calm_${i + 1}.wav`);
        if (!response.ok) throw new Error("Calm sample unavailable");
        return context.decodeAudioData(await response.arrayBuffer());
      })).catch(() => {
        this.buffers = undefined;
        return [];
      });
    } catch {
      // Audio is optional when browser policy or hardware prevents playback.
    }
  }

  async blip(letter: string, questionLift = 0) {
    const version = this.version;
    const requested = performance.now();
    const context = this.context;
    const buffers = await this.buffers;
    if (!context || context.state !== "running" || !buffers?.length ||
      version !== this.version || performance.now() - requested > 160) return;
    const code = letter.toLowerCase().codePointAt(0)!;
    const source = context.createBufferSource();
    const volume = context.createGain();
    source.buffer = buffers[code % buffers.length];
    // Calm preset: deterministic syllable choice and two semitones of pitch spread.
    source.playbackRate.value = 2 ** (((code * 7) % 5 - 2 + questionLift) / 12);
    volume.gain.value = 0.22;
    source.connect(volume).connect(context.destination);
    this.playing.add(source);
    source.onended = () => {
      this.playing.delete(source);
      source.disconnect();
      volume.disconnect();
    };
    source.start();
  }

  stop() {
    this.version++;
    for (const source of this.playing) source.stop();
    this.playing.clear();
  }
}

export const calmVoice = new CalmVoice();

export function useDialogueReveal(text: string, gradual: boolean, sound: boolean) {
  const [visible, setVisible] = useState(0);
  const soundEnabled = useRef(sound);
  useEffect(() => { soundEnabled.current = sound; }, [sound]);

  useEffect(() => {
    if (!gradual || !text) return;
    const letters = Array.from(text);
    const stride = Math.max(1, Math.ceil(letters.length / 720));
    const questionStart = /\?$/.test(text) ? text.trimEnd().lastIndexOf(" ") + 1 : Infinity;
    let i = 0, count = 0, next: ReturnType<typeof setTimeout>;
    let due = performance.now() + 25;
    setVisible(0);
    function advance() {
      let voice = "";
      const now = performance.now();
      while (i < letters.length && due <= now) {
        for (let end = Math.min(i + stride, letters.length); i < end; i++) {
          if (/\p{L}|\p{N}/u.test(letters[i]) && count++ % 2 === 0) voice = letters[i];
        }
        due += /[.!?]/.test(letters[i - 1]) ? 100 : 25;
      }
      setVisible(i);
      if (soundEnabled.current && voice) void calmVoice.blip(voice, i > questionStart ? 2 : 0);
      if (i < letters.length) next = setTimeout(advance, Math.max(1, due - performance.now()));
    }
    next = setTimeout(advance, 25);
    return () => { clearTimeout(next); calmVoice.stop(); };
  }, [text, gradual]);

  const letters = Array.from(text);
  return gradual ? letters.slice(0, visible).join("") : text;
}
