use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, msg,
    program_error::ProgramError, pubkey::Pubkey, sysvar::Sysvar,
};

use matcher_common::{verify_lp_pda as verify_lp_pda_common, verify_init_preconditions, write_header, write_exec_price, compute_exec_price};

use crate::errors::VolMatcherError;
use crate::state::*;

/// Tag 0x02: Initialize vol matcher context
/// Accounts:
///   [0] LP PDA (signer)
///   [1] Matcher context account (writable, 320 bytes)
/// Data layout:
///   [0]    tag (0x02)
///   [1]    mode (u8: 0=RealizedVol, 1=ImpliedVol)
///   [2..6] base_spread_bps (u32 LE)
///   [6..10] vol_of_vol_spread_bps (u32 LE)
///   [10..14] max_spread_bps (u32 LE)
///   [14..18] impact_k_bps (u32 LE)
///   [18..34] liquidity_notional_e6 (u128 LE)
///   [34..50] max_fill_abs (u128 LE)
///   [50..82] variance_tracker pubkey (32 bytes)
///   [82..114] vol_index pubkey (32 bytes)
pub fn process_init(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 2 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if data.len() < 114 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let lp_pda = &accounts[0];
    let ctx_account = &accounts[1];

    // Verify writable, sized, and not already initialized
    verify_init_preconditions(ctx_account, VOL_MATCHER_MAGIC, "VOL-MATCHER")?;

    let mut ctx_data = ctx_account.try_borrow_mut_data()?;

    // Write standard header (return data, magic, version, mode, padding, LP PDA)
    write_header(&mut ctx_data, VOL_MATCHER_MAGIC, data[1], lp_pda.key);

    // Spread params
    ctx_data[BASE_SPREAD_OFFSET..BASE_SPREAD_OFFSET + 4].copy_from_slice(&data[2..6]);
    ctx_data[VOV_SPREAD_OFFSET..VOV_SPREAD_OFFSET + 4].copy_from_slice(&data[6..10]);
    ctx_data[MAX_SPREAD_OFFSET..MAX_SPREAD_OFFSET + 4].copy_from_slice(&data[10..14]);
    ctx_data[IMPACT_K_OFFSET..IMPACT_K_OFFSET + 4].copy_from_slice(&data[14..18]);

    // Initialize vol data to zero
    ctx_data[CURRENT_VOL_OFFSET..CURRENT_VOL_OFFSET + 8].copy_from_slice(&0u64.to_le_bytes());
    ctx_data[VOL_MARK_PRICE_OFFSET..VOL_MARK_PRICE_OFFSET + 8].copy_from_slice(&0u64.to_le_bytes());
    ctx_data[LAST_UPDATE_SLOT_OFFSET..LAST_UPDATE_SLOT_OFFSET + 8].copy_from_slice(&0u64.to_le_bytes());
    ctx_data[REGIME_OFFSET] = 2; // Normal
    ctx_data[REGIME_OFFSET + 1..REGIME_OFFSET + 8].fill(0); // padding
    ctx_data[VOL_7D_AVG_OFFSET..VOL_7D_AVG_OFFSET + 8].copy_from_slice(&0u64.to_le_bytes());
    ctx_data[VOL_30D_AVG_OFFSET..VOL_30D_AVG_OFFSET + 8].copy_from_slice(&0u64.to_le_bytes());

    // Liquidity + max fill
    ctx_data[LIQUIDITY_OFFSET..LIQUIDITY_OFFSET + 16].copy_from_slice(&data[18..34]);
    ctx_data[MAX_FILL_OFFSET..MAX_FILL_OFFSET + 16].copy_from_slice(&data[34..50]);

    // Oracle accounts
    ctx_data[VARIANCE_TRACKER_OFFSET..VARIANCE_TRACKER_OFFSET + 32].copy_from_slice(&data[50..82]);
    ctx_data[VOL_INDEX_OFFSET..VOL_INDEX_OFFSET + 32].copy_from_slice(&data[82..114]);

    // Zero reserved
    ctx_data[272..CTX_SIZE].fill(0);

    msg!(
        "INIT: lp_pda={} mode={} base_spread={} vov_spread={} max_spread={}",
        lp_pda.key,
        data[1],
        u32::from_le_bytes(data[2..6].try_into().unwrap()),
        u32::from_le_bytes(data[6..10].try_into().unwrap()),
        u32::from_le_bytes(data[10..14].try_into().unwrap()),
    );

    Ok(())
}

