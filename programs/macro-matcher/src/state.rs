// Re-export shared constants and functions from matcher-common
pub use matcher_common::{CTX_SIZE, verify_magic as verify_magic_generic};

use solana_program::{pubkey::Pubkey, program_error::ProgramError};

/// Magic bytes: "MACOMATC" as u64 LE
pub const MACRO_MATCHER_MAGIC: u64 = 0x4d41_434f_4d41_5443;

// Macro-matcher-specific field offsets
#[allow(dead_code)]
pub const VERSION_OFFSET: usize = 72;                     // u32
#[allow(dead_code)]
pub const MODE_OFFSET: usize = 76;                        // u8: 0=RealRate, 1=HousingRatio (future)
pub const BASE_SPREAD_OFFSET: usize = 112;                // u32
pub const REGIME_SPREAD_OFFSET: usize = 116;              // u32: additional spread scaled by regime
pub const MAX_SPREAD_OFFSET: usize = 120;                 // u32
pub const IMPACT_K_OFFSET: usize = 124;                   // u32 (reserved)
pub const CURRENT_INDEX_OFFSET: usize = 128;              // u64: real rate index mark price (e6)
pub const INDEX_COMPONENTS_PACKED_OFFSET: usize = 136;    // u64: nominal(high32) | inflation(low32)
pub const LAST_UPDATE_SLOT_OFFSET: usize = 144;           // u64
pub const REGIME_OFFSET: usize = 152;                     // u8: MacroRegime (0-3)
pub const SIGNAL_SEVERITY_OFFSET: usize = 160;            // u64 (0-3)
pub const SIGNAL_ADJUSTED_SPREAD_OFFSET: usize = 168;     // u64
pub const LIQUIDITY_OFFSET: usize = 176;                  // u128 (16 bytes)
pub const MAX_FILL_OFFSET: usize = 192;                   // u128 (16 bytes)
pub const MACRO_ORACLE_OFFSET: usize = 208;               // Pubkey (32 bytes)
pub const TOTAL_VOLUME_OFFSET: usize = 240;               // u128 (16 bytes)
pub const TOTAL_TRADES_OFFSET: usize = 256;               // u64
// 264..320 = reserved

/// Rate offset: +500 bps (+5.00%) to keep mark price positive
#[allow(dead_code)]
pub const RATE_OFFSET: i64 = 500;

/// Signal severity levels (same as event-matcher)
pub const SIGNAL_NONE: u64 = 0;
#[allow(dead_code)]
pub const SIGNAL_LOW: u64 = 1;
#[allow(dead_code)]
pub const SIGNAL_HIGH: u64 = 2;
pub const SIGNAL_CRITICAL: u64 = 3;

/// Maximum staleness before rejecting a match (in slots)
pub const MAX_STALENESS_SLOTS: u64 = 150;

/// Macro regime enum — models the macroeconomic environment
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MacroRegime {
    Expansion = 0,
    Stagnation = 1,
    Crisis = 2,
    Recovery = 3,
}

impl MacroRegime {
    pub fn from_u8(v: u8) -> Self {
        match v {
            0 => Self::Expansion,
            1 => Self::Stagnation,
            2 => Self::Crisis,
            3 => Self::Recovery,
            _ => Self::Stagnation, // default
        }
    }

    /// Spread multiplier: how much to scale regime_spread_bps
    /// Value is percentage (60 = 0.60x, 100 = 1.0x, etc.)
    pub fn spread_multiplier(&self) -> u64 {
        match self {
            Self::Expansion => 60,    // 0.60x — rates rising, tighter spreads
            Self::Stagnation => 100,  // 1.00x — Stevenson's baseline
            Self::Crisis => 200,      // 2.00x — panic, wider spreads
            Self::Recovery => 125,    // 1.25x — transitional
        }
    }
}

/// Compute mark price from real rate in bps.
/// mark_price_e6 = (real_rate_bps + RATE_OFFSET) * 10_000
/// Floored at 0.
#[allow(dead_code)]
pub fn compute_mark_price(real_rate_bps: i64) -> u64 {
    let shifted = real_rate_bps + RATE_OFFSET;
    if shifted <= 0 {
        return 0;
    }
    (shifted as u64) * 10_000
}

/// Local convenience wrapper that checks magic against MACRO_MATCHER_MAGIC
pub fn verify_magic(ctx_data: &[u8]) -> bool {
    verify_magic_generic(ctx_data, MACRO_MATCHER_MAGIC)
}

/// Read the macro oracle pubkey from the context account
pub fn read_macro_oracle(ctx_data: &[u8]) -> Result<Pubkey, ProgramError> {
    Ok(Pubkey::new_from_array(
        ctx_data[MACRO_ORACLE_OFFSET..MACRO_ORACLE_OFFSET + 32]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mark_price_positive_rate() {
        // +2.00% (200 bps) -> mark = (200 + 500) * 10_000 = 7_000_000
        assert_eq!(compute_mark_price(200), 7_000_000);
    }

    #[test]
    fn test_mark_price_zero_rate() {
        // 0.00% (0 bps) -> mark = (0 + 500) * 10_000 = 5_000_000
        assert_eq!(compute_mark_price(0), 5_000_000);
    }

    #[test]
    fn test_mark_price_negative_rate() {
        // -1.00% (-100 bps) -> mark = (-100 + 500) * 10_000 = 4_000_000
        assert_eq!(compute_mark_price(-100), 4_000_000);
    }

    #[test]
    fn test_mark_price_floor() {
        // -5.00% (-500 bps) -> mark = (-500 + 500) * 10_000 = 0
        assert_eq!(compute_mark_price(-500), 0);
        // Below floor
        assert_eq!(compute_mark_price(-600), 0);
    }

    #[test]
    fn test_regime_from_u8() {
        assert_eq!(MacroRegime::from_u8(0), MacroRegime::Expansion);
        assert_eq!(MacroRegime::from_u8(1), MacroRegime::Stagnation);
        assert_eq!(MacroRegime::from_u8(2), MacroRegime::Crisis);
        assert_eq!(MacroRegime::from_u8(3), MacroRegime::Recovery);
        // Out-of-range defaults to Stagnation
        assert_eq!(MacroRegime::from_u8(4), MacroRegime::Stagnation);
        assert_eq!(MacroRegime::from_u8(255), MacroRegime::Stagnation);
    }

    #[test]
    fn test_regime_spread_multiplier() {
        assert_eq!(MacroRegime::Expansion.spread_multiplier(), 60);
        assert_eq!(MacroRegime::Stagnation.spread_multiplier(), 100);
        assert_eq!(MacroRegime::Crisis.spread_multiplier(), 200);
        assert_eq!(MacroRegime::Recovery.spread_multiplier(), 125);
    }
}
