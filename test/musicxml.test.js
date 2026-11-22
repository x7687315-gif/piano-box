import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { parseMusicXmlToSong } from '../src/core/musicxml.js';
import { filterSongByTracks } from '../src/core/song.js';

const demoPath = fileURLToPath(new URL('../fixtures/demo.musicxml', import.meta.url));
let song;
test.before(() => {
  song = parseMusicXmlToSong(fs.readFileSync(demoPath, 'utf8'), 'X', DOMParser);
});

test('解析标题与 BPM（metronome per-minute=90）', () => {
  assert.equal(song.title, 'MusicXML Demo');
  assert.equal(song.bpm, 90);
  assert.ok(song.duration > 0);
});

test('解析出两个轨道及名称/音符数', () => {
  assert.equal(song.tracks.length, 2);
  assert.deepEqual(song.tracks.map((t) => t.name), ['Piano', 'Violin']);
  assert.equal(song.tracks[0].noteCount, 5);
  assert.equal(song.tracks[1].noteCount, 1);
});

test('音高换算正确：step/alter/octave → MIDI（含降号）', () => {
  const p = filterSongByTracks(song, [1]); // Violin 轨：D♭4
  const midis = p.events.flatMap((e) => e.notes.map((n) => n.midi));
  assert.deepEqual(midis, [61]); // D=2半音, D♭=(4+1)*12+2-1=61
});

test('Piano 轨音高正确（C4=60, E4=64, G4=67, B4=71, C5=72）', () => {
  const p = filterSongByTracks(song, [0]);
  const midis = p.events.flatMap((e) => e.notes.map((n) => n.midi)).sort((a, b) => a - b);
  assert.deepEqual(midis, [60, 64, 67, 71, 72]);
});

test('divisions=2 时值换算：四分=1beat，八分=0.5beat', () => {
  const p = filterSongByTracks(song, [0]);
  const c4 = p.events.find((e) => e.notes.some((n) => n.midi === 60));
  const e4 = p.events.find((e) => e.notes.some((n) => n.midi === 64));
  assert.equal(c4.notes.find((n) => n.midi === 60).durationBeat, 1);
  assert.equal(e4.notes.find((n) => n.midi === 64).durationBeat, 0.5);
  assert.equal(e4.startBeat, 1); // C4 占 1 beat 后
});

test('和弦：<chord> 的 B4 与 G4 同起点聚合为一个事件', () => {
  const p = filterSongByTracks(song, [0]);
  const ev = p.events.find((e) => e.notes.some((n) => n.midi === 67));
  const midis = ev.notes.map((n) => n.midi).sort((a, b) => a - b);
  assert.deepEqual(midis, [67, 71]); // G4 + B4 同时
  assert.equal(ev.notes.length, 2);
});

test('连音 tie：两个 half C5 合并为一个 4beat 音符', () => {
  const p = filterSongByTracks(song, [0]);
  const c5s = p.events.flatMap((e) => e.notes).filter((n) => n.midi === 72);
  assert.equal(c5s.length, 1, 'tie 后只剩一个 C5 音符');
  assert.equal(c5s[0].durationBeat, 4); // 1+1? 实为两次 half 各 2beat 合并
});

test('事件按 startBeat 升序', () => {
  for (let i = 1; i < song.events.length; i++) {
    assert.ok(song.events[i].startBeat >= song.events[i - 1].startBeat);
  }
});

test('每个音符 midi/velocity/durationBeat 合法', () => {
  for (const ev of song.events) {
    for (const n of ev.notes) {
      assert.ok(n.midi >= 0 && n.midi <= 127);
      assert.ok(n.velocity > 0 && n.velocity <= 1);
      assert.ok(n.durationBeat > 0);
    }
  }
});

test('非法 XML 抛出格式错误', () => {
  assert.throws(() => parseMusicXmlToSong('<score-partwise><broken></score-partwise>', 'X', DOMParser), /格式错误/);
});

test('缺失 DOMParser 时给明确提示', () => {
  assert.throws(() => parseMusicXmlToSong('<x/>', 'X', class Fake {}), /DOMParser|格式错误/);
});

test('source 标记为 musicxml', () => {
  assert.equal(song.source, 'musicxml');
});
