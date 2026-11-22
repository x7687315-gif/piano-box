/**
 * UI 组装层：把 MIDI 导入、轨道筛选、AudioEngine、SongPlayer、输入控制、可视化接起来。
 * 本层只负责"连线"与视觉，不含任何播放/解析核心逻辑。
 */
import * as Tone from 'tone';
import { parseMidiToSong } from '../core/midi.js';
import { parseMusicXmlToSong } from '../core/musicxml.js';
import { filterSongByTracks, songStats } from '../core/song.js';
import { transpose, scaleDuration, scaleVelocity, applyTransforms } from '../core/transform.js';
import { AudioEngine } from '../audio/engine.js';
import { SongPlayer } from '../player/song-player.js';
import { createMusicBoxInput } from '../input/music-box-input.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function noteName(midi) { return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1); }

const $ = (id) => document.getElementById(id);

export function createApp() {
  const engine = new AudioEngine();
  const player = new SongPlayer(engine);
  let rawSong = null;
  let activeSong = null;
  let mode = 'manual';
  // 变化性状态：记录待应用的变换参数（相对"轨道筛选后的基础曲"）
  let transformState = { semitones: 0, duration: 1, velocity: 1, scope: 'all', selected: new Set() };

  // ---- 状态提示 ----
  function banner(msg, isError = false) {
    const el = $('statusBanner');
    el.textContent = msg;
    el.className = 'status-banner' + (isError ? ' error' : '');
    el.hidden = false;
    if (!isError) setTimeout(() => { el.hidden = true; }, 3500);
  }
  engine.onStatus = (m) => { $('engineStatus').textContent = '引擎：' + m; };
  engine.onError = (m) => banner(m, true);

  // ---- 首次手势解锁音频 ----
  let initPromise = null;
  function ensureAudio() {
    if (!initPromise) {
      initPromise = engine.init().then(() => {
        $('engineStatus').textContent = '引擎：' + (engine.source === 'sampler' ? 'Salamander 采样' : '合成器');
      }).catch((err) => {
        // 初始化失败也不能吞掉演奏：标记完成并让后续 noteOn 走引擎内部兜底
        $('engineStatus').textContent = '引擎：初始化异常，尝试降级';
        console.warn('[app] audio init failed', err);
      });
    }
    return initPromise;
  }
  // 任意首次交互都尝试解锁（独立于弹琴逻辑，避免首次按键无声）
  ['pointerdown', 'keydown'].forEach((evt) =>
    window.addEventListener(evt, () => ensureAudio(), { once: true })
  );

  // ---- 钢琴键盘渲染：完整 88 键（A0=21 .. C8=108） ----
  // 界面琴键只是"可视化显示窗口"，音域由 MIDI 音高(0-127)决定，与画多少键无关。
  // 本地 30 个采样点 + Tone.Sampler 自动移调，覆盖全部 88 键。
  const PIANO_LOW = 21, PIANO_HIGH = 108;
  const WHITE_W = 26; // 每白键像素宽（可横向滚动）
  const keyEls = new Map();
  function buildPiano() {
    const piano = $('piano');
    piano.innerHTML = '';
    const blackSet = new Set([1, 3, 6, 8, 10]);
    // 白键：按顺序 flex 排列
    let whiteIndex = 0;
    const whitePos = new Map();
    for (let m = PIANO_LOW; m <= PIANO_HIGH; m++) {
      if (blackSet.has(m % 12)) continue;
      const k = document.createElement('div');
      k.className = 'key white';
      k.dataset.midi = m;
      const lbl = document.createElement('span');
      lbl.className = 'klabel';
      lbl.textContent = m % 12 === 0 ? noteName(m) : '';
      k.appendChild(lbl);
      piano.appendChild(k);
      keyEls.set(m, k);
      whitePos.set(m, whiteIndex * WHITE_W);
      whiteIndex++;
    }
    // 黑键：定位在前一个白键的右边界（跨前一个白键一半）
    piano.style.width = (whiteIndex * WHITE_W) + 'px';
    for (let m = PIANO_LOW; m <= PIANO_HIGH; m++) {
      if (!blackSet.has(m % 12)) continue;
      let anchorM = m - 1;
      while (anchorM >= PIANO_LOW && blackSet.has(anchorM % 12)) anchorM--;
      if (!whitePos.has(anchorM)) continue;
      const k = document.createElement('div');
      k.className = 'key black';
      k.dataset.midi = m;
      k.style.left = (whitePos.get(anchorM) + WHITE_W - 8) + 'px';
      piano.appendChild(k);
      keyEls.set(m, k);
    }
  }
  buildPiano();
  window.addEventListener('resize', () => { /* 键盘用固定像素宽，无需重排 */ });

  function clearHighlights() {
    for (const el of keyEls.values()) el.classList.remove('active', 'hint');
  }
  function highlightNotes(notes, nextNotes = []) {
    clearHighlights();
    let firstEl = null;
    // 新手引导：即将演奏的音符用描边提示（不与当前实心高亮冲突）
    const nextSet = new Set((nextNotes || []).map((n) => n.midi ?? n));
    for (const m of nextSet) {
      const el = keyEls.get(m);
      if (el && !notes.some((n) => (n.midi ?? n) === m)) el.classList.add('hint');
    }
    for (const n of notes) {
      const m = n.midi ?? n;
      const el = keyEls.get(m); // 完整 88 键，直接按真实音高定位，不移调
      if (el) {
        el.classList.remove('hint');
        el.classList.add('active');
        if (!firstEl) firstEl = el;
      }
    }
    // 自动滚动键盘容器，让当前音始终可见
    if (firstEl) {
      const wrap = $('piano').parentElement;
      const target = firstEl.offsetLeft - wrap.clientWidth / 2 + WHITE_W;
      wrap.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }
  }

  // ---- 音符时间线 ----
  function renderTimeline(song) {
    const wrap = $('timeline');
    wrap.innerHTML = '';
    if (!song.events.length) {
      wrap.innerHTML = '<div class="timeline-empty">乐曲没有可演奏的音符</div>';
      return;
    }
    const maxBeat = Math.max(1, song.duration);
    song.events.forEach((ev, i) => {
      const row = document.createElement('div');
      row.className = 'tl-row';
      row.dataset.index = i;
      const idx = document.createElement('span');
      idx.className = 'tl-index';
      idx.textContent = i + 1;
      const bar = document.createElement('div');
      bar.className = 'tl-bar';
      bar.style.width = Math.max(6, (ev.startBeat + ev.durationBeat) / maxBeat * 100) + '%';
      const fill = document.createElement('div');
      fill.className = 'fill';
      fill.style.width = Math.max(8, ev.durationBeat / (ev.startBeat + ev.durationBeat) * 100) + '%';
      bar.appendChild(fill);
      const note = document.createElement('span');
      note.className = 'tl-note';
      note.textContent = ev.notes.map((n) => noteName(n.midi)).join(' ');
      row.append(idx, bar, note);
      row.title = '点击选中/取消该事件，变化性控制将只作用于选中事件';
      row.addEventListener('click', () => {
        if (transformState.selected.has(i)) transformState.selected.delete(i);
        else transformState.selected.add(i);
        if (transformState.scope === 'selected') syncActiveSong();
        else updateTransformUI();
      });
      wrap.appendChild(row);
    });
    updateTransformUI();
  }

  function updateVisual(index, ev, audioTime) {
    const total = activeSong.events.length;
    $('eventCurrent').textContent = index >= 0 ? index + 1 : 0;
    $('eventTotal').textContent = total;
    const pct = total ? ((index + 1) / total) * 100 : 0;
    $('progressFill').style.width = pct + '%';
    $('progressText').textContent = index >= 0
      ? `正在演奏第 ${index + 1} / ${total} 个事件`
      : `已就绪 · 共 ${total} 个事件`;

    // 当前/即将音符
    const cur = ev ? ev.notes.map((n) => noteName(n.midi)) : [];
    $('currentNotes').innerHTML = cur.length
      ? cur.map((n) => `<span class="pill">${n}</span>`).join('')
      : '<span class="empty-pill">—</span>';
    const nextEv = activeSong.events[index + 1];
    const nxt = nextEv ? nextEv.notes.map((n) => noteName(n.midi)) : [];
    $('nextNotes').innerHTML = nxt.length
      ? nxt.map((n) => `<span class="pill next">${n}</span>`).join('')
      : '<span class="empty-pill">—</span>';

    // 高亮 + 时间线当前行：用 Tone.Draw 对齐音频时钟，避免音画不同步
    const paint = () => {
      // 未开播时（index<0）也把第一个事件作为"下一步"提示高亮
      const showIdx = index < 0 ? 0 : index;
      const showEv = index < 0 ? activeSong.events[0] : ev;
      const nextEvForHint = activeSong.events[showIdx + 1];
      if (showEv) highlightNotes(showEv.notes, nextEvForHint ? nextEvForHint.notes : []);
      document.querySelectorAll('.tl-row').forEach((r) => r.classList.remove('current', 'next-up'));
      const row = document.querySelector(`.tl-row[data-index="${showIdx}"]`);
      if (row) {
        row.classList.add(index < 0 ? 'next-up' : 'current');
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    };
    if (audioTime != null) Tone.getDraw().schedule(paint, audioTime);
    else paint();
  }

  // ---- 播放状态回调 ----
  player.onEvent = (index, ev, time) => updateVisual(index, ev, time);
  player.onState = (state) => {
    const map = { idle: '就绪', manual: '手动演奏中', playing: '自动播放中', paused: '已暂停', stopped: '已停止' };
    $('progressText').dataset.state = state;
    document.querySelectorAll('.transport-row .icon-btn').forEach((b) => b.classList.remove('active'));
    if (state === 'playing') $('playBtn').classList.add('active');
    if (state === 'paused') $('pauseBtn').classList.add('active');
    if (state === 'stopped') clearHighlights();
  };
  player.onEnd = () => banner('乐曲演奏结束');

  // ---- 导入乐曲（MIDI / MusicXML 双格式，统一进入 Song） ----
  async function importFile(file) {
    if (!file) return;
    const name = file.name;
    const ext = name.split('.').pop()?.toLowerCase();
    const baseTitle = name.replace(/\.(mid|midi|musicxml|xml|mxl)$/i, '');
    try {
      if (ext === 'mid' || ext === 'midi') {
        rawSong = parseMidiToSong(await file.arrayBuffer(), baseTitle);
      } else if (ext === 'musicxml' || ext === 'xml') {
        rawSong = parseMusicXmlToSong(await file.text(), baseTitle);
      } else {
        banner('仅支持 MIDI（.mid/.midi）或 MusicXML（.musicxml/.xml）', true);
        return;
      }
      // 导入新曲时清空变换状态，并同步滑块 UI 到默认（避免残留误导）
      transformState = { semitones: 0, duration: 1, velocity: 1, scope: 'all', selected: new Set() };
      $('transposeSlider').value = 0;
      $('durationSlider').value = 100;
      $('velocitySlider').value = 100;
      $('transposeValue').textContent = '0 半音';
      $('durationValue').textContent = '1.00×';
      $('velocityValue').textContent = '1.00×';
      const allRadio = document.querySelector('input[name="transformScope"][value="all"]');
      if (allRadio) { allRadio.checked = true; }
      setupSong(rawSong);
      // 新手引导：仅首次显示，关闭后记住
      let seen = false;
      try { seen = localStorage.getItem('pianobox-tip-seen') === '1'; } catch (_) {}
      if (!seen) $('beginnerTip').hidden = false;
      banner(`已导入 ${rawSong.source === 'musicxml' ? 'MusicXML' : 'MIDI'}：${rawSong.title}`);
    } catch (err) {
      console.error(err);
      banner('乐曲解析失败：' + (err.message || '格式错误'), true);
    }
  }

  function setupSong(song) {
    player.loadSong(song, { bpm: song.bpm, loop: $('loopChk').checked });
    $('bpmSlider').value = song.bpm;
    $('bpmValue').textContent = song.bpm;
    player.setBpm(song.bpm);

    $('songInfo').hidden = false;
    $('trackSection').hidden = false;
    $('controlsSection').hidden = false;
    $('songName').textContent = song.title;
    const stats = songStats(song);
    $('statDuration').textContent = stats.durationSeconds.toFixed(1) + 's';
    $('statBpm').textContent = song.bpm;
    $('statEvents').textContent = stats.eventCount;
    $('statNotes').textContent = stats.noteCount;

    // 轨道列表（排除 0 音符的 Conductor 轨）
    const list = $('trackList');
    list.innerHTML = '';
    const playable = song.tracks.filter((t) => t.noteCount > 0);
    playable.forEach((t) => {
      const label = document.createElement('label');
      label.className = 'track-item';
      label.innerHTML = `<input type="checkbox" value="${t.id}" checked /><span class="tname">${t.name}</span><span class="tcount">${t.noteCount} 音符</span>`;
      list.appendChild(label);
    });
    $('mergeTracks').checked = true;
    list.querySelectorAll('input').forEach((i) => (i.parentElement.classList.add('disabled')));
    syncActiveSong();
  }

  function syncActiveSong() {
    if (!rawSong) return;
    const merged = $('mergeTracks').checked;
    const ids = merged ? [] : [...$('trackList').querySelectorAll('input:checked')].map((i) => +i.value);
    // 基础曲 = 轨道筛选结果；在其上叠加变换，得到当前演奏曲
    const base = filterSongByTracks(rawSong, ids);
    const scope = transformState.scope === 'selected' && transformState.selected.size
      ? [...transformState.selected] : null;
    const ops = [];
    if (transformState.semitones) ops.push((s) => transpose(s, transformState.semitones, scope));
    if (transformState.duration !== 1) ops.push((s) => scaleDuration(s, transformState.duration, scope));
    if (transformState.velocity !== 1) ops.push((s) => scaleVelocity(s, transformState.velocity, scope));
    activeSong = applyTransforms(base, ops);

    player.loadSong(activeSong, { bpm: +$('bpmSlider').value, loop: $('loopChk').checked });
    player.setBpm(+$('bpmSlider').value);
    renderTimeline(activeSong);
    updateVisual(-1, null);
    updateTransformUI();
  }

  // ---- 变化性编辑 UI ----
  function updateTransformUI() {
    const tag = $('transformScopeTag');
    if (tag) {
      const n = transformState.selected.size;
      tag.textContent = transformState.scope === 'selected'
        ? (n ? `已选 ${n} 个事件` : '选中事件（未选）') : '全曲';
    }
    const badge = $('transformBadge');
    if (badge) {
      const active = transformState.semitones !== 0 || transformState.duration !== 1 || transformState.velocity !== 1;
      badge.textContent = active ? '已应用变换' : '原始';
      badge.className = 'transform-badge' + (active ? ' on' : '');
    }
    // 高亮选中的时间线行
    document.querySelectorAll('.tl-row').forEach((r) => {
      r.classList.toggle('selected', transformState.selected.has(+r.dataset.index));
    });
  }

  function applyTransformUI() {
    if (!rawSong) return;
    transformState.semitones = +$('transposeSlider').value;
    transformState.duration = +$('durationSlider').value / 100;
    transformState.velocity = +$('velocitySlider').value / 100;
    $('transposeValue').textContent = (transformState.semitones > 0 ? '+' : '') + transformState.semitones + ' 半音';
    $('durationValue').textContent = transformState.duration.toFixed(2) + '×';
    $('velocityValue').textContent = transformState.velocity.toFixed(2) + '×';
    syncActiveSong();
  }

  // ---- 文件交互 ----
  const dz = $('dropzone');
  dz.addEventListener('click', () => $('fileInput').click());
  dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.code === 'Space') $('fileInput').click(); });
  $('fileInput').addEventListener('change', (e) => {
    importFile(e.target.files[0]);
    e.target.value = '';
  });
  ['dragenter', 'dragover'].forEach((evt) => dz.addEventListener(evt, (e) => { e.preventDefault(); dz.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((evt) => dz.addEventListener(evt, (e) => { e.preventDefault(); dz.classList.remove('dragover'); }));
  dz.addEventListener('drop', (e) => importFile(e.dataTransfer.files[0]));
  $('changeSong').addEventListener('click', () => $('fileInput').click());
  $('tipClose').addEventListener('click', () => {
    $('beginnerTip').hidden = true;
    try { localStorage.setItem('pianobox-tip-seen', '1'); } catch (_) {}
  });

  // ---- 轨道选择 ----
  $('mergeTracks').addEventListener('change', (e) => {
    const merged = e.target.checked;
    $('trackList').querySelectorAll('input').forEach((i) => {
      i.disabled = merged;
      i.parentElement.classList.toggle('disabled', merged);
    });
    syncActiveSong();
  });
  $('trackList').addEventListener('change', () => { if (!$('mergeTracks').checked) syncActiveSong(); });

  // ---- 模式切换 ----
  $('modeSwitch').addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-btn');
    if (!btn || btn.disabled) return;
    const m = btn.dataset.mode;
    if (m === 'free') return;
    mode = m;
    document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
    player.setMode(m);
    $('manualControls').hidden = m !== 'manual';
    $('autoControls').hidden = m !== 'auto';
    updateVisual(-1, null);
  });

  // ---- 控制按钮 ----
  $('nextBtn').addEventListener('click', async () => { await ensureAudio(); player.nextEvent(); });
  $('playBtn').addEventListener('click', async () => { await ensureAudio(); player.play(); });
  $('pauseBtn').addEventListener('click', () => player.pause());
  $('resumeBtn').addEventListener('click', () => player.resume());
  $('stopBtn').addEventListener('click', () => { player.stop(); updateVisual(-1, null); });
  $('restartBtn').addEventListener('click', async () => { await ensureAudio(); player.restart(); });

  $('bpmSlider').addEventListener('input', (e) => {
    const v = +e.target.value;
    $('bpmValue').textContent = v;
    player.setBpm(v);
  });
  $('volumeSlider').addEventListener('input', (e) => {
    const v = +e.target.value;
    $('volumeValue').textContent = v + '%';
    player.setVolume(v / 100);
  });
  $('loopChk').addEventListener('change', (e) => player.setLoop(e.target.checked));

  // ---- 三踏板：按钮 + 功能键 F1/F2/F3（避开音乐盒"任意键=下一步"的字母键）----
  const pedalKeyMap = { F1: 'soft', F2: 'sostenuto', F3: 'sustain' };
  const pedalBtnMap = { soft: $('pedalSoft'), sostenuto: $('pedalSostenuto'), sustain: $('pedalSustain') };
  function setPedal(pedal, down) {
    engine.setPedal(pedal, down);
    const btn = pedalBtnMap[pedal];
    if (btn) btn.classList.toggle('down', down);
  }
  for (const [pedal, btn] of Object.entries(pedalBtnMap)) {
    // pointerdown/up 支持鼠标与触摸；松开/取消都抬起
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); setPedal(pedal, true); });
    btn.addEventListener('pointerup', () => setPedal(pedal, false));
    btn.addEventListener('pointercancel', () => setPedal(pedal, false));
    btn.addEventListener('pointerleave', () => setPedal(pedal, false));
  }
  window.addEventListener('keydown', (e) => {
    const pedal = pedalKeyMap[e.code];
    if (!pedal || e.repeat) return;
    e.preventDefault();
    setPedal(pedal, true);
  });
  window.addEventListener('keyup', (e) => {
    const pedal = pedalKeyMap[e.code];
    if (!pedal) return;
    e.preventDefault();
    setPedal(pedal, false);
  });
  window.addEventListener('blur', () => {
    for (const p of Object.keys(pedalBtnMap)) setPedal(p, false);
  });

  // ---- 变化性控件 ----
  const scopeRadios = document.querySelectorAll('input[name="transformScope"]');
  scopeRadios.forEach((r) => r.addEventListener('change', (e) => {
    transformState.scope = e.target.value;
    syncActiveSong();
  }));
  ['transposeSlider', 'durationSlider', 'velocitySlider'].forEach((id) => {
    $(id).addEventListener('input', applyTransformUI);
  });
  $('resetTransform').addEventListener('click', () => {
    transformState.semitones = 0;
    transformState.duration = 1;
    transformState.velocity = 1;
    transformState.selected.clear();
    $('transposeSlider').value = 0;
    $('durationSlider').value = 100;
    $('velocitySlider').value = 100;
    $('transposeValue').textContent = '0 半音';
    $('durationValue').textContent = '1.00×';
    $('velocityValue').textContent = '1.00×';
    syncActiveSong();
    banner('已重置所有变化');
  });

  // ---- 音乐盒键盘输入（独立控制层）----
  createMusicBoxInput({
    onTrigger: async () => {
      if (mode !== 'manual' || !activeSong) return;
      await ensureAudio();
      player.nextEvent();
    },
    isEnabled: () => mode === 'manual' && !!activeSong,
  });

  // 切后台释放所有音符，防 stuck notes
  document.addEventListener('visibilitychange', () => { if (document.hidden) engine.releaseAll(); });

  return { engine, player, getSong: () => activeSong };
}
