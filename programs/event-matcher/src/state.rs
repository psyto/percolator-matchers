use solana_program::{pubkey::Pubkey, program_error::ProgramError};

// Re-export shared constants and functions from matcher-common
pub use matcher_common::{CTX_SIZE, verify_magic as verify_magic_generic};

/// Magic bytes: "EVNTMATC" as u64 LE
pub const EVENT_MATCHER_MAGIC: u64 = 0x4556_4e54_4d41_5443;

// Field offsets (event-matcher-specific)
#[allow(dead_code)]
pub const VERSION_OFFSET: usize = 72;               // u32
#[allow(dead_code)]
pub const MODE_OFFSET: usize = 76;                  // u8: 0=Continuous, 1=BinarySettlement
pub const BASE_SPREAD_OFFSET: usize = 112;          // u32
pub const EDGE_SPREAD_OFFSET: usize = 116;          // u32: extra spread near 0%/100%
pub const MAX_SPREAD_OFFSET: usize = 120;           // u32
pub const IMPACT_K_OFFSET: usize = 124;             // u32
pub const CURRENT_PROBABILITY_OFFSET: usize = 128;  // u64 (0 - 1_000_000)
pub const PROBABILITY_MARK_OFFSET: usize = 136;     // u64: mark price = prob * 1e6
pub const LAST_UPDATE_SLOT_OFFSET: usize = 144;     // u64
pub const RESOLUTION_TIMESTAMP_OFFSET: usize = 152; // i64 (0 = no expiry)
pub const IS_RESOLVED_OFFSET: usize = 160;          // u8
pub const RESOLUTION_OUTCOME_OFFSET: usize = 161;   // u8: 0=NO, 1=YES
pub const SIGNAL_SEVERITY_OFFSET: usize = 168;      // u64 (0-3)
pub const SIGNAL_ADJUSTED_SPREAD_OFFSET: usize = 176; // u64
pub const LIQUIDITY_OFFSET: usize = 184;            // u128 (16 bytes)
pub const MAX_FILL_OFFSET: usize = 200;             // u128 (16 bytes)
pub const EVENT_ORACLE_OFFSET: usize = 216;         // Pubkey (32)
// 248..320 = reserved

/// Maximum probability value (100% = 1_000_000)
pub const MAX_PROBABILITY: u64 = 1_000_000;

/// Signal severity levels (from Kalshify)
pub const SIGNAL_NONE: u64 = 0;
#[allow(dead_code)]
pub const SIGNAL_LOW: u64 = 1;
#[allow(dead_code)]
pub const SIGNAL_HIGH: u64 = 2;
pub const SIGNAL_CRITICAL: u64 = 3;

pub fn verify_magic(ctx_data: &[u8]) -> bool {
    verify_magic_generic(ctx_data, EVENT_MATCHER_MAGIC)
}

pub fn read_event_oracle(ctx_data: &[u8]) -> Result<Pubkey, ProgramError> {
    Ok(Pubkey::new_from_array(ctx_data[EVENT_ORACLE_OFFSET..EVENT_ORACLE_OFFSET + 32].try_into().map_err(|_| ProgramError::InvalidAccountData)?))
}
