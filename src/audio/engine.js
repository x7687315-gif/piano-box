/**
 * AudioEngine — 通用音频引擎，与任何输入模式/乐曲结构解耦。
 * 只暴露通用的 noteOn/noteOff/releaseAll/setVolume，两种演奏模式都调用它。
 *
 * 音源：本地 Salamander 采样（CC BY 3.0），Tone.Sampler 用 closest 移调覆盖全键盘。
 * 加载失败自动降级为 Tone.PolySynth（保证离线也能发声）。
 */
import * as Tone from 'tone';

// Salamander 基准音 → 采样文件名（与 public/samples 中 30 个 mp3 对应）
const SAMPLE_MAP = {
  A0: 'A0.mp3', A1: 'A1.mp3', A2: 'A2.mp3', A3: 'A3.mp3', A4: 'A4.mp3',
  A5: 'A5.mp3', A6: 'A6.mp3', A7: 'A7.mp3',
  C1: 'C1.mp3', C2: 'C2.mp3', C3: 'C3.mp3', C4: 'C4.mp3', C5: 'C5.mp3',
  C6: 'C6.mp3', C7: 'C7.mp3', C8: 'C8.mp3',
  'D#1': 'Ds1.mp3', 'D#2': 'Ds2.mp3', 'D#3': 'Ds3.mp3', 'D#4': 'Ds4.mp3',
  'D#5': 'Ds5.mp3', 'D#6': 'Ds6.mp3', 'D#7': 'Ds7.mp3',
  'F#1': 'Fs1.mp3', 'F#2': 'Fs2.mp3', 'F#3': 'Fs3.mp3', 'F#4': 'Fs4.mp3',
  'F#5': 'Fs5.mp3', 'F#6': 'Fs6.mp3', 'F#7': 'Fs7.mp3',
};

export class AudioEngine {
  constructor() {
    this.ready = false;
    this.sampler = null;
    this.fallback = null;
    this.master = null;
    this.volume = 0.7; // 0..1
    this.source = null; // 'sampler' | 'synth'
    this.activeVoices = new Map(); // key -> {midi, ...}
    this.onStatus = () => {};
    this.onError = () => {};
  }

  /** 首次用户手势中调用，解锁 AudioContext 并加载音源。 */
  async init() {
    if (this.ready) return;
    await Tone.start();
    this.master = new Tone.Volume(this._toDb(this.volume)).toDestination();
    try {
      this.sampler = new Tone.Sampler({
        urls: SAMPLE_MAP,
        baseUrl: `${import.meta.env.BASE_URL}samples/`,
        release: 1.2,
        onload: () => {},
      }).connect(this.master);
      // Tone.Sampler 没有显式加载完成 Promise，轮询 loaded 状态（最多 ~8s）
      await this._waitForSampler(this.sampler, 8000);
      this.source = 'sampler';
      this.onStatus('音源已加载：Salamander 钢琴采样');
    } catch (err) {
      console.warn('[AudioEngine] 采样加载失败，降级为合成器', err);
      this.sampler?.dispose();
      this.sampler = null;
      this.fallback = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.005, decay: 0.3, sustain: 0.25, release: 1.0 },
      }).connect(this.master);
      this.source = 'synth';
      this.onError('钢琴采样加载失败，已切换为合成器音色（功能不受影响）');
    }
    this.ready = true;
  }

  _waitForSampler(sampler, timeoutMs) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        try {
          if (sampler.loaded) return resolve();
        } catch (_) { /* ignore */ }
        if (Date.now() - start > timeoutMs) return reject(new Error('sampler load timeout'));
        setTimeout(check, 100);
      };
      check();
    });
  }

  _toDb(v) {
    if (v <= 0) return -Infinity;
    return 20 * Math.log10(v);
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v) || 0));
    if (this.master) this.master.volume.rampTo(this._toDb(this.volume), 0.05);
  }

  /** 触发一个音符。key 用于成对管理 noteOff（复音时互不干扰）。time 为音频时钟时间。 */
  noteOn(midi, velocity = 0.8, key = null, time = undefined) {
    if (!this.ready) return;
    const note = Tone.Frequency(midi, 'midi').toNote();
    const when = time ?? Tone.now();
    const id = key ?? `n_${midi}_${Math.random()}`;
    // 避免同一 key 重复 attack（长按/重复输入）
    if (this.activeVoices.has(id)) return;
    try {
      if (this.source === 'sampler' && this.sampler) {
        // velocity 通过动态增益近似：Sampler 本身不直接吃 velocity，用 volume 细分
        this.sampler.triggerAttack(note, when, Math.max(0.05, velocity));
      } else if (this.fallback) {
        this.fallback.triggerAttack(note, when, Math.max(0.05, velocity));
      }
      this.activeVoices.set(id, { midi, note });
    } catch (err) {
      console.warn('[AudioEngine] noteOn failed', err);
    }
  }

  /** 释放一个音符。key 必须与 noteOn 对应；不传 key 则释放该 midi 的所有 voice。 */
  noteOff(midi, key = null, time = undefined) {
    if (!this.ready) return;
    const when = time ?? Tone.now();
    const note = Tone.Frequency(midi, 'midi').toNote();
    if (key && this.activeVoices.has(key)) {
      this._releaseOne(key, note, when);
      return;
    }
    // 释放所有匹配 midi 的 voice
    for (const [id, v] of [...this.activeVoices]) {
      if (v.midi === midi) this._releaseOne(id, v.note, when);
    }
  }

  _releaseOne(id, note, when) {
    try {
      if (this.source === 'sampler' && this.sampler) {
        this.sampler.triggerRelease(note, when);
      } else if (this.fallback) {
        this.fallback.triggerRelease(note, when);
      }
    } catch (err) {
      console.warn('[AudioEngine] noteOff failed', err);
    }
    this.activeVoices.delete(id);
  }

  /** 立刻释放全部正在发声的音符（停止/换曲/切后台用，防 stuck notes）。 */
  releaseAll() {
    if (!this.ready) return;
    const when = Tone.now();
    for (const [id, v] of [...this.activeVoices]) {
      this._releaseOne(id, v.note, when);
    }
    try {
      if (this.fallback) this.fallback.releaseAll();
      if (this.sampler) this.sampler.releaseAll?.();
    } catch (_) { /* ignore */ }
  }

  dispose() {
    this.releaseAll();
    try { this.sampler?.dispose(); } catch (_) {}
    try { this.fallback?.dispose(); } catch (_) {}
    try { this.master?.dispose(); } catch (_) {}
    this.ready = false;
  }
}
