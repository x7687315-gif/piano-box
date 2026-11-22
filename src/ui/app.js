/**
 * UI 组装层：把 MIDI 导入、轨道筛选、AudioEngine、SongPlayer、输入控制、可视化接起来。
 * 本层只负责"连线"与视觉，不含任何播放/解析核心逻辑。
 */
import * as Tone from 'tone';
import { parseMidiToSong } from '../core/midi.js';
import { filterSongByTracks, songStats } from '../core/song.js';
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

  // ---- 钢琴键盘渲染（C3..C6 两个多八度，足够高亮展示） ----
  const PIANO_LOW = 48, PIANO_HIGH = 84;
  const keyEls = new Map();
  function buildPiano() {
    const piano = $('piano');
    piano.innerHTML = '';
    const blackSet = new Set([1, 3, 6, 8, 10]);
    // 白键
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
    }
    // 黑键：定位在前一个白键右侧
    const whites = [...piano.querySelectorAll('.key.white')];
    for (let m = PIANO_LOW; m <= PIANO_HIGH; m++) {
      if (!blackSet.has(m % 12)) continue;
      let wi = 0;
      for (let p = m - 1; p >= PIANO_LOW; p--) {
        const idx = whites.findIndex((w) => +w.dataset.midi === p);
        if (idx >= 0) { wi = idx; break; }
      }
      const anchor = whites[wi];
      if (!anchor) continue;
      const k = document.createElement('div');
      k.className = 'key black';
      k.dataset.midi = m;
      const lbl = document.createElement('span');
      lbl.className = 'klabel';
      lbl.textContent = '';
      k.appendChild(lbl);
      // 用 anchor 的 offsetLeft + 宽度定位
      const pos = anchor.offsetLeft + anchor.offsetWidth;
      k.style.left = pos + 'px';
      piano.appendChild(k);
      keyEls.set(m, k);
    }
  }
  buildPiano();
  window.addEventListener('resize', () => { /* 布局用百分比，无需重排 */ });

  function clearHighlights() {
    for (const el of keyEls.values()) el.classList.remove('active');
  }
  function highlightNotes(notes) {
    clearHighlights();
    for (const n of notes) {
      // 移调到可见范围
      let m = n.midi ?? n;
      while (m < PIANO_LOW) m += 12;
      while (m > PIANO_HIGH) m -= 12;
      const el = keyEls.get(m);
      if (el) el.classList.add('active');
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
      wrap.appendChild(row);
    });
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
      if (ev) highlightNotes(ev.notes);
      document.querySelectorAll('.tl-row').forEach((r) => r.classList.remove('current'));
      const row = document.querySelector(`.tl-row[data-index="${index}"]`);
      if (row) {
        row.classList.add('current');
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

  // ---- 导入乐曲 ----
  async function importFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'mid' && ext !== 'midi') {
      banner('仅支持标准 MIDI 文件（.mid / .midi）', true);
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      rawSong = parseMidiToSong(buf, file.name.replace(/\.(mid|midi)$/i, ''));
      setupSong(rawSong);
      banner(`已导入：${rawSong.title}`);
    } catch (err) {
      console.error(err);
      banner('MIDI 文件解析失败：' + (err.message || '格式错误'), true);
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
    activeSong = filterSongByTracks(rawSong, ids);
    player.loadSong(activeSong, { bpm: +$('bpmSlider').value, loop: $('loopChk').checked });
    player.setBpm(+$('bpmSlider').value);
    renderTimeline(activeSong);
    updateVisual(-1, null);
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
