import test from 'node:test';
import assert from 'node:assert/strict';
import { transpose, scaleDuration, scaleVelocity, applyTransforms } from '../src/core/transform.js';
import { buildEvents } from '../src/core/song.js';

function makeSong() {
  const events = buildEvents([
    { midi: 60, velocity: 0.8, startBeat: 0, durationBeat: 1, trackId: 0 },
    { midi: 64, velocity: 0.6, startBeat: 0, durationBeat: 2, trackId: 0 },
    { midi: 67, velocity: 0.5, startBeat: 2, durationBeat: 1, trackId: 0 },
  ]);
  return { id: 'x', title: 'T', bpm: 120, duration: 3, ppq: 480, tracks: [{ id: 0, name: 't', noteCount: 3 }], events };
}

function allNotes(song) { return song.events.flatMap((e) => e.notes); }

test('transpose 全曲：所有音高 +12（一个八度）', () => {
  const out = transpose(makeSong(), 12);
  assert.deepEqual(allNotes(out).map((n) => n.midi), [72, 76, 79]);
});

test('transpose 负数：降低半音', () => {
  const out = transpose(makeSong(), -1);
  assert.deepEqual(allNotes(out).map((n) => n.midi), [59, 63, 66]);
});

test('transpose 不修改原曲（不可变）', () => {
  const song = makeSong();
  transpose(song, 12);
  assert.deepEqual(allNotes(song).map((n) => n.midi), [60, 64, 67]);
});

test('transpose clamp 到 0..127', () => {
  const song = makeSong();
  const hi = transpose(song, 200);
  assert.ok(allNotes(hi).every((n) => n.midi === 127));
  const lo = transpose(song, -200);
  assert.ok(allNotes(lo).every((n) => n.midi === 0));
});

test('transpose 仅选中事件：其余事件音高不变', () => {
  const song = makeSong();
  const out = transpose(song, 12, [0]); // 只移调 event 0
  const ev = out.events;
  assert.deepEqual(ev[0].notes.map((n) => n.midi), [72, 76]);
  assert.deepEqual(ev[1].notes.map((n) => n.midi), [67]);
});

test('transpose 0 半音返回原对象', () => {
  const song = makeSong();
  assert.equal(transpose(song, 0), song);
});

test('scaleDuration 全曲：时值翻倍，event 时长取最大', () => {
  const out = scaleDuration(makeSong(), 2);
  assert.deepEqual(allNotes(out).map((n) => n.durationBeat), [2, 4, 2]);
  assert.equal(out.events[0].durationBeat, 4); // 和弦事件取最长
});

test('scaleDuration 缩短', () => {
  const out = scaleDuration(makeSong(), 0.5);
  assert.deepEqual(allNotes(out).map((n) => n.durationBeat), [0.5, 1, 0.5]);
});

test('scaleDuration 仅选中事件', () => {
  const out = scaleDuration(makeSong(), 2, [1]);
  assert.deepEqual(allNotes(out).map((n) => n.durationBeat), [1, 2, 2]);
  assert.equal(out.events[1].durationBeat, 2);
});

test('scaleVelocity 增强并 clamp 到 1', () => {
  const out = scaleVelocity(makeSong(), 2);
  assert.deepEqual(allNotes(out).map((n) => n.velocity), [1, 1, 1]);
});

test('scaleVelocity 减弱', () => {
  const out = scaleVelocity(makeSong(), 0.5);
  assert.deepEqual(allNotes(out).map((n) => n.velocity), [0.4, 0.3, 0.25]);
});

test('scaleVelocity 非法系数原样返回', () => {
  const song = makeSong();
  assert.equal(scaleVelocity(song, 0), song);
  assert.equal(scaleVelocity(song, -1), song);
  assert.equal(scaleVelocity(song, 'abc'), song);
});

test('applyTransforms 按顺序叠加', () => {
  const song = makeSong();
  const out = applyTransforms(song, [
    (s) => transpose(s, 12),
    (s) => scaleDuration(s, 2),
    (s) => scaleVelocity(s, 0.5),
  ]);
  const ev0 = out.events[0];
  assert.deepEqual(ev0.notes.map((n) => n.midi), [72, 76]);
  assert.deepEqual(ev0.notes.map((n) => n.durationBeat), [2, 4]);
  assert.deepEqual(ev0.notes.map((n) => n.velocity), [0.4, 0.3]);
});

test('变换后保持事件数和时序结构', () => {
  const song = makeSong();
  const out = applyTransforms(song, [(s) => transpose(s, 7), (s) => scaleDuration(s, 1.5)]);
  assert.equal(out.events.length, song.events.length);
  assert.deepEqual(out.events.map((e) => e.startBeat), song.events.map((e) => e.startBeat));
  assert.deepEqual(out.events.map((e) => e.notes.length), song.events.map((e) => e.notes.length));
});
