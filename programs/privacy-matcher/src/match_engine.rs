use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, msg, program_error::ProgramError,
    pubkey::Pubkey,
};

use crate::errors::PrivacyMatcherError;
use crate::state::*;
use matcher_common::{
    verify_lp_pda as verify_lp_pda_common, verify_init_preconditions, write_header,
    write_exec_price, compute_exec_price,
};

/// Tag 0x02: Initialize privacy matcher context
/// Accounts:
///   [0] LP PDA (signer — proves LP ownership)
///   [1] Matcher context account (writable, 320 bytes)
///   [2] Solver wallet pubkey
/// Data layout:
///   [0]    tag (0x02)
///   [1..5] base_spread_bps (u32 LE)
///   [5..9] max_spread_bps (u32 LE)
///   [9..13] solver_fee_bps (u32 LE)
///   [13..45] solver_encryption_pubkey ([u8;32])
pub fn process_init(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 3 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if data.len() < 45 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let lp_pda = &accounts[0];
    let ctx_account = &accounts[1];
    let solver = &accounts[2];

    // Verify context account is writable, correct size, and not already initialized
    verify_init_preconditions(ctx_account, PRIVACY_MATCHER_MAGIC, "PRIVACY-MATCHER")?;

    let mut ctx_data = ctx_account.try_borrow_mut_data()?;

    // Write standard header (return data, magic, version, mode, padding, LP PDA)
    write_header(&mut ctx_data, PRIVACY_MATCHER_MAGIC, 0, lp_pda.key);

    // Store solver pubkey
    ctx_data[SOLVER_PUBKEY_OFFSET..SOLVER_PUBKEY_OFFSET + 32]
        .copy_from_slice(&solver.key.to_bytes());

    // Parse spread params
    let base_spread = u32::from_le_bytes(
        data[1..5]
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    );
    let max_spread = u32::from_le_bytes(
        data[5..9]
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    );
    let solver_fee = u32::from_le_bytes(
        data[9..13]
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    );

    // Validate spreads
    if base_spread > max_spread {
        msg!("PRIVACY-MATCHER: base_spread ({}) exceeds max_spread ({})", base_spread, max_spread);
        return Err(PrivacyMatcherError::InvalidSpreadConfig.into());
    }

    ctx_data[BASE_SPREAD_OFFSET..BASE_SPREAD_OFFSET + 4]
        .copy_from_slice(&base_spread.to_le_bytes());
    ctx_data[MAX_SPREAD_OFFSET..MAX_SPREAD_OFFSET + 4]
        .copy_from_slice(&max_spread.to_le_bytes());
    ctx_data[SOLVER_FEE_OFFSET..SOLVER_FEE_OFFSET + 4]
        .copy_from_slice(&solver_fee.to_le_bytes());

    // Initialize oracle price and stats to zero
    ctx_data[ORACLE_PRICE_OFFSET..ORACLE_PRICE_OFFSET + 8].copy_from_slice(&0u64.to_le_bytes());
    ctx_data[LAST_EXEC_PRICE_OFFSET..LAST_EXEC_PRICE_OFFSET + 8]
        .copy_from_slice(&0u64.to_le_bytes());
    ctx_data[TOTAL_VOLUME_OFFSET..TOTAL_VOLUME_OFFSET + 16]
        .copy_from_slice(&0u128.to_le_bytes());
    ctx_data[TOTAL_ORDERS_OFFSET..TOTAL_ORDERS_OFFSET + 8]
        .copy_from_slice(&0u64.to_le_bytes());

    // Store solver encryption pubkey
    ctx_data[SOLVER_ENCRYPTION_KEY_OFFSET..SOLVER_ENCRYPTION_KEY_OFFSET + 32]
        .copy_from_slice(&data[13..45]);

    // Zero reserved area
    ctx_data[228..CTX_SIZE].fill(0);

    msg!(
        "INIT: lp_pda={} solver={} base_spread={} max_spread={} solver_fee={}",
        lp_pda.key,
        solver.key,
        base_spread,
        max_spread,
        solver_fee
    );

    Ok(())
}

