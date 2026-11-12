/**
 * Spoken announcements for the wall monitor: a chime, then pre-recorded voice
 * clips played in sequence. Falls back to the browser's speech synthesis when
 * a clip is missing or audio is blocked.
 */
import { BASE } from './base';
let audioContext: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === 'suspended') {
      void audioContext.resume();
    }
  } catch {
    // WebAudio unavailable.
  }
}

function playChime(): void {
  unlockAudio();
  const ctx = audioContext;
  if (!ctx) {
    return;
  }
  const start = ctx.currentTime;
  [880, 941, 1046].forEach((frequency, i) => {
    const at = start + i * 0.22;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.6, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
    osc.start(at);
    osc.stop(at + 0.3);
  });
}

function speak(text: string): void {
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech not available.
  }
}

/** "R-012" -> letter_R, digit_0, digit_1, digit_2 */
export const spellParts = (code: string): string[] =>
  code.toUpperCase().split('').flatMap((ch) => (/[A-Z]/.test(ch) ? [`letter_${ch}`] : /[0-9]/.test(ch) ? [`digit_${ch}`] : []));

const NUMBER_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const DEPT_WORDS: Record<string, string> = { ADMISSION: 'admission', CLINIC: 'clinic', LABORATORY: 'laboratory', PHARMACY: 'pharmacy', DENTAL: 'dental', NUTRITION: 'nutrition', VETERINARY: 'veterinary', ABTC: 'abtc', WAITING: 'waiting', AREA: 'area' };

/** "CLINIC 1" -> dept_clinic, number_one; "TB-DOTS" -> dept_tb_dots */
export function deptParts(name: string): string[] {
  const upper = name.toUpperCase().trim();
  if (/TB.?DOTS/.test(upper)) {
    return ['dept_tb_dots'];
  }
  return upper.split(/[^A-Z0-9]+/).flatMap((word) => {
    if (DEPT_WORDS[word]) {
      return [`dept_${DEPT_WORDS[word]}`];
    }
    const n = Number(word);
    return Number.isInteger(n) && n >= 1 && n <= 10 ? [`number_${NUMBER_WORDS[n]}`] : [];
  });
}

const spellText = (code: string): string => code.toUpperCase().replace(/[^0-9A-Z]/g, '').split('').join(' ');

let playing: Promise<void> = Promise.resolve();

function playClips(parts: string[], fallbackText: string): Promise<void> {
  return new Promise((resolve) => {
    let index = 0;
    const next = (): void => {
      if (index >= parts.length) {
        resolve();
        return;
      }
      const audio = new Audio(`${BASE}/sound/voice/${parts[index++]}.mp3`);
      audio.onended = next;
      audio.onerror = () => {
        speak(fallbackText);
        resolve();
      };
      audio.play().catch(() => {
        speak(fallbackText);
        resolve();
      });
    };
    next();
  });
}

function announce(parts: string[], text: string): void {
  // Queue announcements so two serves in quick succession do not talk over each other.
  playing = playing.then(async () => {
    playChime();
    await new Promise((r) => setTimeout(r, 750));
    await playClips(parts, text);
  });
}

export function announceServe(queueNumber: string): void {
  announce(['now_serving', 'queue_number', ...spellParts(queueNumber)], `Now serving. Queue number ${spellText(queueNumber)}.`);
}

export function announceRepeat(queueNumber: string, target: string): void {
  const where = target ? ['please_proceed_to', ...deptParts(target)] : [];
  announce(['repeating_call', 'queue_number', ...spellParts(queueNumber), ...where], `Repeating call. Queue number ${spellText(queueNumber)}.${target ? ` Please proceed to ${target}.` : ''}`);
}

export function soundTest(): void {
  announce(['sound_test'], 'Sound test.');
}