/// Tag 0x00: Execute match — compute vol-adjusted execution price
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
    verify_lp_pda_common(lp_pda, ctx_account, VOL_MATCHER_MAGIC, "VOL-MATCHER")?;

    // Read pricing parameters
    let ctx_data = ctx_account.try_borrow_data()?;
    let base_spread = u32::from_le_bytes(
        ctx_data[BASE_SPREAD_OFFSET..BASE_SPREAD_OFFSET + 4].try_into().unwrap(),
    );
    let vov_spread = u32::from_le_bytes(
        ctx_data[VOV_SPREAD_OFFSET..VOV_SPREAD_OFFSET + 4].try_into().unwrap(),
    );
    let max_spread = u32::from_le_bytes(
        ctx_data[MAX_SPREAD_OFFSET..MAX_SPREAD_OFFSET + 4].try_into().unwrap(),
    );
    let vol_mark = u64::from_le_bytes(
        ctx_data[VOL_MARK_PRICE_OFFSET..VOL_MARK_PRICE_OFFSET + 8].try_into().unwrap(),
    );
    let regime = VolatilityRegime::from_u8(ctx_data[REGIME_OFFSET]);

    // Reject if vol mark price not set
    if vol_mark == 0 {
        msg!("VOL-MATCHER: Vol mark price not set — oracle sync required");
        return Err(VolMatcherError::OracleNotSynced.into());
    }

    // Check oracle staleness (reject if > 100 slots old)
    let last_update = u64::from_le_bytes(
        ctx_data[LAST_UPDATE_SLOT_OFFSET..LAST_UPDATE_SLOT_OFFSET + 8].try_into().unwrap(),
    );
    let clock = Clock::get()?;
    if clock.slot.saturating_sub(last_update) > 100 {
        msg!("VOL-MATCHER: Oracle stale — last update slot {}, current {}", last_update, clock.slot);
        return Err(VolMatcherError::OracleStale.into());
    }

    // Dynamic spread based on vol regime
    let regime_multiplier = regime.spread_multiplier();
    let adjusted_vov = (vov_spread as u64)
        .checked_mul(regime_multiplier)
        .ok_or(VolMatcherError::ArithmeticOverflow)?
        / 100;

    let total_spread = std::cmp::min(
        (base_spread as u64).saturating_add(adjusted_vov),
        max_spread as u64,
    );

    // Compute execution price using shared utility
    let exec_price = compute_exec_price(vol_mark, total_spread)?;

    drop(ctx_data);

    // Write execution price to return buffer using shared utility
    let mut ctx_data = ctx_account.try_borrow_mut_data()?;
    write_exec_price(&mut ctx_data, exec_price);

    msg!(
        "MATCH: price={} spread={} regime={:?} vol_mark={}",
        exec_price,
        total_spread,
        regime,
        vol_mark
    );

    Ok(())
}

