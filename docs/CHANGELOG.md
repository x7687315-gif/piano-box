# 变更说明

## v0.3.1 — 修复"双击启动脚本没反应"（2026-11-22）

### 根因（实测定位，非猜测）

用户双击 `启动钢琴.bat` 没反应。用 PowerShell 在干净 PATH 下执行 bat 捕获输出，定位到两个真实问题：

1. **cmd 语法错误（致命）**：`echo [INFO] Installing dependencies (first run), please wait...` 中的 `(first run)` 在 `if (...)` 块内未转义，cmd 预解析整块时报"此时不应有 please"，脚本异常退出 → 窗口一闪而过。修复：去掉括号。
2. **编码问题**：原 bat 为 UTF-8 含中文，cmd 默认 GBK 解析会乱码。修复：全文改为**纯 ASCII**（0 个非 ASCII 字节）。
3. **Node 不在系统 PATH**：本机仅有 WorkBuddy 私有 node（`~/.workbuddy/binaries/node/versions/*`），双击环境继承系统 PATH 找不到 node。修复：bat 增加三级探测（PATH → WorkBuddy 私有 → 标准安装位置），用绝对路径启动，不依赖 PATH。
4. **端口静默切换**：5173 被占用时 vite 会自动换到 5174，但 bat 固定打开 5173，导致浏览器打开错误页面。修复：启动前检测并提示，且给 vite 加 `--strictPort`。

### 验证

在模拟双击的干净 PATH 下执行 bat：成功探测 node v22.22.2 → 跳过依赖安装 → 端口检查 → vite 在 5173 正常启动。同时清理了 5 个历史 E2E 测试残留的 node 进程（它们占用 5173 导致端口冲突）。

## v0.3.0 — 三踏板 + 新手引导 + 自动弹奏实测 + 代码清理（2026-11-22）

### 关键结论

按用户 4 点要求逐条落地：功能实测（自动弹奏）、新手引导、三踏板映射、规范（先调研/实测/清理）。
62 单测 + 3 套 E2E（11/14/14）+ 自动弹奏实测全部通过；删除 5 处死代码。

### 三踏板答案（用户所问）

| 位置 | 名称 | 作用 | 键盘映射 |
|---|---|---|---|
| 右 | 延音 Sustain（CC64） | 松键后继续响 | **F3** |
| 中 | 持音 Sostenuto（CC66） | 只保持按下瞬间已响的音 | **F2** |
| 左 | 柔音 Una Corda（CC67） | 音色更轻柔朦胧（非单纯音量） | **F1** |

> 用户记的"暂停踏板"不存在，实际是这三个。选择 F1-F3 是为避开音乐盒"任意键=下一步"的字母键与空格。界面也提供三个可点击踏板按钮。

### 本次实现

| 模块 | 文件 | 说明 |
|---|---|---|
| 踏板逻辑 | `src/core/pedal.js` | 纯逻辑：sustain 延迟全部释放、sostenuto 只捕获按下瞬间 held、soft 力度系数；11 单测 |
| 引擎集成 | `src/audio/engine.js` | noteOff 依据踏板标记 pendingRelease，抬踏板才真 release；noteOn 应用柔音力度 |
| 新手引导 | `index.html` `src/ui/*` | 首次引导卡片（localStorage 记住）、下一音描边高亮、时间线 next-up 标记 |
| BPM bug 修复 | `src/core/midi.js` | **重大修复**：midi-file 的 tempo 在 track 的 `setTempo` 事件（字段 `microsecondsPerBeat`），原代码读 `header.tempos` 导致所有 MIDI BPM 错误回退 120；新增回归测试 |
| 代码清理 | 多处 | 删 `transform.resetTo`、`pedal.remove/onChange/releaseOnLift`、`engine.getPedalState`、`player.onError/_manualTimers`；app 改用 applyTransforms 统一变换路径 |
| E2E | `test/e2e/smoke-guide-pedal.mjs` | 引导与踏板 14 项 |

### 自动弹奏实测（功能测试）

- **测试曲目说明**：坂本龙一《Merry Christmas Mr. Lawrence》受版权保护，midishow 需登录+Cloudflare、notenhac 直链失效、GitHub 无合规直链；**未获取到原曲 MIDI，不伪造导入成功**。按用户"真实数据自测但不入库"纪律，改用临时目录生成的**结构等效测试曲**（非原曲，4 轨/和弦/踏板/变速）实测。
- 实测结果：BPM 正确显示 66（bug 修复生效）、87.3 秒、16 事件 27 音符；自动播放 12 秒内事件 0→9、琴键高亮 1~4 个（和弦正确）、无卡死、无控制台错误。
- 用户如已有该曲 MIDI，可直接拖入应用试听；真曲获取建议：midishow 登录账号后手动下载（仅供个人练习，勿分发）。

## v0.2.0 — MusicXML 导入 + 变化性编辑（2026-11-22）

### 关键结论

按"下一步建议"完成两项优先级最高功能，均复用既有 Song/引擎，**未改动音频引擎与播放器核心**。52 单元测试 + 14 项新功能 E2E + 21 项原功能回归全部通过。

### 本次实现了什么

| 模块 | 文件 | 说明 |
|---|---|---|
| MusicXML 解析 | `src/core/musicxml.js` | 原生 DOMParser 零依赖；step/alter/octave→MIDI、divisions→beat、chord 和弦、tie 连音、transpose 移调乐器、metronome BPM |
| 变化性变换 | `src/core/transform.js` | 移调(±半音)、时长缩放、力度缩放；纯函数不可变；支持全曲/选中事件；可重置 |
| UI 集成 | `index.html` `src/ui/*` | 导入接受 .musicxml/.xml；变化性面板（3 滑块 + 作用域 + 徽标 + 重置）；时间线可点击选中事件 |
| 测试 | `test/musicxml.test.js` `test/transform.test.js` `test/e2e/smoke-transform.mjs` | 26 新增单测 + 14 项 E2E |
| 调研 | `docs/PREFLIGHT_ROUND2.md` | github-preflight 快速核查，含检索台账与选型 |

### 决策依据

- MusicXML 解析**不引 OSMD（2–3MB 渲染库）**、不引 API 不稳的 @stringsync/musicxml；用原生 DOMParser 只读官方 MIDI-compatible 字段，零依赖、可控、离线。
- 变换不引 tonal（~10KB）：半音移调=整数加减、时值/力度=乘系数，纯函数几行可测，避免过度设计。
- 稳定性修复：xmldom 抛异常与浏览器 parsererror 两种错误行为统一为"MusicXML 格式错误"；导入新曲同步重置滑块 UI 避免残留误导。

### 尚未实现（更新）

1. 自由钢琴模式（引擎已就绪，仅缺输入层）
2. tempo map 逐段变速（自动播放用单一 BPM）
3. 多力度分层采样（Tone.js #1034 未支持）
4. 音乐盒音色、标准 piano roll
5. JSON 乐曲导入、桌面 EXE 打包

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
