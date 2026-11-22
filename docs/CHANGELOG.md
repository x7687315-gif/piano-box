# 变更说明

## v0.1.0 — 第一阶段：音乐盒模式（2026-11-22）

### 关键结论

第一阶段验收标准的 1~9 条全部达成；第 10 条通过架构分层保证（自由钢琴模式无需重写引擎即可加入）。26 个单元测试 + 21 项浏览器端到端冒烟测试全部通过。

### 本次实现了什么

| 模块 | 文件 | 说明 |
|---|---|---|
| 统一数据结构 | `src/core/song.js` | Song/Event/Note、beat↔秒换算、和弦分组、轨道筛选、循环索引 |
| MIDI 解析 | `src/core/midi.js` | midi-file → Song，保留 tick/PPQ，tempo 分段，多轨与和弦 |
| 音频引擎 | `src/audio/engine.js` | 本地采样 + Tone.Sampler、noteOn/noteOff、velocity、音量、releaseAll、失败降级 |
| 播放控制 | `src/player/song-player.js` | 手动 nextEvent、自动 Transport、暂停/继续/停止/重来/循环、BPM |
| 输入控制 | `src/input/music-box-input.js` | 任意键推进、e.repeat + Set 防连发、组合键屏蔽、空格去重 |
| 界面 | `index.html` `src/ui/*` | 导入/拖放、轨道选择、控件、进度、琴键高亮、音符时间线 |
| 音源 | `public/samples/` | 30 个 Salamander MP3（2.0MB）+ CC BY 3.0 署名 |
| 测试 | `test/` `fixtures/` | 26 单元测试 + 可选 E2E + MIDI 生成器 |
| 文档 | `docs/` | 调研简报（自检 100 分）、设计方案、本变更说明 |

### 验收标准对照

| # | 标准 | 结果 |
|---|---|---|
| 1 | 正常启动应用 | ✅ `npm run dev`，浏览器打开 |
| 2 | 导入真实 MIDI 文件 | ✅ 点击选择 + 拖放，demo.mid 验证通过 |
| 3 | 正确解析音符与节奏 | ✅ 5 事件 / 11 音符，beat 时值与 BPM 正确 |
| 4 | 选择需要播放的轨道 | ✅ 轨道勾选 / 合并全部 |
| 5 | 任意键依次触发音符/和弦 | ✅ A/Z/X 等键结果一致，和弦同时发声 |
| 6 | 自动播放完整乐曲 | ✅ Transport 按 BPM / 时值排程 |
| 7 | 暂停/继续/停止/重新开始 | ✅ 全部可用并经 E2E 验证 |
| 8 | 清晰看到当前进度 | ✅ 事件计数、进度条、琴键高亮、时间线 |
| 9 | 无明显漂移/重复/音符不释放 | ✅ 音频时钟调度、e.repeat 屏蔽、releaseAll |
| 10 | 未来可不加重写引擎加自由钢琴 | ✅ 输入层与引擎解耦，架构已预留 |

### 开发中发现并修复的问题

- **初始化阻塞演奏响应**：`ensureAudio()` 内的 `$('#engineStatus')` 拼错（`$` 是 getElementById 包装器，不接受 `#`），抛错导致 `await` 中断、`nextEvent()` 不执行。修复选择器，并让初始化失败也降级而不吞掉演奏。
- **首屏 favicon 404**：内联 SVG favicon 消除控制台错误。
- **Windows 中文路径**：`new URL().pathname` 在中文目录产生 percent 编码 + 多余盘符，改用 `fileURLToPath`。

### 尚未实现（后续阶段）

1. **自由钢琴模式**：键位→音高映射、noteOn/noteOff 复音、鼠标点键、八度切换、键位设置。（引擎已就绪，只需新增输入控制层）
2. **速度变化（tempo map）自动播放**：目前自动播放用单一 BPM（曲子首个 tempo），手动 BPM 可调；未逐段跟随 MIDI 内嵌 tempo 变化。
3. **力度分层音源**：Salamander 精简集为单层采样，velocity 用增益近似，未使用多力度层采样。
4. **音乐盒音色**：仅钢琴音色，音乐盒 / 其他音色未加入。
5. **JSON / MusicXML 导入与乐曲编辑**：数据结构已预留，未实现导入器与编辑器。
6. **桌面 EXE 打包**：当前为浏览器应用，未包 Electron 壳。
7. **完整钢琴卷帘可视化**：当前为简化音符时间线，非标准 piano roll。