/// Tag 0x00: Execute match — compute execution price from solver-verified trade
/// Accounts:
///   [0] LP PDA (signer)
///   [1] Matcher context account (writable)
/// Data layout:
///   [0] tag (0x00)
///   [1..9] trade_size_abs (u64 LE) — absolute trade size for volume tracking
pub fn process_match(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 2 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let lp_pda = &accounts[0];
    let ctx_account = &accounts[1];

    // Verify LP PDA signature, context initialization, and PDA match
    verify_lp_pda_common(lp_pda, ctx_account, PRIVACY_MATCHER_MAGIC, "PRIVACY-MATCHER")?;

    // Read pricing parameters
    let ctx_data = ctx_account.try_borrow_data()?;
    let base_spread = u32::from_le_bytes(
        ctx_data[BASE_SPREAD_OFFSET..BASE_SPREAD_OFFSET + 4]
            .try_into()
            .unwrap(),
    );
    let max_spread = u32::from_le_bytes(
        ctx_data[MAX_SPREAD_OFFSET..MAX_SPREAD_OFFSET + 4]
            .try_into()
            .unwrap(),
    );
    let solver_fee = u32::from_le_bytes(
        ctx_data[SOLVER_FEE_OFFSET..SOLVER_FEE_OFFSET + 4]
            .try_into()
            .unwrap(),
    );
    let oracle_price = u64::from_le_bytes(
        ctx_data[ORACLE_PRICE_OFFSET..ORACLE_PRICE_OFFSET + 8]
            .try_into()
            .unwrap(),
    );

    // Reject if oracle price not set
    if oracle_price == 0 {
        msg!("PRIVACY-MATCHER: Oracle price not set");
        return Err(PrivacyMatcherError::OraclePriceNotSet.into());
    }

    // Compute execution price
    // Total spread = min(base_spread + solver_fee, max_spread)
    let total_spread = std::cmp::min(
        base_spread.saturating_add(solver_fee),
        max_spread,
    );

    let exec_price = compute_exec_price(oracle_price, total_spread as u64)?;

    // Drop read borrow before mutable borrow
    drop(ctx_data);

    // Write execution price to return buffer
    let mut ctx_data = ctx_account.try_borrow_mut_data()?;
    write_exec_price(&mut ctx_data, exec_price);

    // Update last execution price
    ctx_data[LAST_EXEC_PRICE_OFFSET..LAST_EXEC_PRICE_OFFSET + 8]
        .copy_from_slice(&exec_price.to_le_bytes());

    // Update order count
    let count = u64::from_le_bytes(
        ctx_data[TOTAL_ORDERS_OFFSET..TOTAL_ORDERS_OFFSET + 8]
            .try_into()
            .unwrap(),
    );
    ctx_data[TOTAL_ORDERS_OFFSET..TOTAL_ORDERS_OFFSET + 8]
        .copy_from_slice(&count.saturating_add(1).to_le_bytes());

    // Update volume if trade size provided
    if data.len() >= 9 {
        let trade_size = u64::from_le_bytes(
            data[1..9]
                .try_into()
                .map_err(|_| ProgramError::InvalidInstructionData)?,
        );
        let current_volume = u128::from_le_bytes(
            ctx_data[TOTAL_VOLUME_OFFSET..TOTAL_VOLUME_OFFSET + 16]
                .try_into()
                .unwrap(),
        );
        let new_volume = current_volume.saturating_add(trade_size as u128);
        ctx_data[TOTAL_VOLUME_OFFSET..TOTAL_VOLUME_OFFSET + 16]
            .copy_from_slice(&new_volume.to_le_bytes());
    }

    msg!(
        "MATCH: price={} spread={} oracle={}",
        exec_price,
        total_spread,
        oracle_price
    );

    Ok(())
}

