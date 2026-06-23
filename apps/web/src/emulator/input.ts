export const BUTTON = {
  A: 0x01,
  B: 0x02,
  Select: 0x04,
  Start: 0x08,
  Up: 0x10,
  Down: 0x20,
  Left: 0x40,
  Right: 0x80,
} as const;

/** P1：WASD + J/K + Enter/Space */
const P1_KEYMAP: Record<string, number> = {
  KeyJ: BUTTON.B,
  KeyK: BUTTON.A,
  KeyW: BUTTON.Up,
  KeyS: BUTTON.Down,
  KeyA: BUTTON.Left,
  KeyD: BUTTON.Right,
  Enter: BUTTON.Start,
  Space: BUTTON.Select,
};

/** P2：方向键 + 小键盘 */
const P2_KEYMAP: Record<string, number> = {
  Numpad2: BUTTON.B,
  Numpad1: BUTTON.A,
  ArrowUp: BUTTON.Up,
  ArrowDown: BUTTON.Down,
  ArrowLeft: BUTTON.Left,
  ArrowRight: BUTTON.Right,
  NumpadEnter: BUTTON.Start,
  Numpad0: BUTTON.Select,
};

type InputOptions =
  | { mode: "solo" }
  | { mode: "online"; localPlayer: 1 | 2 };

export class InputState {
  private buttons = 0;
  private readonly mode: "solo" | "online";
  private readonly localPlayer: 1 | 2;

  constructor(options: InputOptions) {
    this.mode = options.mode;
    this.localPlayer = options.mode === "online" ? options.localPlayer : 1;
  }

  handleKeyDown(code: string) {
    this.apply(code, true);
  }

  handleKeyUp(code: string) {
    this.apply(code, false);
  }

  /** 联机：只读本机玩家的按键 */
  getLocalButtons(): number {
    return this.buttons;
  }

  /** 单机：P1/P2 共用同一套键（同屏同步操作） */
  getButtons(player: 1 | 2): number {
    if (this.mode === "solo") {
      return this.buttons;
    }
    return player === this.localPlayer ? this.buttons : 0;
  }

  private apply(code: string, down: boolean) {
    const map =
      this.mode === "online" && this.localPlayer === 2 ? P2_KEYMAP : P1_KEYMAP;
    const mask = map[code];
    if (mask === undefined) {
      return;
    }
    this.buttons = down ? this.buttons | mask : this.buttons & ~mask;
  }
}

export function buttonsFromRemote(value: number): number {
  return value & 0xff;
}
