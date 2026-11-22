/**
 * 生成测试用 MIDI 文件（无第三方依赖，手写 SMF 格式）。
 * 包含：一条旋律轨 + 一条和弦轨，用于验证解析/和弦分组/轨道筛选。
 * 用法：node fixtures/make-midi.mjs [output.mid]
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const output = process.argv[2] || fileURLToPath(new URL('./demo.mid', import.meta.url));
const PPQ = 480;

function vlq(n) {
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) { bytes.unshift((n & 0x7f) | 0x80); n >>= 7; }
  return Buffer.from(bytes);
}
function noteOn(note, vel, delta) { return Buffer.concat([vlq(delta), Buffer.from([0x90, note, vel])]); }
function noteOff(note, delta) { return Buffer.concat([vlq(delta), Buffer.from([0x80, note, 0x00])]); }
function tempo(bpm, delta) {
  const us = Math.round(60_000_000 / bpm);
  return Buffer.concat([vlq(delta), Buffer.from([0xff, 0x51, 0x03, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff])]);
}
function trackName(name) {
  const b = Buffer.from(name, 'utf8');
  return Buffer.concat([vlq(0), Buffer.from([0xff, 0x03]), vlq(b.length), b]);
}
function endTrack() { return Buffer.from([0x00, 0xff, 0x2f, 0x00]); }

function buildTrack(name, events) {
  return Buffer.concat([trackName(name), ...events, endTrack()]);
}

// Tempo/meta track
const tempoTrack = buildTrack('Conductor', [tempo(120, 0)]);
// Melody: C4 D4 E4 G4 (each 1 beat), then rest, then high C5
const melodyEvents = [];
[[60, 0], [62, PPQ], [64, PPQ], [67, PPQ], [72, PPQ * 2]].forEach(([note, delta], i, arr) => {
  melodyEvents.push(noteOn(note, 100, delta));
  // note length: 1 beat except last = 2 beats
  const len = i === arr.length - 1 ? PPQ * 2 : PPQ;
  melodyEvents.push(noteOff(note, len));
});
const melodyTrack = buildTrack('Melody', melodyEvents);

// Chords: C major triad at beat 0 (1.5 beats), then G major triad at beat 2 (2 beats)
// noteOn all three at same tick -> must group into one event with 3 notes
const chordEvents = [
  noteOn(48, 80, 0), noteOn(52, 80, 0), noteOn(55, 80, 0),
  noteOff(48, PPQ * 1.5), noteOff(52, 0), noteOff(55, 0),
  noteOn(55, 80, PPQ * 0.5), noteOn(59, 80, 0), noteOn(62, 80, 0),
  noteOff(55, PPQ * 2), noteOff(59, 0), noteOff(62, 0),
];
const chordTrack = buildTrack('Chords', chordEvents);

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([Buffer.from(type, 'ascii'), len, data]);
}
const header = Buffer.alloc(6);
header.writeUInt16BE(1, 0); // format 1
header.writeUInt16BE(3, 2); // 3 tracks
header.writeUInt16BE(PPQ, 4);
const smf = Buffer.concat([
  chunk('MThd', header),
  chunk('MTrk', tempoTrack),
  chunk('MTrk', melodyTrack),
  chunk('MTrk', chordTrack),
]);
fs.writeFileSync(output, smf);
console.log(`Wrote ${output} (${smf.length} bytes)`);
