import { useSyncExternalStore } from 'react';

/*
 * Chiptune sound effects for the landing page, synthesised with the Web Audio API
 * (no audio files). Off until the visitor turns them on; the choice is remembered
 * on this device. Browsers only allow audio after a click or key press, so the
 * audio context starts on the first such gesture.
 */

const STORAGE_KEY = 'rhuq-sfx';
const listeners = new Set<() => void>();
let enabled = readSetting();
let context: AudioContext | null = null;
let master: GainNode | null = null;
const lastPlayed = new Map<string, number>();

function readSetting(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

function audio(): AudioContext | null {
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      return null;
    }
    context = new Ctor();
    master = context.createGain();
    master.gain.value = 0.18;
    master.connect(context.destination);
  }
  if (context.state === 'suspended') {
    void context.resume();
  }
  return context;
}

/** Start (or resume) the audio context on the visitor's first click or key press. */
function unlockOnGesture(): void {
  const unlock = (): void => {
    if (enabled) {
      audio();
    }
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}
unlockOnGesture();

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Private mode or blocked storage: the setting just lasts for this visit.
  }
  if (on) {
    audio();
  }
  listeners.forEach((listener) => listener());
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => enabled,
  );
}

type Wave = OscillatorType;

/** One square/triangle note with an optional pitch slide and a short decay. */
function note(ctx: AudioContext, at: number, freq: number, duration: number, { wave = 'square' as Wave, slideTo = 0, volume = 1 } = {}): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, at);
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(slideTo, at + duration);
  }
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain).connect(master!);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

/** A burst of filtered noise: paper, air, engines. */
function noise(ctx: AudioContext, at: number, duration: number, { from = 1200, to = 1200, volume = 0.5 } = {}): void {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(from, at);
  filter.frequency.exponentialRampToValueAtTime(to, at + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(filter).connect(gain).connect(master!);
  source.start(at);
}

const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880, B5 = 987.77, C6 = 1046.5, E6 = 1318.5, G4 = 392, C4 = 261.63;

function fanfare(ctx: AudioContext, t: number): void {
  const tune: [number, number][] = [[G4, 0.12], [C5, 0.12], [E5, 0.12], [G5, 0.24], [E5, 0.12], [G5, 0.5]];
  let at = t;
  for (const [f, d] of tune) {
    note(ctx, at, f, d + 0.04, { volume: 0.45 });
    note(ctx, at, f / 2, d + 0.04, { wave: 'triangle', volume: 0.5 });
    at += d;
  }
}

const SOUNDS = {
  /** Picking up a coin. */
  coin: (ctx: AudioContext, t: number) => {
    note(ctx, t, B5, 0.07, { volume: 0.5 });
    note(ctx, t + 0.07, E6, 0.22, { volume: 0.5 });
  },
  /** The kiosk printing a ticket. */
  print: (ctx: AudioContext, t: number) => {
    for (let i = 0; i < 5; i++) {
      noise(ctx, t + i * 0.07, 0.05, { from: 2600, to: 1800, volume: 0.35 });
    }
    note(ctx, t + 0.38, C6, 0.12, { volume: 0.35 });
  },
  /** Reaching a new level. */
  level: (ctx: AudioContext, t: number) => {
    [C5, E5, G5, C6].forEach((f, i) => note(ctx, t + i * 0.07, f, 0.12, { volume: 0.4 }));
  },
  /** The announcement chime before a number is called. */
  call: (ctx: AudioContext, t: number) => {
    note(ctx, t, E5, 0.35, { wave: 'triangle', volume: 0.8 });
    note(ctx, t + 0.3, C5, 0.5, { wave: 'triangle', volume: 0.8 });
  },
  /** The clinic door creaking open. */
  door: (ctx: AudioContext, t: number) => {
    note(ctx, t, 180, 0.45, { wave: 'sawtooth', slideTo: 120, volume: 0.25 });
    note(ctx, t + 0.4, G5, 0.15, { volume: 0.3 });
  },
  /** Stage clear fanfare. */
  clear: fanfare,
  /** Moving the cursor on the character select screen. */
  select: (ctx: AudioContext, t: number) => note(ctx, t, A5, 0.06, { volume: 0.35 }),
  /** Confirming a choice. */
  confirm: (ctx: AudioContext, t: number) => {
    note(ctx, t, E5, 0.06, { volume: 0.4 });
    note(ctx, t + 0.06, B5, 0.14, { volume: 0.4 });
  },
  /** The patient hopping to the next stage on the map. */
  hop: (ctx: AudioContext, t: number) => note(ctx, t, 300, 0.14, { slideTo: 900, volume: 0.3 }),
  /** One second of the continue countdown. */
  tick: (ctx: AudioContext, t: number) => note(ctx, t, D5, 0.08, { volume: 0.3 }),
  /** The countdown running out. */
  over: (ctx: AudioContext, t: number) => {
    [G4, 349.23, 311.13, C4].forEach((f, i) => note(ctx, t + i * 0.16, f, 0.18, { wave: 'triangle', volume: 0.6 }));
  },
  /** Press start: signing in. */
  start: (ctx: AudioContext, t: number) => {
    [C5, G5, C6].forEach((f, i) => note(ctx, t + i * 0.06, f, 0.1, { volume: 0.45 }));
  },
  /** Wrong username or password. */
  error: (ctx: AudioContext, t: number) => {
    note(ctx, t, 140, 0.18, { wave: 'sawtooth', volume: 0.35 });
    note(ctx, t + 0.2, 110, 0.28, { wave: 'sawtooth', volume: 0.35 });
  },
  /** The ambulance hitting hyperspeed after sign-in. */
  boost: (ctx: AudioContext, t: number) => {
    note(ctx, t, 110, 1.1, { wave: 'sawtooth', slideTo: 880, volume: 0.25 });
    noise(ctx, t, 1.15, { from: 300, to: 4000, volume: 0.4 });
  },
  /** Arriving at the health unit. */
  arrive: fanfare,
} satisfies Record<string, (ctx: AudioContext, at: number) => void>;

export type SoundName = keyof typeof SOUNDS;

/** Play a sound if sound is on and the page is visible. Repeats of one sound are spaced at least `gap` ms apart. */
export function play(name: SoundName, gap = 60): void {
  if (!enabled || document.hidden) {
    return;
  }
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? -Infinity) < gap) {
    return;
  }
  const ctx = audio();
  if (!ctx || !master) {
    return;
  }
  lastPlayed.set(name, now);
  if (ctx.state === 'running') {
    SOUNDS[name](ctx, ctx.currentTime + 0.01);
  } else {
    // Just unlocked by this click: play as soon as the browser lets audio start.
    void ctx.resume().then(() => SOUNDS[name](ctx, ctx.currentTime + 0.01)).catch(() => undefined);
  }
}
