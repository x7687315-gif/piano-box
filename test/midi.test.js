import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseMidiToSong } from '../src/core/midi.js';
import { filterSongByTracks, songStats } from '../src/core/song.js';

const demoPath = fileURLToPath(new URL('../fixtures/demo.mid', import.meta.url));
let song;
test.before(() => {
  if (!fs.existsSync(demoPath)) {
    // fixture 未生成时用生成器逻辑内联生成
    throw new Error('fixtures/demo.mid 不存在，请先运行 npm run fixture');
  }
  song = parseMidiToSong(fs.readFileSync(demoPath), 'Demo Song');
});

test('解析出正确的元信息：bpm/ppq/duration', () => {
  assert.equal(song.bpm, 120);
  assert.equal(song.ppq, 480);
  assert.ok(song.duration > 0);
  assert.equal(song.title, 'Demo Song');
});

test('MIDI 内嵌 tempo（setTempo）被正确解析为 BPM 与分段 tempoMap', () => {
  // midi-file 把 setTempo 放在 track 内，字段 microsecondsPerBeat，tick 由 deltaTime 累积
  // 用内联构造的最小 SMF：tempo=90（us=666667），PPQ=480
  const VLQ = (n) => { const b = [n & 0x7f]; n >>= 7; while (n) { b.unshift((n & 0x7f) | 0x80); n >>= 7; } return Buffer.from(b); };
  const us = Math.round(60e6 / 90);
  const trk = Buffer.concat([
    VLQ(0), Buffer.from([0xFF, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255]),
    VLQ(0), Buffer.from([0xFF, 0x2F, 0x00]),
  ]);
  const hdr = Buffer.alloc(6); hdr.writeUInt16BE(1, 0); hdr.writeUInt16BE(1, 2); hdr.writeUInt16BE(480, 4);
  const hdrLen = Buffer.alloc(4); hdrLen.writeUInt32BE(6);
  const len = Buffer.alloc(4); len.writeUInt32BE(trk.length);
  const smf = Buffer.concat([Buffer.from('MThd'), hdrLen, hdr, Buffer.from('MTrk'), len, trk]);
  const s = parseMidiToSong(smf, 'Tempo Test');
  assert.equal(s.bpm, 90, 'BPM 应从 setTempo 读取，而非固定 120');
  assert.deepEqual(s.tempoMap, [{ tick: 0, bpm: 90 }]);
});

test('解析出全部轨道及每轨音符数', () => {
  assert.equal(song.tracks.length, 3); // Conductor + Melody + Chords
  const melody = song.tracks.find((t) => t.name === 'Melody');
  const chords = song.tracks.find((t) => t.name === 'Chords');
  assert.equal(melody.noteCount, 5);
  assert.equal(chords.noteCount, 6);
});

test('同一 startBeat 的音符被聚合为一个事件（保留和弦）', () => {
  const ev0 = song.events.find((e) => e.startBeat === 0);
  assert.ok(ev0, '应存在 beat 0 的事件');
  assert.ok(ev0.notes.length >= 4, 'beat 0 应有旋律 + 三和弦共 4 个音');
  const midis = ev0.notes.map((n) => n.midi);
  assert.ok(midis.includes(48) && midis.includes(52) && midis.includes(55));
  assert.ok(midis.includes(60));
});

test('事件按 startBeat 升序排列', () => {
  for (let i = 1; i < song.events.length; i++) {
    assert.ok(song.events[i].startBeat >= song.events[i - 1].startBeat);
  }
});

test('每个音符都有合法 midi/velocity/durationBeat', () => {
  for (const ev of song.events) {
    for (const n of ev.notes) {
      assert.ok(n.midi >= 0 && n.midi <= 127);
      assert.ok(n.velocity >= 0 && n.velocity <= 1);
      assert.ok(n.durationBeat > 0);
    }
  }
});

test('统计信息正确', () => {
  const stats = songStats(song);
  assert.equal(stats.eventCount, song.events.length);
  assert.equal(stats.noteCount, song.rawNoteCount);
  assert.ok(stats.minMidi <= stats.maxMidi);
});

test('按轨道筛选：只选 Chords 轨，事件只剩和弦音', () => {
  const chords = song.tracks.find((t) => t.name === 'Chords');
  const filtered = filterSongByTracks(song, [chords.id]);
  const ev0 = filtered.events.find((e) => e.startBeat === 0);
  const midis = ev0.notes.map((n) => n.midi).sort((a, b) => a - b);
  assert.deepEqual(midis, [48, 52, 55]); // 只剩三和弦，无旋律 60
  assert.ok(filtered.events.every((e) => e.notes.every((n) => n.trackId === chords.id)));
});

test('合并轨道（空选择）包含全部音符', () => {
  const merged = filterSongByTracks(song, []);
  assert.equal(merged.merged, true);
  assert.equal(merged.events.flatMap((e) => e.notes).length, song.rawNoteCount);
});
