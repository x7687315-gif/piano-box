/**
 * MusicXML → 统一 Song（零运行时依赖，浏览器原生 DOMParser）。
 * 只取"发声相关"字段（MusicXML 的 MIDI-compatible part）：
 *   pitch(step/alter/octave)、duration + divisions、chord、tie、transpose、direction tempo。
 * 与 midi.js 一样：只产出 Song，播放引擎不接触本模块。
 *
 * 规范依据（musicxml.com 官方教程）：
 *   音高 midi = (octave+1)*12 + stepSemitone + alter + transpose   （C4=60, A4=69）
 *   时值 durationBeat = duration / divisions
 *   和弦 带 <chord> 的音符与前一个音符同起点
 *   连音 <tie type=start/stop> 合并同音高连续段
 *   移调乐器 <transpose><chromatic> 加到记谱音高得实音
 *
 * 用 getElementsByTagName 而非 querySelector，兼容浏览器 DOMParser 与测试用 xmldom。
 */
import { buildEvents, DEFAULT_BPM, makeSongId } from './song.js';

const STEP_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 解析 MusicXML 文本为 Song。
 * @param {string} xml MusicXML 文本（score-partwise 优先）
 * @param {string} [title] 覆盖标题
 * @param {Function} [ParserCtor] 自定义 DOMParser（测试用），默认取全局
 */
export function parseMusicXmlToSong(xml, title = '', ParserCtor = null) {
  const DP = ParserCtor || globalThis.DOMParser;
  if (!DP) throw new Error('当前环境缺少 DOMParser');
  let doc;
  try {
    const parser = new DP();
    if (typeof parser.parseFromString !== 'function') throw new Error('DOMParser 实现缺少 parseFromString');
    doc = parser.parseFromString(xml, 'application/xml');
  } catch (e) {
    throw new Error('MusicXML 格式错误：' + (e.message || String(e)).slice(0, 150));
  }
  const errs = doc.getElementsByTagName('parsererror');
  if (errs.length) throw new Error('MusicXML 格式错误：' + (errs[0].textContent || '').slice(0, 120));

  const root = doc.documentElement || doc;
  const t = pickText(root, ['movement-title', 'work-title']) || title || 'Untitled';

  // 全局 tempo：direction > metronome > per-minute，或 sound@tempo
  let bpm = DEFAULT_BPM;
  const dirs = root.getElementsByTagName('direction');
  outer: for (const d of dirs) {
    const pm = first(d, 'per-minute');
    if (pm) { const v = parseFloat(txt(pm)); if (v > 0) { bpm = Math.round(v); break outer; } }
    const snd = first(d, 'sound');
    if (snd && snd.getAttribute && snd.getAttribute('tempo')) {
      const v = parseFloat(snd.getAttribute('tempo'));
      if (v > 0) { bpm = Math.round(v); break outer; }
    }
  }

  const parts = [...root.getElementsByTagName('part')];
  const notes = [];
  const tracks = [];
  const partNames = collectPartNames(root);

  parts.forEach((part, trackId) => {
    const partId = part.getAttribute('id') || `P${trackId + 1}`;
    let divisions = 1;
    let transpose = 0;
    let cursorBeat = 0;
    let lastStartBeat = 0;
    const openTies = new Map(); // midi -> noteRef（跨段连音合并用）

    const measures = [...part.getElementsByTagName('measure')];
    for (const measure of measures) {
      // attributes：更新 divisions / transpose（可小节中途变化）
      for (const attr of [...measure.getElementsByTagName('attributes')]) {
        const dv = parseFloat(pickText(attr, ['divisions']));
        if (dv > 0) divisions = dv;
        const ch = pickText(attr, ['chromatic']); // transpose/chromatic
        if (ch !== '' && ch != null) transpose = parseInt(ch, 10) || 0;
      }

      for (const note of [...measure.getElementsByTagName('note')]) {
        const durRaw = parseFloat(pickText(note, ['duration']) || '0') || 0;
        const durBeats = durRaw / divisions;
        const isChord = note.getElementsByTagName('chord').length > 0;
        const pitchEl = first(note, 'pitch');

        // 休止符 / 无 pitch：只推进时间
        if (!pitchEl) {
          if (!isChord) { lastStartBeat = cursorBeat; cursorBeat += durBeats; }
          continue;
        }

        const step = pickText(pitchEl, ['step']) || 'C';
        const alter = parseFloat(pickText(pitchEl, ['alter']) || '0') || 0;
        const octave = parseInt(pickText(pitchEl, ['octave']) || '4', 10);
        const midi = Math.round(Math.max(0, Math.min(127,
          (octave + 1) * 12 + (STEP_SEMI[step] ?? 0) + alter + transpose
        )));
        const startBeat = isChord ? lastStartBeat : cursorBeat;
        const velocity = readVelocity(measure, note);

        const tieTypes = [...note.getElementsByTagName('tie')].map((e) => e.getAttribute('type'));
        if (tieTypes.includes('stop') && openTies.has(midi)) {
          // tie 连接段：延长前音时值，不新增音符
          openTies.get(midi).durationBeat += durBeats;
        } else {
          const n = {
            midi, velocity, startBeat,
            durationBeat: Math.max(1e-6, durBeats),
            channel: trackId, trackId,
          };
          notes.push(n);
          if (tieTypes.includes('start')) openTies.set(midi, n);
        }

        if (!isChord) { lastStartBeat = startBeat; cursorBeat += durBeats; }
      }
    }

    tracks.push({
      id: trackId,
      name: partNames[partId] || `Track ${trackId + 1}`,
      channel: trackId,
      instrument: { name: partNames[partId] || `Track ${trackId + 1}`, number: 0, percussion: false },
      noteCount: notes.filter((n) => n.trackId === trackId).length,
    });
  });

  const totalBeats = notes.reduce((m, n) => Math.max(m, n.startBeat + n.durationBeat), 0) || 4;
  const events = buildEvents(notes, totalBeats);
  return {
    id: makeSongId(),
    title: t, bpm, duration: totalBeats, ppq: 480,
    tempoMap: [{ tick: 0, bpm }], tracks, events,
    rawNoteCount: notes.length, source: 'musicxml',
  };
}

/** 力度：从最近的 <direction><dynamics> 标签近似映射，默认 0.8 */
function readVelocity(measure, note) {
  // MusicXML 力度是 direction 级、作用于后续音符；简化为扫描小节内 dynamics
  let v = 0.8;
  const dyn = measure.getElementsByTagName('dynamics');
  if (dyn.length) {
    const el = dyn[0];
    const map = { fff: 1, ff: 0.9, f: 0.8, mf: 0.7, mp: 0.6, p: 0.5, pp: 0.35, ppp: 0.2 };
    for (const key of Object.keys(map)) {
      if (el.getElementsByTagName(key).length) { v = map[key]; break; }
    }
  }
  return v;
}

function first(el, tag) { return el && el.getElementsByTagName(tag)[0]; }
function txt(el) { return el ? (el.textContent || '').trim() : ''; }
function pickText(el, tags) {
  for (const tag of tags) { const n = first(el, tag); if (n) return txt(n); }
  return '';
}
function collectPartNames(root) {
  const out = {};
  for (const sp of [...root.getElementsByTagName('score-part')]) {
    const id = sp.getAttribute('id');
    const pn = first(sp, 'part-name');
    if (id && pn) out[id] = txt(pn);
  }
  return out;
}
