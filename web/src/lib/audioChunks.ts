/** Turning the sound of a meeting into small WAV pieces (16 kHz, mono) that the server can send to the speech-to-text service one by one. */

export const CHUNK_SECONDS = 300; // five minutes ≈ 9.6 MB of wav, far below the server's 24 MB limit
const RATE = 16000;

export function encodeWav(samples: Int16Array, rate = RATE): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  new Int16Array(buf, 44).set(samples);
  return new Blob([buf], { type: 'audio/wav' });
}

const toInt16 = (f: number) => Math.max(-1, Math.min(1, f)) * 0x7fff;

/** Records the microphone and hands over a WAV piece every CHUNK_SECONDS (and the rest when it stops), so the first pieces can be converted while the meeting goes on. */
export class PcmRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: ScriptProcessorNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private buf: number[] = [];
  private acc = 0;
  private accN = 0;
  private total = 0;
  constructor(private onChunk: (wav: Blob) => void) {}

  get seconds() { return Math.floor(this.total / RATE); }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    const ratio = this.ctx.sampleRate / RATE;
    this.src = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    let phase = 0;
    this.node.onaudioprocess = (e) => {
      const inp = e.inputBuffer.getChannelData(0);
      for (let i = 0; i < inp.length; i++) {
        this.acc += inp[i];
        this.accN++;
        phase += 1;
        if (phase >= ratio) {
          phase -= ratio;
          this.buf.push(toInt16(this.acc / this.accN));
          this.acc = 0;
          this.accN = 0;
          this.total++;
          if (this.buf.length >= RATE * CHUNK_SECONDS) this.flush();
        }
      }
    };
    this.src.connect(this.node);
    this.node.connect(this.ctx.destination); // the node writes silence; it must be connected for the browser to call it
  }

  private flush() {
    if (this.buf.length > RATE) this.onChunk(encodeWav(Int16Array.from(this.buf))); // under a second is only noise
    this.buf = [];
  }

  stop() {
    try { this.node?.disconnect(); this.src?.disconnect(); } catch { /* already closed */ }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => undefined);
    this.flush();
  }
}

export interface AudioPiece { blob: Blob; ext: 'wav' | 'mp3' }

/** A picked file: a small wav or mp3 goes as it is; anything else (m4a, ogg, a long file) is decoded and cut into WAV pieces. */
export async function fileToPieces(file: File): Promise<AudioPiece[]> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if ((ext === 'wav' || ext === 'mp3') && file.size <= 20 * 1024 * 1024) return [{ blob: file, ext }];
  if (file.size > 120 * 1024 * 1024) throw new Error('فایل بیش از ۱۲۰ مگابایت است؛ آن را در چند تکه بدهید.');
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx({ sampleRate: RATE });
  let audio: AudioBuffer;
  try {
    audio = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error('این فایل صوتی خوانده نشد؛ با فرمت mp3 یا wav امتحان کنید.');
  } finally {
    ctx.close().catch(() => undefined);
  }
  if (audio.duration > 3 * 3600) throw new Error('فایل بیش از سه ساعت است؛ آن را در چند تکه بدهید.');
  const ch = audio.numberOfChannels;
  const n = audio.length;
  const mono = new Int16Array(n);
  const data = Array.from({ length: ch }, (_, i) => audio.getChannelData(i));
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < ch; c++) s += data[c][i];
    mono[i] = toInt16(s / ch);
  }
  const step = Math.round(audio.sampleRate * CHUNK_SECONDS);
  const out: AudioPiece[] = [];
  for (let o = 0; o < n; o += step) out.push({ blob: encodeWav(mono.subarray(o, Math.min(n, o + step)), audio.sampleRate), ext: 'wav' });
  return out;
}
