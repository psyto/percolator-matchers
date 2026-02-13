use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, msg,
    program_error::ProgramError, pubkey::Pubkey, sysvar::Sysvar,
};

use matcher_common::{
    compute_exec_price, verify_init_preconditions, verify_lp_pda as verify_lp_pda_common,
    write_exec_price, write_header,
};

use crate::errors::MacroMatcherError;
use crate::state::*;

/// Tag 0x02: Initialize macro matcher context
/// Accounts:
///   [0] LP PDA (signer)
///   [1] Matcher context account (writable, 320 bytes)
/// Data layout:
///   [0]    tag (0x02)
///   [1]    mode (u8: 0=RealRate, 1=HousingRatio)
///   [2..6] base_spread_bps (u32 LE)
///   [6..10] regime_spread_bps (u32 LE)
///   [10..14] max_spread_bps (u32 LE)
///   [14..18] impact_k_bps (u32 LE)
///   [18..34] liquidity_notional_e6 (u128 LE)
///   [34..50] max_fill_abs (u128 LE)
///   [50..82] macro_oracle pubkey (32 bytes)
pub fn process_init(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 2 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if data.len() < 82 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let lp_pda = &accounts[0];
    let ctx_account = &accounts[1];

    // Verify writable, sized, and not already initialized
    verify_init_preconditions(ctx_account, MACRO_MATCHER_MAGIC, "MACRO-MATCHER")?;

    let mut ctx_data = ctx_account.try_borrow_mut_data()?;

    // Write standard header (return data, magic, version, mode, padding, LP PDA)
    write_header(&mut ctx_data, MACRO_MATCHER_MAGIC, data[1], lp_pda.key);

    // Spread params
    ctx_data[BASE_SPREAD_OFFSET..BASE_SPREAD_OFFSET + 4].copy_from_slice(&data[2..6]);
    ctx_data[REGIME_SPREAD_OFFSET..REGIME_SPREAD_OFFSET + 4].copy_from_slice(&data[6..10]);
    ctx_data[MAX_SPREAD_OFFSET..MAX_SPREAD_OFFSET + 4].copy_from_slice(&data[10..14]);
    ctx_data[IMPACT_K_OFFSET..IMPACT_K_OFFSET + 4].copy_from_slice(&data[14..18]);

    // Initialize index data to zero (oracle not yet synced)
    ctx_data[CURRENT_INDEX_OFFSET..CURRENT_INDEX_OFFSET + 8]
        .copy_from_slice(&0u64.to_le_bytes());
    ctx_data[INDEX_COMPONENTS_PACKED_OFFSET..INDEX_COMPONENTS_PACKED_OFFSET + 8]
        .copy_from_slice(&0u64.to_le_bytes());
    ctx_data[LAST_UPDATE_SLOT_OFFSET..LAST_UPDATE_SLOT_OFFSET + 8]
        .copy_from_slice(&0u64.to_le_bytes());
    ctx_data[REGIME_OFFSET] = 1; // Stagnation (default)
    ctx_data[REGIME_OFFSET + 1..REGIME_OFFSET + 8].fill(0); // padding

    // Signal (init to none)
    ctx_data[SIGNAL_SEVERITY_OFFSET..SIGNAL_SEVERITY_OFFSET + 8]
        .copy_from_slice(&SIGNAL_NONE.to_le_bytes());
    ctx_data[SIGNAL_ADJUSTED_SPREAD_OFFSET..SIGNAL_ADJUSTED_SPREAD_OFFSET + 8]
        .copy_from_slice(&0u64.to_le_bytes());

    // Liquidity + max fill
    ctx_data[LIQUIDITY_OFFSET..LIQUIDITY_OFFSET + 16].copy_from_slice(&data[18..34]);
    ctx_data[MAX_FILL_OFFSET..MAX_FILL_OFFSET + 16].copy_from_slice(&data[34..50]);

    // Macro oracle
    ctx_data[MACRO_ORACLE_OFFSET..MACRO_ORACLE_OFFSET + 32].copy_from_slice(&data[50..82]);

    // Stats (init to zero)
    ctx_data[TOTAL_VOLUME_OFFSET..TOTAL_VOLUME_OFFSET + 16]
        .copy_from_slice(&0u128.to_le_bytes());
    ctx_data[TOTAL_TRADES_OFFSET..TOTAL_TRADES_OFFSET + 8]
        .copy_from_slice(&0u64.to_le_bytes());

    // Zero reserved
    ctx_data[264..CTX_SIZE].fill(0);

    let base_spread_val = u32::from_le_bytes(data[2..6].try_into().map_err(|_| ProgramError::InvalidInstructionData)?);
    let regime_spread_val = u32::from_le_bytes(data[6..10].try_into().map_err(|_| ProgramError::InvalidInstructionData)?);
    let max_spread_val = u32::from_le_bytes(data[10..14].try_into().map_err(|_| ProgramError::InvalidInstructionData)?);

    msg!(
        "INIT: lp_pda={} mode={} base_spread={} regime_spread={} max_spread={}",
        lp_pda.key,
        data[1],
        base_spread_val,
        regime_spread_val,
        max_spread_val,
    );

    Ok(())
}

