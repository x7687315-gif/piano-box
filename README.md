# piano-box · 音乐盒钢琴

> 让乐曲像八音盒一样，在你的指尖一齿一齿地转动。

一个运行在电脑浏览器里的交互式钢琴应用。它有两种演奏方式：**音乐盒模式**——导入一首 MIDI，敲任意键就奏响下一个音符或和弦，不必认谱；**自由钢琴模式**（架构已预留，后续实现）——键盘化作琴键，随心弹奏。

当前版本聚焦于音乐盒模式，包含**手动转轴**与**自动转轴**两套完整玩法，二者共用同一份乐曲数据与同一个音频引擎。

---

## 特性

- **双格式乐曲导入**：标准 MIDI（`.mid` / `.midi`）与 **MusicXML**（`.musicxml` / `.xml`），支持点击选择与拖放；解析音高、时值、力度、BPM、多轨道与和弦。两种格式统一进入同一 `Song` 结构、同一引擎。
- **统一乐曲结构**：导入文件先转成 `Song / Event / Note`（以 beat 为单位），播放器不直接碰任何解析器，为 JSON 等更多格式留出扩展位。
- **变化性编辑**：对全曲或选中事件做**移调（±24 半音）/ 时长缩放（0.25×–3×）/ 力度缩放（0.1×–2×）**，纯函数不可变变换、一键重置，变换后仍走同一播放引擎。
- **三踏板**：柔音（左/F1）、持音（中/F2）、延音（右/F3），界面按钮与键盘双通道；延音/持音真实延迟音符释放，柔音降低力度。
- **新手引导**：首次导入显示引导卡片；"下一步"音符描边高亮、时间线标记，弹完自动跟随；引导只出现一次。
- **手动转轴**：任意普通键推进一个音乐事件；同一时刻的音符同时发声成和弦；长按不会连发；空格单独绑定；到末尾可选循环或停止。
- **自动转轴**：按原曲节奏与 BPM 播放，支持播放 / 暂停 / 继续 / 停止 / 从头开始 / 循环 / BPM 调整 / 音量调节。
- **可靠音频**：Tone.js Transport 绑定音频硬件时钟（非 `setTimeout`，无节奏漂移），`Tone.Draw` 保证音画同步，音符按时长精确释放。
- **离线音源**：随应用分发 Salamander Grand Piano 采样（CC BY 3.0），全键盘移调覆盖；加载失败自动降级为合成器，永不"哑火"。
- **视觉反馈**：事件计数、进度条、当前 / 即将音符、琴键高亮、简洁音符时间线。
- **可测试**：52 个自动化单元测试 + 两套可选端到端冒烟测试。

## 快速开始

前置：Node.js 18+（已在 Node 22 验证）。

```bash
cd piano-box
npm install
npm run dev
```

浏览器打开终端显示的地址（默认 <http://127.0.0.1:5173>）。

> 首次发声需要一次用户交互（点击或按键）——这是浏览器的自动播放策略要求，应用会在第一次交互时自动解锁音频。

试玩步骤：

1. 点击左侧「导入乐曲」，选择 `fixtures/demo.mid` 或 `fixtures/demo.musicxml`（内置示例），也可拖放自己的文件。
2. 默认「音乐盒 · 手动」模式：敲键盘任意键（或点「下一步」），逐个奏响音符 / 和弦。
3. 切到「音乐盒 · 自动」模式：点播放，听整首；可暂停、继续、停止、调 BPM / 音量、开循环。
4. 用「变化性编辑」：拖移调 / 时长 / 力度滑块听效果；点右侧时间线的行选中单个事件，切到「选中事件」作用域即可只改这些音；点「重置所有变化」回到原曲。
5. 用「踏板」：按住界面三个踏板按钮，或按 F1/F2/F3（柔音/持音/延音）；延音让音符松键后继续响。

## 测试

```bash
npm test                 # 62 个单元测试（MIDI/MusicXML 解析 / 排序 / 和弦 / 轨道 / 变换 / 踏板 / 播放状态 / 循环）
```

端到端冒烟测试（可选，需本机 Chrome）：

```bash
npm run dev              # 另开终端保持运行
npm install --no-save puppeteer-core
node test/e2e/smoke.mjs              # 基础功能（11 项）
node test/e2e/smoke-transform.mjs    # MusicXML 导入 + 变化性编辑（14 项）
node test/e2e/smoke-guide-pedal.mjs  # 新手引导 + 三踏板（14 项）
```

## 项目结构

```
piano-box/
├─ src/
│  ├─ core/          # 统一数据结构、纯函数、MIDI→Song 解析（不依赖音频库）
│  │  ├─ song.js
│  │  ├─ midi.js
│  │  ├─ musicxml.js     # MusicXML→Song（原生 DOMParser，零依赖）
│  │  └─ transform.js    # 移调/时值/力度纯函数变换
│  ├─ audio/
│  │  └─ engine.js   # 通用音频引擎：noteOn/noteOff/音量/采样加载与降级
│  ├─ player/
│  │  └─ song-player.js  # 播放控制层：手动步进 + 自动 Transport + 状态机
│  ├─ input/
│  │  └─ music-box-input.js  # 音乐盒键盘输入（独立控制层，未来自由钢琴另写一层）
│  ├─ ui/            # 组装与视觉
│  └─ main.js
├─ public/samples/    # 本地 Salamander 采样 + 署名
├─ fixtures/          # 测试用 MIDI 生成器与示例
├─ test/              # 单元测试 + 可选 E2E
└─ docs/              # 调研简报、设计方案、变更说明
```

**架构要点**：输入层（音乐盒 / 未来的自由钢琴）彼此独立，都只调用播放控制层；播放层与音频引擎只见 `Song`，不见 MIDI 文件。因此加入自由钢琴模式无需改动音频引擎与播放核心。

## 已实现 / 未实现

见 [docs/CHANGELOG.md](docs/CHANGELOG.md)。

## 许可与致谢

- 代码：MIT。
- 音频采样：[Salamander Grand Piano](https://github.com/sfzinstruments/SalamanderGrandPiano)，Alexander Holm，CC BY 3.0（MP3 版本来自 [Tone.js/audio](https://github.com/Tonejs/audio/tree/master/salamander)）。详见 [public/samples/ATTRIBUTION.md](public/samples/ATTRIBUTION.md)。
- 依赖：[Tone.js](https://github.com/Tonejs/Tone.js)（MIT）、[midi-file](https://github.com/tonejs/midi)（MIT）。
