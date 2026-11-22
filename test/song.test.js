import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvents, nextIndex, beatToSeconds, clamp01 } from '../src/core/song.js';

test('beatToSeconds 用 60/bpm 换算', () => {
  assert.equal(beatToSeconds(2, 120), 1);
  assert.equal(beatToSeconds(1, 60), 1);
});

test('buildEvents 按 startBeat 排序', () => {
  const notes = [
    { midi: 60, velocity: 0.8, startBeat: 4, durationBeat: 1 },
    { midi: 62, velocity: 0.8, startBeat: 0, durationBeat: 1 },
    { midi: 64, velocity: 0.8, startBeat: 2, durationBeat: 1 },
  ];
  const ev = buildEvents(notes);
  assert.deepEqual(ev.map((e) => e.startBeat), [0, 2, 4]);
  assert.deepEqual(ev.map((e) => e.index), [0, 1, 2]);
});

test('buildEvents 把同一 beat 的音符合并为和弦', () => {
  const notes = [
    { midi: 60, velocity: 0.9, startBeat: 0, durationBeat: 1 },
    { midi: 64, velocity: 0.7, startBeat: 0, durationBeat: 2 },
    { midi: 67, velocity: 0.5, startBeat: 0, durationBeat: 1.5 },
  ];
  const ev = buildEvents(notes);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].notes.length, 3);
  assert.deepEqual(ev[0].notes.map((n) => n.midi), [60, 64, 67]);
  assert.equal(ev[0].durationBeat, 2); // 取最长
});

test('buildEvents 保留每个音符自己的 durationBeat 与 velocity', () => {
  const ev = buildEvents([
    { midi: 60, velocity: 0.9, startBeat: 0, durationBeat: 1 },
    { midi: 64, velocity: 0.3, startBeat: 0, durationBeat: 3 },
  ]);
  assert.equal(ev[0].notes[0].durationBeat, 1);
  assert.equal(ev[0].notes[1].durationBeat, 3);
  assert.equal(ev[0].notes[1].velocity, 0.3);
});

test('buildEvents 对空输入返回空数组', () => {
  assert.deepEqual(buildEvents([]), []);
  assert.deepEqual(buildEvents(null), []);
});

test('clamp01 把 velocity 限制在 0..1', () => {
  assert.equal(clamp01(1.5), 1);
  assert.equal(clamp01(-0.2), 0);
  assert.equal(clamp01(0.5), 0.5);
});

test('nextIndex 顺序推进', () => {
  assert.equal(nextIndex(-1, 5, false), 0);
  assert.equal(nextIndex(0, 5, false), 1);
  assert.equal(nextIndex(3, 5, false), 4);
});

test('nextIndex 到末尾不循环返回 null', () => {
  assert.equal(nextIndex(4, 5, false), null);
  assert.equal(nextIndex(9, 10, false), null);
});

test('nextIndex 到末尾循环回到 0', () => {
  assert.equal(nextIndex(4, 5, true), 0);
  assert.equal(nextIndex(9, 10, true), 0);
});

test('nextIndex 对空乐曲返回 null', () => {
  assert.equal(nextIndex(0, 0, true), null);
  assert.equal(nextIndex(-1, 0, false), null);
});
