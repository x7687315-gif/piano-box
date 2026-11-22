import test from 'node:test';
import assert from 'node:assert/strict';
import { PedalController, PEDAL } from '../src/core/pedal.js';

test('三踏板初始均关闭', () => {
  const p = new PedalController();
  assert.deepEqual(p.state, { soft: false, sostenuto: false, sustain: false });
});

test('sustain 按下：所有音符释放被延迟', () => {
  const p = new PedalController();
  p.set(PEDAL.SUSTAIN, true);
  assert.equal(p.deferRelease('v1'), PEDAL.SUSTAIN);
  assert.equal(p.deferRelease('v2'), PEDAL.SUSTAIN);
});

test('sustain 抬起：不再延迟', () => {
  const p = new PedalController();
  p.set(PEDAL.SUSTAIN, true);
  p.set(PEDAL.SUSTAIN, false);
  assert.equal(p.deferRelease('v1'), null);
});

test('sostenuto 只保持按下瞬间已响的音', () => {
  const p = new PedalController();
  p.set(PEDAL.SOSTENUTO, true, ['v1', 'v2']); // 当时响的是 v1/v2
  assert.equal(p.deferRelease('v1'), PEDAL.SOSTENUTO);
  assert.equal(p.deferRelease('v2'), PEDAL.SOSTENUTO);
  assert.equal(p.deferRelease('v3'), null, '之后弹的 v3 不受保持');
});

test('sostenuto 抬起清空保持集合', () => {
  const p = new PedalController();
  p.set(PEDAL.SOSTENUTO, true, ['v1']);
  p.set(PEDAL.SOSTENUTO, false);
  assert.equal(p.deferRelease('v1'), null);
});

test('soft 柔音降低力度系数，不影响释放', () => {
  const p = new PedalController();
  assert.equal(p.velocityScale(), 1);
  p.set(PEDAL.SOFT, true);
  assert.ok(p.velocityScale() < 1);
  assert.equal(p.deferRelease('v1'), null, '柔音不改变释放');
});

test('重复设置相同状态不改变', () => {
  const p = new PedalController();
  assert.equal(p.set(PEDAL.SUSTAIN, false), false);
  assert.equal(p.set(PEDAL.SUSTAIN, true), true);
  assert.equal(p.set(PEDAL.SUSTAIN, true), false);
});

test('sustain 与 sostenuto 同时按下，sustain 优先', () => {
  const p = new PedalController();
  p.set(PEDAL.SOSTENUTO, true, ['v1']);
  p.set(PEDAL.SUSTAIN, true);
  assert.equal(p.deferRelease('v1'), PEDAL.SUSTAIN);
});

test('reset 清空所有踏板状态', () => {
  const p = new PedalController();
  p.set(PEDAL.SUSTAIN, true);
  p.set(PEDAL.SOFT, true);
  p.reset();
  assert.deepEqual(p.state, { soft: false, sostenuto: false, sustain: false });
  assert.equal(p.deferRelease('v1'), null);
});