/// Tag 0x03: Sync oracle — keeper reads Sigma oracle and updates matcher context
/// Accounts:
///   [0] Matcher context account (writable)
///   [1] Sigma VarianceTracker account (read)
///   [2] Sigma VolatilityIndex account (read)
/// Data layout:
///   [0]    tag (0x03)
///   [1..9] current_vol_bps (u64 LE) — from keeper reading Sigma oracle
///   [9..17] vol_mark_price_e6 (u64 LE) — vol * 1e6
///   [17]   regime (u8)
///   [18..26] vol_7d_avg_bps (u64 LE)
///   [26..34] vol_30d_avg_bps (u64 LE)
pub fn process_oracle_sync(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 3 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    if data.len() < 34 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let ctx_account = &accounts[0];
    let variance_tracker = &accounts[1];
    let vol_index = &accounts[2];

    if !ctx_account.is_writable {
        return Err(ProgramError::InvalidAccountData);
    }

    // Verify context is initialized
    {
        let ctx_data = ctx_account.try_borrow_data()?;
        if !verify_magic(&ctx_data) {
            return Err(ProgramError::UninitializedAccount);
        }

        // Verify passed accounts match stored oracle accounts
        let stored_vt = Pubkey::new_from_array(
            ctx_data[VARIANCE_TRACKER_OFFSET..VARIANCE_TRACKER_OFFSET + 32].try_into().unwrap(),
        );
        let stored_vi = Pubkey::new_from_array(
            ctx_data[VOL_INDEX_OFFSET..VOL_INDEX_OFFSET + 32].try_into().unwrap(),
        );
        if *variance_tracker.key != stored_vt {
            msg!("VOL-MATCHER: VarianceTracker mismatch");
            return Err(VolMatcherError::OracleAccountMismatch.into());
        }
        if *vol_index.key != stored_vi {
            msg!("VOL-MATCHER: VolatilityIndex mismatch");
            return Err(VolMatcherError::OracleAccountMismatch.into());
        }
    }

    let current_vol = u64::from_le_bytes(data[1..9].try_into().unwrap());
    let vol_mark = u64::from_le_bytes(data[9..17].try_into().unwrap());
    let regime = data[17];
    let vol_7d = u64::from_le_bytes(data[18..26].try_into().unwrap());
    let vol_30d = u64::from_le_bytes(data[26..34].try_into().unwrap());

    // Validate regime
    if regime > 4 {
        return Err(VolMatcherError::InvalidRegime.into());
    }

    let clock = Clock::get()?;

    let mut ctx_data = ctx_account.try_borrow_mut_data()?;
    let old_vol = u64::from_le_bytes(
        ctx_data[CURRENT_VOL_OFFSET..CURRENT_VOL_OFFSET + 8].try_into().unwrap(),
    );

    ctx_data[CURRENT_VOL_OFFSET..CURRENT_VOL_OFFSET + 8].copy_from_slice(&current_vol.to_le_bytes());
    ctx_data[VOL_MARK_PRICE_OFFSET..VOL_MARK_PRICE_OFFSET + 8].copy_from_slice(&vol_mark.to_le_bytes());
    ctx_data[LAST_UPDATE_SLOT_OFFSET..LAST_UPDATE_SLOT_OFFSET + 8].copy_from_slice(&clock.slot.to_le_bytes());
    ctx_data[REGIME_OFFSET] = regime;
    ctx_data[VOL_7D_AVG_OFFSET..VOL_7D_AVG_OFFSET + 8].copy_from_slice(&vol_7d.to_le_bytes());
    ctx_data[VOL_30D_AVG_OFFSET..VOL_30D_AVG_OFFSET + 8].copy_from_slice(&vol_30d.to_le_bytes());

    msg!(
        "ORACLE_SYNC: old_vol={} new_vol={} mark={} regime={}",
        old_vol,
        current_vol,
        vol_mark,
        regime
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
        vov_spread: u32,
        max_spread: u32,
        regime: VolatilityRegime,
        vol_mark: u64,
    ) -> u64 {
        let regime_multiplier = regime.spread_multiplier();
        let adjusted_vov = (vov_spread as u64) * regime_multiplier / 100;
        let total_spread = std::cmp::min(
            (base_spread as u64).saturating_add(adjusted_vov),
            max_spread as u64,
        );
        compute_exec_price(vol_mark, total_spread).unwrap()
    }

    // -----------------------------------------------------------------------
    // 1. Normal regime
    // -----------------------------------------------------------------------
    #[test]
    fn test_normal_regime_pricing() {
        let price = calc_exec_price(20, 30, 200, VolatilityRegime::Normal, 4_500_000_000);
        // adjusted_vov = 30 * 100 / 100 = 30
        // total_spread = min(20 + 30, 200) = 50
        // exec_price   = 4_500_000_000 * 10050 / 10000 = 4_522_500_000
        assert_eq!(price, 4_522_500_000);
    }

    // -----------------------------------------------------------------------
    // 2. Extreme regime
    // -----------------------------------------------------------------------
    #[test]
    fn test_extreme_regime_pricing() {
        let price = calc_exec_price(20, 30, 200, VolatilityRegime::Extreme, 4_500_000_000);
        // adjusted_vov = 30 * 250 / 100 = 75
        // total_spread = min(20 + 75, 200) = 95
        // exec_price   = 4_500_000_000 * 10095 / 10000 = 4_542_750_000
        assert_eq!(price, 4_542_750_000);
    }

    // -----------------------------------------------------------------------
    // 3. VeryLow regime
    // -----------------------------------------------------------------------
    #[test]
    fn test_very_low_regime_pricing() {
        let price = calc_exec_price(20, 30, 200, VolatilityRegime::VeryLow, 4_500_000_000);
        // adjusted_vov = 30 * 50 / 100 = 15
        // total_spread = min(20 + 15, 200) = 35
        // exec_price   = 4_500_000_000 * 10035 / 10000 = 4_515_750_000
        assert_eq!(price, 4_515_750_000);
    }

    // -----------------------------------------------------------------------
    // 4. Spread capping (total_spread exceeds max_spread)
    // -----------------------------------------------------------------------
    #[test]
    fn test_spread_capping() {
        let price = calc_exec_price(100, 200, 150, VolatilityRegime::Extreme, 4_500_000_000);
        // adjusted_vov = 200 * 250 / 100 = 500
        // total_spread = min(100 + 500, 150) = 150
        // exec_price   = 4_500_000_000 * 10150 / 10000 = 4_567_500_000
        assert_eq!(price, 4_567_500_000);
    }

    // -----------------------------------------------------------------------
    // 5. VolatilityRegime::from_u8
    // -----------------------------------------------------------------------
    #[test]
    fn test_regime_from_u8() {
        assert_eq!(VolatilityRegime::from_u8(0), VolatilityRegime::VeryLow);
        assert_eq!(VolatilityRegime::from_u8(1), VolatilityRegime::Low);
        assert_eq!(VolatilityRegime::from_u8(2), VolatilityRegime::Normal);
        assert_eq!(VolatilityRegime::from_u8(3), VolatilityRegime::High);
        assert_eq!(VolatilityRegime::from_u8(4), VolatilityRegime::Extreme);
        // Out-of-range defaults to Normal
        assert_eq!(VolatilityRegime::from_u8(5), VolatilityRegime::Normal);
    }

    // -----------------------------------------------------------------------
    // 6. VolatilityRegime::spread_multiplier
    // -----------------------------------------------------------------------
    #[test]
    fn test_regime_spread_multiplier() {
        assert_eq!(VolatilityRegime::VeryLow.spread_multiplier(), 50);
        assert_eq!(VolatilityRegime::Low.spread_multiplier(), 75);
        assert_eq!(VolatilityRegime::Normal.spread_multiplier(), 100);
        assert_eq!(VolatilityRegime::High.spread_multiplier(), 150);
        assert_eq!(VolatilityRegime::Extreme.spread_multiplier(), 250);
    }
}
