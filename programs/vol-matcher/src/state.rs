// Re-export shared constants and functions from matcher-common
pub use matcher_common::{CTX_SIZE, verify_magic as verify_magic_generic};

/// Magic bytes: "VOLMATCH" as u64 LE
pub const VOL_MATCHER_MAGIC: u64 = 0x564F_4c4d_4154_4348;

// Vol-matcher-specific field offsets
#[allow(dead_code)]
pub const VERSION_OFFSET: usize = 72;            // u32
#[allow(dead_code)]
pub const MODE_OFFSET: usize = 76;               // u8: 0=RealizedVol, 1=ImpliedVol
pub const BASE_SPREAD_OFFSET: usize = 112;       // u32
pub const VOV_SPREAD_OFFSET: usize = 116;        // u32 vol-of-vol spread
pub const MAX_SPREAD_OFFSET: usize = 120;        // u32
pub const IMPACT_K_OFFSET: usize = 124;          // u32
pub const CURRENT_VOL_OFFSET: usize = 128;       // u64 current vol in bps
pub const VOL_MARK_PRICE_OFFSET: usize = 136;    // u64 mark price in e6
pub const LAST_UPDATE_SLOT_OFFSET: usize = 144;  // u64
pub const REGIME_OFFSET: usize = 152;            // u8 (0=VeryLow..4=Extreme)
pub const VOL_7D_AVG_OFFSET: usize = 160;        // u64
pub const VOL_30D_AVG_OFFSET: usize = 168;       // u64
pub const LIQUIDITY_OFFSET: usize = 176;         // u128 (16 bytes)
pub const MAX_FILL_OFFSET: usize = 192;          // u128 (16 bytes)
pub const VARIANCE_TRACKER_OFFSET: usize = 208;  // Pubkey (32)
pub const VOL_INDEX_OFFSET: usize = 240;         // Pubkey (32)
// 272..320 = reserved

/// Volatility regime enum
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum VolatilityRegime {
    VeryLow = 0,
    Low = 1,
    Normal = 2,
    High = 3,
    Extreme = 4,
}

impl VolatilityRegime {
    pub fn from_u8(v: u8) -> Self {
        match v {
            0 => Self::VeryLow,
            1 => Self::Low,
            2 => Self::Normal,
            3 => Self::High,
            4 => Self::Extreme,
            _ => Self::Normal,
        }
    }

    /// Spread multiplier: how much to scale vol-of-vol spread
    pub fn spread_multiplier(&self) -> u64 {
        match self {
            Self::VeryLow => 50,   // 0.5x
            Self::Low => 75,       // 0.75x
            Self::Normal => 100,   // 1.0x
            Self::High => 150,     // 1.5x
            Self::Extreme => 250,  // 2.5x
        }
    }
}

/// Local convenience wrapper that checks magic against VOL_MATCHER_MAGIC
pub fn verify_magic(ctx_data: &[u8]) -> bool {
    verify_magic_generic(ctx_data, VOL_MATCHER_MAGIC)
}