/// Tag 0x00: Execute match — compute regime-adjusted execution price
/// Accounts:
///   [0] LP PDA (signer)
///   [1] Matcher context account (writable)
pub fn process_match(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    _data: &[u8],
) -> ProgramResult {
    if accounts.len() < 2 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let lp_pda = &accounts[0];
    let ctx_account = &accounts[1];

    // Verify LP PDA signature, magic, and PDA match
    verify_lp_pda_common(lp_pda, ctx_account, MACRO_MATCHER_MAGIC, "MACRO-MATCHER")?;

    // Read pricing parameters
    let ctx_data = ctx_account.try_borrow_data()?;
    let base_spread = u32::from_le_bytes(
        ctx_data[BASE_SPREAD_OFFSET..BASE_SPREAD_OFFSET + 4]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );
    let regime_spread = u32::from_le_bytes(
        ctx_data[REGIME_SPREAD_OFFSET..REGIME_SPREAD_OFFSET + 4]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );
    let max_spread = u32::from_le_bytes(
        ctx_data[MAX_SPREAD_OFFSET..MAX_SPREAD_OFFSET + 4]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );
    let mark_price = u64::from_le_bytes(
        ctx_data[CURRENT_INDEX_OFFSET..CURRENT_INDEX_OFFSET + 8]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );
    let regime = MacroRegime::from_u8(ctx_data[REGIME_OFFSET]);
    let signal_adj = u64::from_le_bytes(
        ctx_data[SIGNAL_ADJUSTED_SPREAD_OFFSET..SIGNAL_ADJUSTED_SPREAD_OFFSET + 8]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );

    // Reject if index not synced (mark == 0)
    if mark_price == 0 {
        msg!("MACRO-MATCHER: Index not synced — oracle sync required");
        return Err(MacroMatcherError::IndexNotSynced.into());
    }

    // Check oracle staleness (reject if > 150 slots old)
    let last_update = u64::from_le_bytes(
        ctx_data[LAST_UPDATE_SLOT_OFFSET..LAST_UPDATE_SLOT_OFFSET + 8]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );
    let clock = Clock::get()?;
    if clock.slot.saturating_sub(last_update) > MAX_STALENESS_SLOTS {
        msg!(
            "MACRO-MATCHER: Oracle stale — last update slot {}, current {}",
            last_update,
            clock.slot
        );
        return Err(MacroMatcherError::OracleStale.into());
    }

    // Compute regime-adjusted spread
    let regime_multiplier = regime.spread_multiplier();
    let adjusted_regime = (regime_spread as u64)
        .checked_mul(regime_multiplier)
        .ok_or(MacroMatcherError::ArithmeticOverflow)?
        / 100;

    let total_spread = std::cmp::min(
        (base_spread as u64)
            .saturating_add(adjusted_regime)
            .saturating_add(signal_adj),
        max_spread as u64,
    );

    // Compute execution price using shared utility
    let exec_price = compute_exec_price(mark_price, total_spread)?;

    drop(ctx_data);

    // Write execution price to return buffer and update stats
    let mut ctx_data = ctx_account.try_borrow_mut_data()?;
    write_exec_price(&mut ctx_data, exec_price);

    // Update trade stats
    let old_trades = u64::from_le_bytes(
        ctx_data[TOTAL_TRADES_OFFSET..TOTAL_TRADES_OFFSET + 8]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );
    ctx_data[TOTAL_TRADES_OFFSET..TOTAL_TRADES_OFFSET + 8]
        .copy_from_slice(&(old_trades.saturating_add(1)).to_le_bytes());

    msg!(
        "MATCH: price={} spread={} regime={:?} mark={}",
        exec_price,
        total_spread,
        regime,
        mark_price
    );

    Ok(())
}

