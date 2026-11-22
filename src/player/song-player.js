/**
 * SongPlayer — 播放控制层。手动转轴与自动转轴共用同一 Song + 同一 AudioEngine。
 * 只做"何时触发哪个 event"的调度，不碰键盘事件、不碰 MIDI 解析。
 *
 * 状态：idle | manual | playing | paused | stopped
 * 回调 onEvent(eventIndex, event) / onState(state) / onEnd()
 */
import * as Tone from 'tone';
import { beatToSeconds, nextIndex } from '../core/song.js';

export class SongPlayer {
  constructor(engine) {
    this.engine = engine;
    this.song = null;
    this.mode = 'manual';        // 'manual' | 'auto'
    this.state = 'idle';
    this.currentIndex = -1;
    this.loop = false;
    this.bpm = 120;
    this.volume = 0.7;
    this.onEvent = () => {};
    this.onState = () => {};
    this.onEnd = () => {};
    this._scheduled = [];        // 自动模式排程的 Tone 事件 id
  }

  loadSong(song, { bpm, loop } = {}) {
    this.stop({ silent: true });
    this.song = song;
    this.bpm = bpm ?? song.bpm ?? 120;
    if (typeof loop === 'boolean') this.loop = loop;
    this.currentIndex = -1;
    this._setState('idle');
  }

  setMode(mode) {
    this.stop({ silent: true });
    this.mode = mode === 'auto' ? 'auto' : 'manual';
  }

  setBpm(bpm) {
    this.bpm = Math.max(20, Math.min(300, Number(bpm) || 120));
    if (this.state === 'playing' && this.mode === 'auto') {
      Tone.getTransport().bpm.value = this.bpm;
    }
  }

  setVolume(v) {
    this.volume = v;
    this.engine.setVolume(v);
  }

  setLoop(v) {
    this.loop = !!v;
  }

  /** 手动模式：触发下一个 event。任意键都调用它。 */
  nextEvent() {
    if (!this.song || this.song.events.length === 0) return;
    if (this.mode !== 'manual') return;
    const total = this.song.events.length;
    const idx = nextIndex(this.currentIndex, total, this.loop);
    if (idx === null) {
      this._setState('stopped');
      this.onEnd();
      return;
    }
    this.currentIndex = idx;
    const ev = this.song.events[idx];
    this._playEvent(ev, Tone.now());
    this.onEvent(idx, ev);
    if (this.state !== 'manual') this._setState('manual');
  }

  /** 自动模式：从头开始播放。 */
  play() {
    if (!this.song || this.song.events.length === 0) return;
    if (this.mode !== 'auto') return;
    this.stop({ silent: true });
    const t = Tone.getTransport();
    t.bpm.value = this.bpm;
    t.position = 0;
    this._setState('playing');

    for (const ev of this.song.events) {
      const startSec = beatToSeconds(ev.startBeat, this.bpm);
      const id = t.scheduleOnce((time) => {
        this._playEvent(ev, time);
        // 视觉同步：回调里只发信号，UI 用 Tone.Draw 对齐（由 UI 层处理）
        this.onEvent(ev.index, ev, time);
      }, startSec);
      this._scheduled.push(id);
    }

    const endSec = beatToSeconds(this.song.duration + 1, this.bpm);
    const endId = t.scheduleOnce(() => {
      if (this.loop) {
        this.restart();
      } else {
        this.stop();
        this.onEnd();
      }
    }, endSec);
    this._scheduled.push(endId);

    t.start('+0.1');
  }

  pause() {
    if (this.state === 'playing' && this.mode === 'auto') {
      Tone.getTransport().pause();
      this.engine.releaseAll();
      this._setState('paused');
    }
  }

  resume() {
    if (this.state === 'paused' && this.mode === 'auto') {
      Tone.getTransport().start();
      this._setState('playing');
    }
  }

  /** 从头开始（自动模式下重新播放；手动模式重置指针）。 */
  restart() {
    if (!this.song) return;
    if (this.mode === 'auto') {
      this.play();
    } else {
      this.currentIndex = -1;
      this._setState('idle');
    }
  }

  stop({ silent = false } = {}) {
    const t = Tone.getTransport();
    try { t.stop(); } catch (_) {}
    try { t.cancel(0); } catch (_) {}
    for (const id of this._scheduled) {
      try { t.clear(id); } catch (_) {}
    }
    this._scheduled = [];
    this.engine.releaseAll();
    if (!silent) {
      this.currentIndex = -1;
      this._setState('stopped');
    }
  }

  /** 核心：在给定音频时钟时间播放一个 event（和弦同时发声，按各自 duration 释放）。 */
  _playEvent(ev, time) {
    if (!ev || !ev.notes || ev.notes.length === 0) return;
    const secPerBeat = 60 / this.bpm;
    for (const n of ev.notes) {
      const key = `e${ev.index}_t${n.trackId ?? 0}_m${n.midi}`;
      const durSec = Math.max(0.03, n.durationBeat * secPerBeat);
      this.engine.noteOn(n.midi, n.velocity, key, time);
      this.engine.noteOff(n.midi, key, time + durSec);
    }
  }

  _setState(s) {
    this.state = s;
    this.onState(s);
  }
}
