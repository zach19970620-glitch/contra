use std::io::Cursor;

use tetanes_core::{
    common::Reset,
    control_deck::{Config, ControlDeck},
    input::{JoypadBtnState, Player},
    mem::RamState,
    video::VideoFilter,
};
use wasm_bindgen::prelude::*;

const FRAME_WIDTH: usize = 256;
const FRAME_HEIGHT: usize = 240;
const FRAME_BYTES: usize = FRAME_WIDTH * FRAME_HEIGHT * 4;
/// ~48 kHz / 60 fps; actual frame size varies slightly by region/timing.
const AUDIO_FRAME_CAPACITY: usize = 900;
const SNAPSHOT_SLOTS: usize = 32;

struct SnapshotSlot {
    frame: u32,
    deck: ControlDeck,
}

fn hash_bytes(data: &[u8]) -> u32 {
    let mut hash: u32 = 0x811c_9dc5;
    for byte in data {
        hash ^= *byte as u32;
        hash = hash.wrapping_mul(0x0100_0193);
    }
    hash
}

fn apply_buttons(deck: &mut ControlDeck, player: Player, buttons: u8) {
    let state = JoypadBtnState::from_bits_truncate(buttons as u16);
    deck.joypad_mut(player).buttons = state;
}

#[wasm_bindgen]
pub struct NesEmulator {
    deck: ControlDeck,
    snapshot: Option<ControlDeck>,
    snapshot_slots: Vec<Option<SnapshotSlot>>,
    frame_buffer: Vec<u8>,
    audio_buffer: Vec<f32>,
}

#[wasm_bindgen]
impl NesEmulator {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        console_error_panic_hook::set_once();

        let config = Config {
            ram_state: RamState::AllZeros,
            filter: VideoFilter::Pixellate,
            ..Default::default()
        };

        let mut deck = ControlDeck::with_config(config);
        deck.set_sample_rate(48_000.0);
        deck.set_concurrent_dpad(true);

        Self {
            deck,
            snapshot: None,
            snapshot_slots: (0..SNAPSHOT_SLOTS).map(|_| None).collect(),
            frame_buffer: vec![0; FRAME_BYTES],
            audio_buffer: Vec::with_capacity(AUDIO_FRAME_CAPACITY),
        }
    }

    pub fn load_rom(&mut self, rom: &[u8]) -> Result<(), JsValue> {
        let mut cursor = Cursor::new(rom);
        self.deck
            .load_rom("game.nes", &mut cursor)
            .map_err(|err| JsValue::from_str(&format!("load_rom failed: {err}")))?;
        Ok(())
    }

    pub fn set_inputs(&mut self, p1: u8, p2: u8) {
        apply_buttons(&mut self.deck, Player::One, p1);
        apply_buttons(&mut self.deck, Player::Two, p2);
    }

    pub fn step_frame(&mut self) -> Result<(), JsValue> {
        self.deck
            .clock_frame()
            .map_err(|err| JsValue::from_str(&format!("clock_frame failed: {err}")))?;
        let frame = self.deck.frame_buffer();
        let len = self.frame_buffer.len();
        self.frame_buffer.copy_from_slice(&frame[..len]);
        let audio = self.deck.audio_samples();
        self.audio_buffer.resize(audio.len(), 0.0);
        self.audio_buffer.copy_from_slice(audio);
        self.deck.clear_audio_samples();
        Ok(())
    }

    pub fn frame_width() -> u32 {
        FRAME_WIDTH as u32
    }

    pub fn frame_height() -> u32 {
        FRAME_HEIGHT as u32
    }

    pub fn framebuffer_ptr(&self) -> *const u8 {
        self.frame_buffer.as_ptr()
    }

    pub fn framebuffer_len(&self) -> usize {
        self.frame_buffer.len()
    }

    pub fn audio_ptr(&self) -> *const f32 {
        self.audio_buffer.as_ptr()
    }

    pub fn audio_len(&self) -> usize {
        self.audio_buffer.len()
    }

    pub fn frame_number(&self) -> u32 {
        self.deck.frame_number()
    }

    pub fn wram_hash(&self) -> u32 {
        hash_bytes(self.deck.wram())
    }

    pub fn save_snapshot(&mut self) {
        self.snapshot = Some(self.deck.clone());
    }

    pub fn load_snapshot(&mut self) -> bool {
        if let Some(snapshot) = self.snapshot.clone() {
            self.deck = snapshot;
            true
        } else {
            false
        }
    }

    pub fn save_state_at(&mut self, frame: u32) {
        let idx = (frame as usize) % SNAPSHOT_SLOTS;
        self.snapshot_slots[idx] = Some(SnapshotSlot {
            frame,
            deck: self.deck.clone(),
        });
    }

    pub fn load_state_at(&mut self, frame: u32) -> bool {
        let idx = (frame as usize) % SNAPSHOT_SLOTS;
        let Some(slot) = &self.snapshot_slots[idx] else {
            return false;
        };
        if slot.frame != frame {
            return false;
        }
        self.deck = slot.deck.clone();
        true
    }

    pub fn reset(&mut self) {
        use tetanes_core::common::ResetKind;
        self.deck.reset(ResetKind::Soft);
        for slot in &mut self.snapshot_slots {
            *slot = None;
        }
    }
}
