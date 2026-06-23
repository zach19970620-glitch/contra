# 魂斗罗联机 Lockstep 调试经验总结

本文档记录 Contra Online MVP 在实现 WebRTC Lockstep 联机同步过程中遇到的问题、根因与修复经验。

相关代码：

- `apps/web/src/net/lockstep.ts` — Lockstep 同步核心
- `apps/web/src/pages/Game.tsx` — 游戏循环、同步状态机、渲染
- `apps/web/src/net/webrtc.ts` — WebRTC 与二进制包编解码
- `crates/contra-wasm/src/lib.rs` — WASM 模拟器封装

---

## 1. Lockstep 的正确心智模型

**Lockstep = 确定性模拟 + 输入对齐**，不是「WebRTC 连上就各自跑模拟器」。

### 基本规则

- 只有 **双方同一帧的 P1/P2 输入都到齐**，才能推进（`tryAdvance`）一帧。
- **推进必须对称**：只在统一的 tick 里调用 `tryAdvance()`；网络收包只缓存输入（`applyInput`），不要在收包回调里单独推进（会导致 desync）。
- **需要输入延迟（input delay）**：零延迟要求同一 tick 内远端包必达，现网几乎做不到。应至少提前 1 帧提交输入，bootstrap 阶段预填 frame 0。

### 推荐同步流程

```
WebRTC 通道 open
    → 互发 hello
    → Host 发 sync-start
    → 双方 beginLockstep（reset 模拟器 + lockstep）
    → bootstrap：各提交 frame 0（及 delay 管道）输入
    → bootstrap 完成（P1/P2 输入齐）
    → 互发 sync-ready
    → 双方都收到 sync-ready 后才开始 tick 模拟
```

`sync-ready` 握手的目的：防止 P1 在 P2 尚未就绪时独自推进，造成帧号错位。

---

## 2. 状态栏比代码更容易骗人

多次被 UI 文案误导，以为「在同步中」就等于「在跑模拟器」。

| 显示 | 实际含义 |
|------|----------|
| 「已运行 / 待推进 0 帧」 | 可能是 **待推进帧号**，不是已模拟帧数 |
| 「P1:✓ P2:✓」 | 只说明 **当前待推进帧** 输入齐了，不代表模拟在持续运行 |
| WRAM hash 不变 | 模拟器 **几乎没有 step**，不是「画面卡但逻辑在跑」 |

### 调试时应同时观察

1. **`simulated`** — 已模拟帧数，应单调递增
2. **`currentFrame`** — 待推进帧号
3. **WRAM hash** — 每帧应变化（确定性核心指标）

状态栏建议格式：

```text
Lockstep 同步中 · 已模拟 N 帧 · 待推进 M · P1:✓/× P2:✓/×
```

刷新频率建议 **250ms 级**，不要每 30 帧才更新一次。

---

## 3. WebRTC 时序：包会早于「你以为准备好了」

### 典型竞态

| 场景 | 后果 |
|------|------|
| P2 先收到 `sync-start` 和 P1 输入，但 `onopen` 未回调 | 包被丢弃，永远缺某一帧远端输入 → 灰屏 |
| `sync-ready` 在 bootstrap 完成前生效 | 过早开跑，帧号错位 |
| WebRTC 连上前就开始 tick | 包发进黑洞，连上后无法恢复 |

### 对应修复

- sync 前收到的 input **先缓存**（`pendingInputPackets`），`beginLockstep()` 后统一灌入。
- `remoteSyncReady` 不要在 `beginLockstep` 开头直接从 pending 置 true；应在 **bootstrap 完成后再生效**。
- 发送 `sync-ready` 时 **重发 bootstrap 输入**（`resendBootstrap`），对抗丢包。
- **禁止「按键不变不重发」**：丢一次包后永远无法恢复同步。

---

## 4. 游戏循环与 React 生命周期

### 症状

- 双方显示「已模拟 1 帧 · 待推进 1 · P1:✓ P2:✓」
- WRAM hash 不变
- 无报错

### 根因