/// Tag 0x03: Index sync — keeper updates real rate index + signal
/// Accounts:
///   [0] Matcher context account (writable)
///   [1] Macro oracle account (must match stored oracle)
/// Data layout:
///   [0]    tag (0x03)
///   [1..9] current_index_e6 (u64 LE) — real rate mark price
///   [9..17] index_components_packed (u64 LE) — nominal(high32) | inflation(low32)
///   [17..25] signal_severity (u64 LE, 0-3)
///   [25..33] signal_adjusted_spread (u64 LE)
pub fn process_index_sync(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 2 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if data.len() < 33 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let ctx_account = &accounts[0];
    let oracle = &accounts[1];

    if !ctx_account.is_writable {
        return Err(ProgramError::InvalidAccountData);
    }

    // Verify context is initialized and oracle matches
    {
        let ctx_data = ctx_account.try_borrow_data()?;
        if !verify_magic(&ctx_data) {
            return Err(ProgramError::UninitializedAccount);
        }

        let stored_oracle = read_macro_oracle(&ctx_data)?;
        if *oracle.key != stored_oracle {
            msg!("MACRO-MATCHER: Oracle mismatch");
            return Err(MacroMatcherError::OracleMismatch.into());
        }
    }

    let new_index = u64::from_le_bytes(data[1..9].try_into().map_err(|_| ProgramError::InvalidInstructionData)?);
    let components_packed = u64::from_le_bytes(data[9..17].try_into().map_err(|_| ProgramError::InvalidInstructionData)?);
    let signal_severity = u64::from_le_bytes(data[17..25].try_into().map_err(|_| ProgramError::InvalidInstructionData)?);
    let signal_spread = u64::from_le_bytes(data[25..33].try_into().map_err(|_| ProgramError::InvalidInstructionData)?);

    // Validate signal severity
    if signal_severity > SIGNAL_CRITICAL {
        return Err(MacroMatcherError::InvalidSignalSeverity.into());
    }

    let clock = Clock::get()?;

    let mut ctx_data = ctx_account.try_borrow_mut_data()?;
    let old_index = u64::from_le_bytes(
        ctx_data[CURRENT_INDEX_OFFSET..CURRENT_INDEX_OFFSET + 8]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );

    ctx_data[CURRENT_INDEX_OFFSET..CURRENT_INDEX_OFFSET + 8]
        .copy_from_slice(&new_index.to_le_bytes());
    ctx_data[INDEX_COMPONENTS_PACKED_OFFSET..INDEX_COMPONENTS_PACKED_OFFSET + 8]
        .copy_from_slice(&components_packed.to_le_bytes());
    ctx_data[LAST_UPDATE_SLOT_OFFSET..LAST_UPDATE_SLOT_OFFSET + 8]
        .copy_from_slice(&clock.slot.to_le_bytes());
    ctx_data[SIGNAL_SEVERITY_OFFSET..SIGNAL_SEVERITY_OFFSET + 8]
        .copy_from_slice(&signal_severity.to_le_bytes());
    ctx_data[SIGNAL_ADJUSTED_SPREAD_OFFSET..SIGNAL_ADJUSTED_SPREAD_OFFSET + 8]
        .copy_from_slice(&signal_spread.to_le_bytes());

    msg!(
        "INDEX_SYNC: old_index={} new_index={} signal={}",
        old_index,
        new_index,
        signal_severity
    );

    Ok(())
}