/// Tag 0x03: Update oracle price — only callable by authorized solver
/// Accounts:
///   [0] Solver wallet (signer)
///   [1] Matcher context account (writable)
/// Data layout:
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

    let solver = &accounts[0];
    let ctx_account = &accounts[1];

    // Verify solver is signer
    if !solver.is_signer {
        msg!("PRIVACY-MATCHER: Solver must be a signer for oracle update");
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Verify context is initialized
    {
        let ctx_data = ctx_account.try_borrow_data()?;
        if !verify_magic(&ctx_data) {
            return Err(ProgramError::UninitializedAccount);
        }

        // Verify caller is the authorized solver
        let stored_solver = read_solver_pubkey(&ctx_data);
        if *solver.key != stored_solver {
            msg!(
                "PRIVACY-MATCHER: Unauthorized solver: expected {}, got {}",
                stored_solver,
                solver.key
            );
            return Err(PrivacyMatcherError::UnauthorizedSolver.into());
        }
    }

    // Parse new oracle price
    let new_price = u64::from_le_bytes(
        data[1..9]
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    );

    if new_price == 0 {
        msg!("PRIVACY-MATCHER: Oracle price cannot be zero");
        return Err(PrivacyMatcherError::OraclePriceNotSet.into());
    }

    // Write new oracle price
    let mut ctx_data = ctx_account.try_borrow_mut_data()?;
    let old_price = u64::from_le_bytes(
        ctx_data[ORACLE_PRICE_OFFSET..ORACLE_PRICE_OFFSET + 8]
            .try_into()
            .unwrap(),
    );
    ctx_data[ORACLE_PRICE_OFFSET..ORACLE_PRICE_OFFSET + 8]
        .copy_from_slice(&new_price.to_le_bytes());

    msg!("ORACLE_SYNC: old={} new={}", old_price, new_price);

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::state::*;
    use matcher_common::compute_exec_price;
    use solana_program::pubkey::Pubkey;

    #[test]
    fn test_normal_pricing() {
        // oracle=100_000_000, base_spread=15, solver_fee=10, max_spread=100
        // total_spread = min(15 + 10, 100) = 25
        // exec_price = 100_000_000 * (10000 + 25) / 10000 = 100_250_000
        let oracle_price: u64 = 100_000_000;
        let base_spread: u32 = 15;
        let solver_fee: u32 = 10;
        let max_spread: u32 = 100;

        let total_spread = std::cmp::min(base_spread.saturating_add(solver_fee), max_spread);
        assert_eq!(total_spread, 25);

        let exec_price = compute_exec_price(oracle_price, total_spread as u64).unwrap();
        assert_eq!(exec_price, 100_250_000);
    }

    #[test]
    fn test_spread_capping() {
        // base=80, solver=50, max=100
        // total_spread = min(80 + 50, 100) = 100
        // exec_price = 100_000_000 * 10100 / 10000 = 101_000_000
        let oracle_price: u64 = 100_000_000;
        let base_spread: u32 = 80;
        let solver_fee: u32 = 50;
        let max_spread: u32 = 100;

        let total_spread = std::cmp::min(base_spread.saturating_add(solver_fee), max_spread);
        assert_eq!(total_spread, 100);

        let exec_price = compute_exec_price(oracle_price, total_spread as u64).unwrap();
        assert_eq!(exec_price, 101_000_000);
    }

    #[test]
    fn test_zero_solver_fee() {
        // base=15, solver=0, max=100
        // total_spread = min(15 + 0, 100) = 15
        // exec_price = 100_000_000 * 10015 / 10000 = 100_150_000
        let oracle_price: u64 = 100_000_000;
        let base_spread: u32 = 15;
        let solver_fee: u32 = 0;
        let max_spread: u32 = 100;

        let total_spread = std::cmp::min(base_spread.saturating_add(solver_fee), max_spread);
        assert_eq!(total_spread, 15);

        let exec_price = compute_exec_price(oracle_price, total_spread as u64).unwrap();
        assert_eq!(exec_price, 100_150_000);
    }

    #[test]
    fn test_large_price_btc() {
        // oracle=70_000_000_000, base=15, solver=10, max=100
        // total_spread = 25
        // exec_price = 70_000_000_000 * 10025 / 10000 = 70_175_000_000
        let oracle_price: u64 = 70_000_000_000;
        let base_spread: u32 = 15;
        let solver_fee: u32 = 10;
        let max_spread: u32 = 100;

        let total_spread = std::cmp::min(base_spread.saturating_add(solver_fee), max_spread);
        assert_eq!(total_spread, 25);

        let exec_price = compute_exec_price(oracle_price, total_spread as u64).unwrap();
        assert_eq!(exec_price, 70_175_000_000);
    }

    #[test]
    fn test_verify_magic() {
        // Create a 320-byte buffer with the correct magic at offset 64
        let mut data = vec![0u8; CTX_SIZE];
        data[MAGIC_OFFSET..MAGIC_OFFSET + 8]
            .copy_from_slice(&PRIVACY_MATCHER_MAGIC.to_le_bytes());

        assert!(verify_magic(&data));
    }

    #[test]
    fn test_verify_magic_wrong_value() {
        let mut data = vec![0u8; CTX_SIZE];
        data[MAGIC_OFFSET..MAGIC_OFFSET + 8]
            .copy_from_slice(&0xDEAD_BEEF_u64.to_le_bytes());

        assert!(!verify_magic(&data));
    }

    #[test]
    fn test_verify_magic_empty_buffer() {
        let data = vec![0u8; CTX_SIZE];
        assert!(!verify_magic(&data));
    }

    #[test]
    fn test_read_solver_pubkey() {
        // Create a buffer with a known pubkey at SOLVER_PUBKEY_OFFSET (112)
        let mut data = vec![0u8; CTX_SIZE];
        let expected_pubkey = Pubkey::new_unique();
        data[SOLVER_PUBKEY_OFFSET..SOLVER_PUBKEY_OFFSET + 32]
            .copy_from_slice(&expected_pubkey.to_bytes());

        let read_pubkey = read_solver_pubkey(&data);
        assert_eq!(read_pubkey, expected_pubkey);
    }

    #[test]
    fn test_read_solver_pubkey_zeroed() {
        let data = vec![0u8; CTX_SIZE];
        let read_pubkey = read_solver_pubkey(&data);
        assert_eq!(read_pubkey, Pubkey::default());
    }
}
