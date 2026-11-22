# piano-box 设计方案

> 版本 v1.0 · 2026-11-22 · 对应第一阶段（音乐盒模式 + 自动播放）

## 1. 目标与范围

两类演奏模式，本阶段优先「音乐盒模式」，架构为「自由钢琴模式」预留接口：

- **音乐盒模式**：导入 MIDI → 任意键触发下一个 Event（和弦同时发声）；自动模式按原节奏播放。
- **自由钢琴模式（未来）**：键位→音高映射，noteOn/noteOff，复音，鼠标点键，八度切换。

## 2. 技术栈

| 层面 | 选型 | 说明 |
|---|---|---|
| 运行 | Vite dev server + 浏览器 | Web Audio 成熟底座，零安装；`npm run dev` 启动 |
| 音频 | Tone.js（MIT） | Transport 音频时钟防漂移、Draw 音画同步、Sampler 采样、dispose 释放 |
| MIDI | midi-file（MIT） | 底层解析，保留 tick/PPQ/tempo，self 转 beat |
| 音源 | Salamander Grand Piano（CC BY 3.0）本地打包 | 8 个基准音 MP3，closest 移调覆盖全键盘，离线可用 |
| 语言 | JavaScript (ESM) | 无需编译，Node 22 原生支持 |
| 测试 | Node 内置 node:test | 零额外依赖 |

## 3. 统一数据结构（核心契约）

```js
Song = {
  id, title, bpm, duration,          // duration 为 beat 数
  ppq,                               // ticks per quarter
  tracks: [{ id, name, channel, instrument, noteCount }],
  events: [
    { index, startBeat, durationBeat, notes: [
        { midi, velocity, durationBeat, channel }
      ] }
  ]
}
```

- 同一 startBeat 的所有音符（含跨轨道合并时）聚合为一个 Event → 保留和弦。
- events 按 startBeat 排序（稳定排序）。
- 所有时间以 beat 表示；转秒在播放时按 `60/bpm` 计算（BPM 可调不影响结构）。

## 4. 模块划分

```
src/
  core/
    types.js            # 数据结构注释与常量
    midi.js             # midi-file → Song（tempo 分段、tick→beat、和弦分组）
    song.js             # 轨道筛选/合并、统计信息、纯函数（可单测）
  audio/
    engine.js           # AudioEngine：init/noteOn/noteOff/releaseAll/dispose、音量、采样加载与兜底
  player/
    songPlayer.js       # SongPlayer：手动 nextEvent / 自动 Transport、状态机、循环、回调
  input/
    musicBoxInput.js    # 键盘任意键→next、空格/按钮去重、e.repeat 屏蔽（独立控制层）
  ui/
    app.js              # 组装：导入、轨道选择、控件、状态显示、钢琴键盘高亮
    styles.css
  main.js               # 入口
test/
  midi.test.js          # 合成 MIDI → 解析正确性
  song.test.js          # 排序/和弦分组/轨道合并/循环
  player.test.js        # 状态机（用 mock engine）
fixtures/
  make-midi.mjs         # 生成测试用 MIDI（和弦 + 顺序音）
public/
  samples/              # Salamander MP3（A0,C1...C6 等基准音）
  samples/ATTRIBUTION.md
```

## 5. 播放语义

- **手动模式**：`nextEvent()` 取当前 event → `engine.noteOn` 每个 note（同拍同时发声）→ 按 `durationBeat` 调度 noteOff → index++；到末尾按 loop 回到 0 或停止。
- **自动模式**：用 `Tone.Transport.scheduleOnce` 按 `startBeat` 排程，noteOn 与 noteOff 都挂到音频时钟；暂停/继续用 `transport.pause/start`；BPM 改 `transport.bpm.value`。
- 两模式共用同一 Song + 同一 AudioEngine，仅调度来源不同。

## 6. 已知坑规避

| 坑 | 措施 |
|---|---|
| 首次按键无声 | 首次手势里 `Tone.start()` + `context.resume()` |
| 长按重复触发 | `e.repeat` + pressedKeys Set；空格单独绑定 |
| stuck notes | 停止/换曲/visibilitychange 调 releaseAll |
| 音画不同步 | Transport 回调里用 `Tone.getDraw().schedule` |
| 资源泄漏 | dispose 采样器与 Transport 事件 |
| file:// 无声 | Vite 本地 HTTP 服务运行 |
| 音源加载失败 | 提示 + 降级 PolySynth 兜底 |

## 7. 验收映射

用户 10 条验收标准 → 第 1~9 条本阶段全部覆盖；第 10 条（自由钢琴不改引擎）通过架构分层保证。