/// Tag 0x04: Regime update — change macro regime
/// Accounts:
///   [0] Matcher context account (writable)
///   [1] Macro oracle account (signer, must match stored oracle)
/// Data layout:
///   [0] tag (0x04)
///   [1] new_regime (u8: 0-3)
pub fn process_regime_update(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 2 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if data.len() < 2 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let ctx_account = &accounts[0];
    let oracle = &accounts[1];

    // Oracle must be signer for regime updates
    if !oracle.is_signer {
        msg!("MACRO-MATCHER: Oracle must be signer for regime update");
        return Err(ProgramError::MissingRequiredSignature);
    }

    if !ctx_account.is_writable {
        return Err(ProgramError::InvalidAccountData);
    }

    // Verify context + oracle
    {
        let ctx_data = ctx_account.try_borrow_data()?;
        if !verify_magic(&ctx_data) {
            return Err(ProgramError::UninitializedAccount);
        }

        let stored_oracle = read_macro_oracle(&ctx_data)?;
        if *oracle.key != stored_oracle {
            msg!("MACRO-MATCHER: Oracle mismatch");
            return Err(MacroMatcherError::OracleMismatch.into());
        }
    }

    let new_regime = data[1];
    if new_regime > 3 {
        return Err(MacroMatcherError::InvalidRegime.into());
    }

    let mut ctx_data = ctx_account.try_borrow_mut_data()?;
    let old_regime = ctx_data[REGIME_OFFSET];
    ctx_data[REGIME_OFFSET] = new_regime;

    msg!(
        "REGIME_UPDATE: old={} new={} ({})",
        old_regime,
        new_regime,
        match new_regime {
            0 => "Expansion",
            1 => "Stagnation",
            2 => "Crisis",
            3 => "Recovery",
            _ => "Unknown",
        }
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::state::*;
    use matcher_common::compute_exec_price;

    // ---------------------------------------------------------------------------
    // Helper: replicate the pricing math from process_match for unit-testing
    // without needing Solana account scaffolding.
    // ---------------------------------------------------------------------------
    fn calc_exec_price(
        base_spread: u32,
        regime_spread: u32,
        max_spread: u32,
        regime: MacroRegime,
        mark_price: u64,
        signal_adj: u64,
    ) -> u64 {
        let regime_multiplier = regime.spread_multiplier();
        let adjusted_regime = (regime_spread as u64) * regime_multiplier / 100;
        let total_spread = std::cmp::min(
            (base_spread as u64)
                .saturating_add(adjusted_regime)
                .saturating_add(signal_adj),
            max_spread as u64,
        );
        compute_exec_price(mark_price, total_spread).unwrap()
    }

    fn calc_total_spread(
        base_spread: u32,
        regime_spread: u32,
        max_spread: u32,
        regime: MacroRegime,
        signal_adj: u64,
    ) -> u64 {
        let regime_multiplier = regime.spread_multiplier();
        let adjusted_regime = (regime_spread as u64) * regime_multiplier / 100;
        std::cmp::min(
            (base_spread as u64)
                .saturating_add(adjusted_regime)
                .saturating_add(signal_adj),
            max_spread as u64,
        )
    }

    // -----------------------------------------------------------------------
    // 1. Stagnation regime (1.0x)
    // -----------------------------------------------------------------------
    #[test]
    fn test_stagnation_regime_pricing() {
        // mark = 5_000_000 (0% real rate)
        // regime_spread = 40, multiplier = 100 -> adjusted = 40 * 100 / 100 = 40
        // total_spread = min(20 + 40 + 0, 200) = 60
        // exec_price = 5_000_000 * 10060 / 10000 = 5_030_000
        let price = calc_exec_price(20, 40, 200, MacroRegime::Stagnation, 5_000_000, 0);
        assert_eq!(price, 5_030_000);
    }

    // -----------------------------------------------------------------------
    // 2. Crisis regime (2.0x)
    // -----------------------------------------------------------------------
    #[test]
    fn test_crisis_regime_pricing() {
        // regime_spread = 40, multiplier = 200 -> adjusted = 40 * 200 / 100 = 80
        // total_spread = min(20 + 80 + 0, 200) = 100
        // exec_price = 5_000_000 * 10100 / 10000 = 5_050_000
        let price = calc_exec_price(20, 40, 200, MacroRegime::Crisis, 5_000_000, 0);
        assert_eq!(price, 5_050_000);
    }

    // -----------------------------------------------------------------------
    // 3. Expansion regime (0.6x)
    // -----------------------------------------------------------------------
    #[test]
    fn test_expansion_regime_pricing() {
        // regime_spread = 40, multiplier = 60 -> adjusted = 40 * 60 / 100 = 24
        // total_spread = min(20 + 24 + 0, 200) = 44
        // exec_price = 5_000_000 * 10044 / 10000 = 5_022_000
        let price = calc_exec_price(20, 40, 200, MacroRegime::Expansion, 5_000_000, 0);
        assert_eq!(price, 5_022_000);
    }

    // -----------------------------------------------------------------------
    // 4. Recovery regime (1.25x)
    // -----------------------------------------------------------------------
    #[test]
    fn test_recovery_regime_pricing() {
        // regime_spread = 40, multiplier = 125 -> adjusted = 40 * 125 / 100 = 50
        // total_spread = min(20 + 50 + 0, 200) = 70
        // exec_price = 5_000_000 * 10070 / 10000 = 5_035_000
        let price = calc_exec_price(20, 40, 200, MacroRegime::Recovery, 5_000_000, 0);
        assert_eq!(price, 5_035_000);
    }

    // -----------------------------------------------------------------------
    // 5. Spread capping
    // -----------------------------------------------------------------------
    #[test]
    fn test_spread_capping() {
        // regime_spread = 200, multiplier = 200 (Crisis) -> adjusted = 400
        // total_spread = min(100 + 400 + 0, 150) = 150
        // exec_price = 5_000_000 * 10150 / 10000 = 5_075_000
        let price = calc_exec_price(100, 200, 150, MacroRegime::Crisis, 5_000_000, 0);
        assert_eq!(price, 5_075_000);
    }

    // -----------------------------------------------------------------------
    // 6. Signal adjustment
    // -----------------------------------------------------------------------
    #[test]
    fn test_signal_adjustment() {
        // Stagnation: adjusted_regime = 40 * 100 / 100 = 40
        // total_spread = min(20 + 40 + 30, 200) = 90
        // exec_price = 5_000_000 * 10090 / 10000 = 5_045_000
        let price = calc_exec_price(20, 40, 200, MacroRegime::Stagnation, 5_000_000, 30);
        assert_eq!(price, 5_045_000);
    }

    // -----------------------------------------------------------------------
    // 7. Mark price: positive rate
    // -----------------------------------------------------------------------
    #[test]
    fn test_mark_price_positive_rate() {
        // +2.00% (200 bps) -> mark = 7_000_000
        assert_eq!(compute_mark_price(200), 7_000_000);
    }

    // -----------------------------------------------------------------------
    // 8. Mark price: zero rate
    // -----------------------------------------------------------------------
    #[test]
    fn test_mark_price_zero_rate() {
        // 0.00% (0 bps) -> mark = 5_000_000
        assert_eq!(compute_mark_price(0), 5_000_000);
    }

    // -----------------------------------------------------------------------
    // 9. Mark price: negative rate
    // -----------------------------------------------------------------------
    #[test]
    fn test_mark_price_negative_rate() {
        // -1.00% (-100 bps) -> mark = 4_000_000
        assert_eq!(compute_mark_price(-100), 4_000_000);
    }

    // -----------------------------------------------------------------------
    // 10. Regime constants
    // -----------------------------------------------------------------------
    #[test]
    fn test_regime_constants() {
        assert_eq!(MacroRegime::Expansion.spread_multiplier(), 60);
        assert_eq!(MacroRegime::Stagnation.spread_multiplier(), 100);
        assert_eq!(MacroRegime::Crisis.spread_multiplier(), 200);
        assert_eq!(MacroRegime::Recovery.spread_multiplier(), 125);
    }

    // -----------------------------------------------------------------------
    // 11. Regime from_u8
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // Additional: total spread calculation
    // -----------------------------------------------------------------------
    #[test]
    fn test_total_spread_stagnation() {
        let spread = calc_total_spread(20, 40, 200, MacroRegime::Stagnation, 0);
        assert_eq!(spread, 60);
    }

    #[test]
    fn test_total_spread_crisis_with_signal() {
        let spread = calc_total_spread(20, 40, 200, MacroRegime::Crisis, 50);
        // adjusted = 80, total = 20 + 80 + 50 = 150
        assert_eq!(spread, 150);
    }

    #[test]
    fn test_total_spread_capped() {
        let spread = calc_total_spread(100, 200, 150, MacroRegime::Crisis, 100);
        // adjusted = 400, total = min(100 + 400 + 100, 150) = 150
        assert_eq!(spread, 150);
    }
}