1. `tryStartSimulation` 里 tick 一次 → 只模拟了 frame 0。
2. 后续 tick 挂在 `requestAnimationFrame` 的 `lockstepReady` 分支。
3. **StrictMode 双挂载** + 异步 `boot()` → effect 清理后旧 rAF 链可能已断，新实例状态与循环不同步。

### 经验

- 联机模拟用 **`setInterval(FRAME_MS)` 独立驱动**，不要与渲染 rAF 混在同一分支。
- 开发阶段可去掉 StrictMode，或用 generation / AbortController 防止 stale boot。
- `boot()` 应用 generation 守卫：清理后的异步 boot 不得再启动循环。
- 网络回调里 **节流 setStatus**（如 250ms），避免 60fps 无意义重渲染。

---

## 5. WASM + Canvas 渲染

### 灰屏 / 透明画面

| 问题 | 修复 |
|------|------|
| 长期持有 WASM 内存的 TypedArray 视图，`memory.grow` 后失效 | 每帧 `copyFramebuffer` 到 JS 堆再 `putImageData` |
| `frame_buffer_into` 只写 RGB、alpha=0 | 改回 `deck.frame_buffer()` 拷贝（含 alpha=255） |
| 音频读 WASM 视图 | 同样拷贝到 scratch buffer 再写入 ring |

### 参考实现

```typescript
// wasm-emulator.ts
copyFramebuffer(target: Uint8ClampedArray) {
  const view = new Uint8Array(wasmMemory.buffer, ptr, len);
  target.set(view);
}
```

---

## 6. 调试 checklist

按顺序排查：

1. [ ] WebRTC 数据通道是否 `open`
2. [ ] bootstrap：frame 0 的 P1/P2 是否都 ✓
3. [ ] sync-ready：本机 / 对手是否都 ✓
4. [ ] **`simulated` 是否递增**（不要只看「Lockstep 同步中」）
5. [ ] **WRAM hash 是否变化**
6. [ ] 若 `simulated` 停住：看待推进帧缺 P1 还是 P2（远端包未到 vs 本机未发）
7. [ ] 若 `simulated` 涨但画面灰：查渲染 / framebuffer 拷贝
8. [ ] 若两侧 `simulated` 不一致：查是否在非 tick 路径推进，或是否存在发包去重

---

## 7. 架构取舍

| 做法 | 结论 |
|------|------|
| 纯 lockstep + 零 delay | MVP 可行，但握手必须严格、每 tick 可靠发包 |
| `sync-ready` barrier | 必要，防止一方先跑 |
| 输入延迟 1–2 帧 | 比复杂 pipeline 更稳 |
| rollback 网帧 | 未实现；高延迟 / 卡顿场景比 lockstep 更合适 |
| 性能优化（少 setState、二进制包） | 可以做，**不能牺牲同步正确性** |

---

## 8. 问题与修复时间线（摘要）

| 问题 | 根因 | 修复 |
|------|------|------|
| WASM panic（音频 buffer 长度） | `clock_frame_into` 固定 4096 | 按实际长度 resize |
| 有声音无画面 | alpha=0 全透明 | 使用带 alpha 的 frame_buffer |
| 联机灰屏 / 卡 frame 0 | 连上前 tick、包丢失、bootstrap 重复 | 连上前不 tick；sync-start 后 reset |
| P1/P2 帧错位 | 一方先跑 + 发包去重 | sync-ready 握手；去掉去重 |
| 只模拟 1 帧、hash 不变 | rAF 未持续 tick + StrictMode | setInterval 驱动 lockstep |

---

## 9. 一句话总结

**联机 bug 的 80% 不是模拟器算错了，而是：输入没到齐、推进时机不对称、循环没在跑、或者 UI 让你以为在跑。**

把 `simulated`、WRAM hash、P1/P2 输入位拆到状态栏上，比盲目改 lockstep 算法更快定位问题。

---

## 12. Rollback 网帧（联机）

已替换 Lockstep，核心流程：

1. **每帧立即推进**：本地输入立刻发送；远端输入未到则用 `lastRemoteInput` 预测
2. **每帧前快照**：`save_state_at(frame)` 存入 WASM 快照环（32 槽）
3. **迟到且预测错误**：`load_state_at(fromFrame)` → 重模拟至当前帧
4. **重模拟中间帧**不渲染/不推音频，仅最后一帧输出

