use solana_program::{pubkey::Pubkey, program_error::ProgramError};

pub use matcher_common::{CTX_SIZE, verify_magic as verify_magic_generic};
#[cfg(test)]
pub use matcher_common::MAGIC_OFFSET;

/// Magic bytes: "PRIVMATC" as u64 LE
pub const PRIVACY_MATCHER_MAGIC: u64 = 0x5052_4956_4d41_5443;

// Field offsets into the 320-byte context account
#[allow(dead_code)]
pub const VERSION_OFFSET: usize = 72;          // u32
#[allow(dead_code)]
pub const MODE_OFFSET: usize = 76;             // u8: 0=SolverVerified
pub const SOLVER_PUBKEY_OFFSET: usize = 112;   // Pubkey (32 bytes)
pub const BASE_SPREAD_OFFSET: usize = 144;     // u32
pub const MAX_SPREAD_OFFSET: usize = 148;      // u32
pub const SOLVER_FEE_OFFSET: usize = 152;      // u32
pub const ORACLE_PRICE_OFFSET: usize = 156;    // u64
pub const LAST_EXEC_PRICE_OFFSET: usize = 164; // u64
pub const TOTAL_VOLUME_OFFSET: usize = 172;    // u128 (16 bytes)
pub const TOTAL_ORDERS_OFFSET: usize = 188;    // u64
pub const SOLVER_ENCRYPTION_KEY_OFFSET: usize = 196; // [u8;32]
// 228..320 = reserved

/// Verify magic bytes in context account data
pub fn verify_magic(ctx_data: &[u8]) -> bool {
    verify_magic_generic(ctx_data, PRIVACY_MATCHER_MAGIC)
}

/// Read solver pubkey from context data
pub fn read_solver_pubkey(ctx_data: &[u8]) -> Result<Pubkey, ProgramError> {
    Ok(Pubkey::new_from_array(
        ctx_data[SOLVER_PUBKEY_OFFSET..SOLVER_PUBKEY_OFFSET + 32]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    ))
}
