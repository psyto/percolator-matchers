pub use matcher_common::{CTX_SIZE, verify_magic as verify_magic_generic};

/// Magic bytes: "JPYMATCH" as u64 LE
pub const JPY_MATCHER_MAGIC: u64 = 0x4A50_594D_4154_4348;

// Field offsets
#[allow(dead_code)]
pub const VERSION_OFFSET: usize = 72;             // u32
#[allow(dead_code)]
pub const MODE_OFFSET: usize = 76;                // u8: 0=PassiveKYC, 1=vAMMKYC
pub const MIN_KYC_LEVEL_OFFSET: usize = 77;       // u8: 0=Basic..3=Institutional
pub const REQUIRE_SAME_JURISDICTION_OFFSET: usize = 78; // u8: 0 or 1
pub const KYC_REGISTRY_OFFSET: usize = 112;       // Pubkey (32)
pub const BASE_SPREAD_OFFSET: usize = 144;        // u32
pub const KYC_DISCOUNT_OFFSET: usize = 148;       // u32: fee discount for Institutional
pub const MAX_SPREAD_OFFSET: usize = 152;         // u32
pub const BLOCKED_JURISDICTIONS_OFFSET: usize = 156; // u8: bitmask
pub const ORACLE_PRICE_OFFSET: usize = 164;       // u64
pub const DAILY_VOLUME_CAP_OFFSET: usize = 172;   // u64
pub const CURRENT_DAY_VOLUME_OFFSET: usize = 180; // u64
pub const DAY_RESET_TIMESTAMP_OFFSET: usize = 188; // i64
pub const IMPACT_K_OFFSET: usize = 196;           // u32
pub const LIQUIDITY_OFFSET: usize = 200;          // u128 (16 bytes)
pub const MAX_FILL_OFFSET: usize = 216;           // u128 (16 bytes)
// 232..320 = reserved

/// Meridian WhitelistEntry offsets (from transfer-hook state)
pub const WHITELIST_KYC_LEVEL_OFFSET: usize = 40;
pub const WHITELIST_EXPIRY_OFFSET: usize = 48;
pub const WHITELIST_JURISDICTION_OFFSET: usize = 56;

/// KYC levels
#[allow(dead_code)]
pub const KYC_BASIC: u8 = 0;
#[allow(dead_code)]
pub const KYC_STANDARD: u8 = 1;
#[allow(dead_code)]
pub const KYC_ENHANCED: u8 = 2;
pub const KYC_INSTITUTIONAL: u8 = 3;

pub fn verify_magic(ctx_data: &[u8]) -> bool {
    verify_magic_generic(ctx_data, JPY_MATCHER_MAGIC)
}
