import test from 'node:test';
import assert from 'node:assert/strict';
import { SongPlayer } from '../src/player/song-player.js';
import { buildEvents } from '../src/core/song.js';

// 用 mock engine 测试状态机（不依赖 Tone.js 的音频上下文）
class MockEngine {
  constructor() { this.calls = []; this.ready = true; }
  noteOn(midi, vel, key, time) { this.calls.push(['on', midi, key]); }
  noteOff(midi, key, time) { this.calls.push(['off', midi, key]); }
  releaseAll() { this.calls.push(['releaseAll']); }
  setVolume() {}
}

function makeSong() {
  const events = buildEvents([
    { midi: 60, velocity: 0.9, startBeat: 0, durationBeat: 1, trackId: 0 },
    { midi: 64, velocity: 0.8, startBeat: 0, durationBeat: 1, trackId: 0 },
    { midi: 67, velocity: 0.7, startBeat: 1, durationBeat: 1, trackId: 0 },
    { midi: 72, velocity: 0.6, startBeat: 2, durationBeat: 1, trackId: 0 },
  ]);
  return { id: 'x', title: 'T', bpm: 120, duration: 3, ppq: 480, tracks: [{ id: 0, name: 't', noteCount: 4 }], events };
}

test('loadSong 后状态为 idle，currentIndex=-1', () => {
  const p = new SongPlayer(new MockEngine());
  p.loadSong(makeSong(), { bpm: 120, loop: false });
  assert.equal(p.state, 'idle');
  assert.equal(p.currentIndex, -1);
});

test('手动 nextEvent 顺序推进并触发 onEvent', () => {
  const p = new SongPlayer(new MockEngine());
  const seen = [];
  p.onEvent = (idx) => seen.push(idx);
  p.loadSong(makeSong());
  p.setMode('manual');
  p.nextEvent();
  p.nextEvent();
  p.nextEvent();
  assert.deepEqual(seen, [0, 1, 2]);
  assert.equal(p.currentIndex, 2);
});

test('手动 nextEvent 每次同时 noteOn 和弦的所有音', () => {
  const eng = new MockEngine();
  const p = new SongPlayer(eng);
  p.loadSong(makeSong());
  p.setMode('manual');
  p.nextEvent(); // ev0 有两个音
  const ons = eng.calls.filter((c) => c[0] === 'on');
  assert.equal(ons.length, 2);
  assert.deepEqual(ons.map((c) => c[1]).sort(), [60, 64]);
  const offs = eng.calls.filter((c) => c[0] === 'off');
  assert.equal(offs.length, 2, '每个音符都有对应 noteOff');
});

test('手动到末尾不循环：触发 onEnd，状态 stopped，index 不变', () => {
  const p = new SongPlayer(new MockEngine());
  let ended = 0;
  p.onEnd = () => ended++;
  p.loadSong(makeSong());
  p.setMode('manual');
  p.nextEvent(); p.nextEvent(); p.nextEvent(); // 0,1,2
  p.nextEvent(); // 超出 -> end
  assert.equal(ended, 1);
  assert.equal(p.state, 'stopped');
  assert.equal(p.currentIndex, 2);
});

test('手动到末尾循环：回到 0 继续', () => {
  const p = new SongPlayer(new MockEngine());
  const seen = [];
  p.onEvent = (i) => seen.push(i);
  p.loadSong(makeSong());
  p.setMode('manual');
  p.setLoop(true);
  for (let i = 0; i < 5; i++) p.nextEvent();
  assert.deepEqual(seen, [0, 1, 2, 0, 1]);
});

test('自动模式下 nextEvent 不生效（模式隔离）', () => {
  const p = new SongPlayer(new MockEngine());
  p.loadSong(makeSong());
  p.setMode('auto');
  p.nextEvent();
  assert.equal(p.currentIndex, -1);
});

test('空乐曲 nextEvent 不崩溃', () => {
  const p = new SongPlayer(new MockEngine());
  p.loadSong({ ...makeSong(), events: [] });
  p.setMode('manual');
  assert.doesNotThrow(() => p.nextEvent());
});

test('setBpm 限制在 20..300', () => {
  const p = new SongPlayer(new MockEngine());
  p.setBpm(5); assert.equal(p.bpm, 20);
  p.setBpm(999); assert.equal(p.bpm, 300);
  p.setBpm(140); assert.equal(p.bpm, 140);
});