| 常量 | 值 |
|------|-----|
| `MAX_ROLLBACK_FRAMES` | 16 |
| 预测策略 | 沿用上一帧远端按键 |

状态栏：`Rollback 同步中 · 帧 N · 回滚 R 次 · P1/P2 ✓/×`

**注意**：回滚窗口外迟到包会被丢弃（console warn）；高延迟环境可增大 `MAX_ROLLBACK_FRAMES` 或 `SNAPSHOT_SLOTS`。


- **Rollback 网帧**：输入延迟更低、容忍丢包，但实现复杂度更高。
- **固定 timestep + 输入预测**：改善手感，需与确定性模拟权衡。
- 现有 `LockstepSync` 的「缓存输入 / 单点 advance」结构可复用，不必推倒重来。

---

## 11. 音画同步与音频延迟

### 症状

- 画面正常，声音明显滞后（数百毫秒）
- 切后台再回来，声音更拖
- 联机 lockstep 已同步，但听感仍「慢半拍」

### 根因

| 问题 | 说明 |
|------|------|
| 环形缓冲过大 | 原容量 48000 样本（1 秒），延迟可累积到接近 1 秒 |
| 写满丢新样本 | 缓冲满时 `break` 丢弃**新**音频，播放头仍在读旧数据 → 延迟只增不减 |
| 单机 rAF 追帧 | `while (accumulator >= FRAME_MS)` 一次推进多帧，瞬间灌满音频缓冲 |
| 双时钟 | 模拟用 `setInterval` / rAF，播放用 AudioWorklet，无主动 trim |
| Web Audio 输出延迟 | 浏览器另有 `baseLatency + outputLatency`（约 20–50ms） |

### 已做优化（`nes-audio-engine.ts`）

1. **`latencyHint: 'interactive'`** — 降低系统输出延迟
2. **缩小环形缓冲** — 目标 ~50ms，上限 ~100ms
3. **写满丢最旧样本** — 延迟有上界，不会无限增长
4. **`trimToTarget()`** — 每次 `pushFrame` 后若超上限，丢弃旧样本
5. **`clear()`** — `beginLockstep` 重置时清空音频，避免旧缓冲残留
6. **单机限制追帧** — 每帧 rAF 最多模拟 1 帧，并 clamp accumulator

### 进一步可选优化

- **音频驱动模拟（pull model）**：Worklet 缺样本时再 step 模拟器，天然音画对齐（联机 lockstep 需另设计）
- **动态 resample**：若 WASM 输出采样率与 48kHz 帧长不完全一致，做轻量 resample
- **联机**：lockstep 本身有 1 帧 input delay，听感可接受；勿为「追帧」在单端多跑模拟
- 用 `audioContext.outputLatency` 在调试 HUD 显示估算总延迟

### 音频 pull 驱动（单机）

| 模式 | 驱动方 | 说明 |
|------|--------|------|
| **pull**（单机） | AudioWorklet | 缓冲低于目标水位或 underrun 时 `postMessage('pull')`，主线程 `drainPull()` 步进模拟器 |
| **push**（联机） | Lockstep tick | 每模拟帧 push 音频；联机不能按音频自由加速 |

单机 rAF **只负责 blit + HUD**，模拟步进由音频消费速率拉动，音画天然对齐。

Worklet 低水位 ≈ `TARGET * 0.55`；单次 pull 最多步进 3 帧，防止主线程阻塞。


| 优化 | 说明 |
|------|------|
| **WebGL `texSubImage2D`** | 替代 `putImageData`，CPU 占用更低，像素缩放更清晰 |
| **统一 rAF 循环** | 单机 / 联机 lockstep 共用 fixed timestep，去掉 `setInterval` 漂移 |
| **HUD 节流 400ms** | `wramHash()` 与状态栏不再每帧调用，减少 WASM + React 开销 |
| **音频总延迟** | HUD 显示 `缓冲 + outputLatency`，便于调参 |
