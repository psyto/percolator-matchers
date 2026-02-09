use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, msg,
    program_error::ProgramError, pubkey::Pubkey,
};

use matcher_common::{verify_init_preconditions, write_header};
use crate::errors::JpyMatcherError;
use crate::state::*;

/// Tag 0x02: Initialize JPY matcher context
/// Accounts:
///   [0] LP PDA (signer)
///   [1] Matcher context account (writable, 320 bytes)
/// Data layout:
///   [0]    tag (0x02)
///   [1]    mode (u8: 0=PassiveKYC, 1=vAMMKYC)
///   [2]    min_kyc_level (u8: 0-3)
///   [3]    require_same_jurisdiction (u8: 0 or 1)
///   [4..36]  kyc_registry pubkey (32 bytes)
///   [36..40] base_spread_bps (u32 LE)
///   [40..44] kyc_discount_bps (u32 LE)
///   [44..48] max_spread_bps (u32 LE)
///   [48]     blocked_jurisdictions bitmask (u8)
///   [49..57] daily_volume_cap_e6 (u64 LE, 0=unlimited)
///   [57..61] impact_k_bps (u32 LE)
///   [61..77] liquidity_notional_e6 (u128 LE)
///   [77..93] max_fill_abs (u128 LE)
pub fn process_init(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 2 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if data.len() < 93 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let lp_pda = &accounts[0];
    let ctx_account = &accounts[1];

    verify_init_preconditions(ctx_account, JPY_MATCHER_MAGIC, "JPY-MATCHER")?;

    let mut ctx_data = ctx_account.try_borrow_mut_data()?;

    write_header(&mut ctx_data, JPY_MATCHER_MAGIC, data[1], lp_pda.key);

    // JPY-matcher-specific header fields
    // Min KYC level
    ctx_data[MIN_KYC_LEVEL_OFFSET] = data[2];
    // Require same jurisdiction
    ctx_data[REQUIRE_SAME_JURISDICTION_OFFSET] = data[3];
    // KYC Registry
    ctx_data[KYC_REGISTRY_OFFSET..KYC_REGISTRY_OFFSET + 32].copy_from_slice(&data[4..36]);

    // Spread params
    ctx_data[BASE_SPREAD_OFFSET..BASE_SPREAD_OFFSET + 4].copy_from_slice(&data[36..40]);
    ctx_data[KYC_DISCOUNT_OFFSET..KYC_DISCOUNT_OFFSET + 4].copy_from_slice(&data[40..44]);
    ctx_data[MAX_SPREAD_OFFSET..MAX_SPREAD_OFFSET + 4].copy_from_slice(&data[44..48]);

    // Blocked jurisdictions bitmask
    ctx_data[BLOCKED_JURISDICTIONS_OFFSET] = data[48];
    // Padding
    ctx_data[157..164].fill(0);

    // Oracle price (init to 0)
    ctx_data[ORACLE_PRICE_OFFSET..ORACLE_PRICE_OFFSET + 8].copy_from_slice(&0u64.to_le_bytes());

    // Daily volume cap
    ctx_data[DAILY_VOLUME_CAP_OFFSET..DAILY_VOLUME_CAP_OFFSET + 8].copy_from_slice(&data[49..57]);

    // Current day volume (init to 0)
    ctx_data[CURRENT_DAY_VOLUME_OFFSET..CURRENT_DAY_VOLUME_OFFSET + 8]
        .copy_from_slice(&0u64.to_le_bytes());

    // Day reset timestamp (init to 0)
    ctx_data[DAY_RESET_TIMESTAMP_OFFSET..DAY_RESET_TIMESTAMP_OFFSET + 8]
        .copy_from_slice(&0i64.to_le_bytes());

    // Impact K
    ctx_data[IMPACT_K_OFFSET..IMPACT_K_OFFSET + 4].copy_from_slice(&data[57..61]);

    // Liquidity + max fill
    ctx_data[LIQUIDITY_OFFSET..LIQUIDITY_OFFSET + 16].copy_from_slice(&data[61..77]);
    ctx_data[MAX_FILL_OFFSET..MAX_FILL_OFFSET + 16].copy_from_slice(&data[77..93]);

    // Zero reserved
    ctx_data[232..CTX_SIZE].fill(0);

    let base_spread = u32::from_le_bytes(data[36..40].try_into().unwrap());
    let kyc_discount = u32::from_le_bytes(data[40..44].try_into().unwrap());

    msg!(
        "INIT: lp_pda={} mode={} min_kyc={} base_spread={} kyc_discount={} blocked=0x{:02x}",
        lp_pda.key,
        data[1],
        data[2],
        base_spread,
        kyc_discount,
        data[48]
    );

    Ok(())
}

/// Tag 0x03: Update oracle price (JPY/USD)
/// Accounts:
///   [0] Authority (signer)
///   [1] Matcher context account (writable)
/// Data:
///   [0]    tag (0x03)
///   [1..9] new_oracle_price_e6 (u64 LE)
pub fn process_oracle_update(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 2 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if data.len() < 9 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let authority = &accounts[0];
    let ctx_account = &accounts[1];

    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if !ctx_account.is_writable {
        return Err(ProgramError::InvalidAccountData);
    }

    {
        let ctx_data = ctx_account.try_borrow_data()?;
        if !verify_magic(&ctx_data) {
            return Err(ProgramError::UninitializedAccount);
        }
    }

    let new_price = u64::from_le_bytes(
        data[1..9].try_into().map_err(|_| ProgramError::InvalidInstructionData)?,
    );

    if new_price == 0 {
        return Err(JpyMatcherError::OraclePriceNotSet.into());
    }

    let mut ctx_data = ctx_account.try_borrow_mut_data()?;
    let old_price = u64::from_le_bytes(
        ctx_data[ORACLE_PRICE_OFFSET..ORACLE_PRICE_OFFSET + 8].try_into().unwrap(),
    );
    ctx_data[ORACLE_PRICE_OFFSET..ORACLE_PRICE_OFFSET + 8]
        .copy_from_slice(&new_price.to_le_bytes());

    msg!("ORACLE_SYNC: old={} new={}", old_price, new_price);

    Ok(())
}
