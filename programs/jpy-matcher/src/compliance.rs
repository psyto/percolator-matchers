use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, msg,
    program_error::ProgramError, pubkey::Pubkey, sysvar::Sysvar,
};

use matcher_common::{verify_lp_pda as verify_lp_pda_common, write_exec_price, compute_exec_price};
use crate::errors::JpyMatcherError;
use crate::state::*;

/// Tag 0x00: Match with compliance verification
/// Accounts:
///   [0] LP PDA (signer)
///   [1] Matcher context account (writable)
///   [2] User's WhitelistEntry PDA (read, optional for compliance bypass)
///   [3] LP owner's WhitelistEntry PDA (read, optional)
pub fn process_match_with_compliance(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 2 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let lp_pda = &accounts[0];
    let ctx_account = &accounts[1];

    verify_lp_pda_common(lp_pda, ctx_account, JPY_MATCHER_MAGIC, "JPY-MATCHER")?;

    let ctx_data = ctx_account.try_borrow_data()?;
    let min_kyc = ctx_data[MIN_KYC_LEVEL_OFFSET];
    let blocked_jurisdictions = ctx_data[BLOCKED_JURISDICTIONS_OFFSET];
    let oracle_price = u64::from_le_bytes(
        ctx_data[ORACLE_PRICE_OFFSET..ORACLE_PRICE_OFFSET + 8].try_into().map_err(|_| ProgramError::InvalidAccountData)?,
    );

    if oracle_price == 0 {
        msg!("JPY-MATCHER: Oracle price not set");
        return Err(JpyMatcherError::OraclePriceNotSet.into());
    }

    // === COMPLIANCE CHECKS ===
    let mut user_kyc_level: u8 = 0;

    if accounts.len() > 2 {
        let user_whitelist = &accounts[2];
        let user_wl_data = user_whitelist.try_borrow_data()?;

        // 1. Check KYC level >= minimum
        user_kyc_level = user_wl_data[WHITELIST_KYC_LEVEL_OFFSET];
        if user_kyc_level < min_kyc {
            msg!(
                "JPY-MATCHER: Insufficient KYC level: {} < {}",
                user_kyc_level,
                min_kyc
            );
            return Err(JpyMatcherError::InsufficientKycLevel.into());
        }

        // 2. Check KYC not expired
        let user_expiry = i64::from_le_bytes(
            user_wl_data[WHITELIST_EXPIRY_OFFSET..WHITELIST_EXPIRY_OFFSET + 8]
                .try_into()
                .map_err(|_| ProgramError::InvalidAccountData)?,
        );
        let clock = Clock::get()?;
        if clock.unix_timestamp > user_expiry {
            msg!(
                "JPY-MATCHER: KYC expired: now={} > expiry={}",
                clock.unix_timestamp,
                user_expiry
            );
            return Err(JpyMatcherError::KycExpired.into());
        }

        // 3. Check jurisdiction not blocked
        let user_jurisdiction = user_wl_data[WHITELIST_JURISDICTION_OFFSET];
        if user_jurisdiction < 8 && (blocked_jurisdictions >> user_jurisdiction) & 1 == 1 {
            msg!(
                "JPY-MATCHER: Jurisdiction {} is blocked (mask=0x{:02x})",
                user_jurisdiction,
                blocked_jurisdictions
            );
            return Err(JpyMatcherError::JurisdictionBlocked.into());
        }

        // 4. Check daily volume cap
        let daily_cap = u64::from_le_bytes(
            ctx_data[DAILY_VOLUME_CAP_OFFSET..DAILY_VOLUME_CAP_OFFSET + 8]
                .try_into()
                .map_err(|_| ProgramError::InvalidAccountData)?,
        );
        if daily_cap > 0 {
            let current_volume = u64::from_le_bytes(
                ctx_data[CURRENT_DAY_VOLUME_OFFSET..CURRENT_DAY_VOLUME_OFFSET + 8]
                    .try_into()
                    .map_err(|_| ProgramError::InvalidAccountData)?,
            );
            let day_reset = i64::from_le_bytes(
                ctx_data[DAY_RESET_TIMESTAMP_OFFSET..DAY_RESET_TIMESTAMP_OFFSET + 8]
                    .try_into()
                    .map_err(|_| ProgramError::InvalidAccountData)?,
            );
            let clock = Clock::get()?;

            // Reset volume if new day (86400 seconds per day)
            let effective_volume = if clock.unix_timestamp > day_reset + 86400 {
                0u64 // Volume resets
            } else {
                current_volume
            };

            // Parse trade size from instruction data if available
            let trade_size = if data.len() >= 9 {
                u64::from_le_bytes(data[1..9].try_into().unwrap_or([0u8; 8]))
            } else {
                0
            };

            if effective_volume.saturating_add(trade_size) > daily_cap {
                msg!(
                    "JPY-MATCHER: Daily volume cap exceeded: {} + {} > {}",
                    effective_volume,
                    trade_size,
                    daily_cap
                );
                return Err(JpyMatcherError::DailyVolumeLimitExceeded.into());
            }
        }

        // 5. Check same jurisdiction requirement (if LP whitelist provided)
        let require_same = ctx_data[REQUIRE_SAME_JURISDICTION_OFFSET];
        if require_same == 1 && accounts.len() > 3 {
            let lp_whitelist = &accounts[3];
            let lp_wl_data = lp_whitelist.try_borrow_data()?;
            let lp_jurisdiction = lp_wl_data[WHITELIST_JURISDICTION_OFFSET];
            if user_jurisdiction != lp_jurisdiction {
                msg!(
                    "JPY-MATCHER: Jurisdiction mismatch: user={} lp={}",
                    user_jurisdiction,
                    lp_jurisdiction
                );
                return Err(JpyMatcherError::JurisdictionMismatch.into());
            }
        }
    } else if min_kyc > 0 {
        // KYC required but no whitelist account provided
        msg!("JPY-MATCHER: KYC required but no WhitelistEntry provided");
        return Err(JpyMatcherError::InsufficientKycLevel.into());
    }

    // === PRICING ===
    let base_spread = u32::from_le_bytes(
        ctx_data[BASE_SPREAD_OFFSET..BASE_SPREAD_OFFSET + 4].try_into().map_err(|_| ProgramError::InvalidAccountData)?,
    );

    // KYC tier discount (Institutional gets lower fees)
    let discount = if user_kyc_level >= KYC_INSTITUTIONAL {
        u32::from_le_bytes(
            ctx_data[KYC_DISCOUNT_OFFSET..KYC_DISCOUNT_OFFSET + 4].try_into().map_err(|_| ProgramError::InvalidAccountData)?,
        )
    } else {
        0
    };

    let effective_spread = base_spread.saturating_sub(discount);
    let max_spread = u32::from_le_bytes(
        ctx_data[MAX_SPREAD_OFFSET..MAX_SPREAD_OFFSET + 4].try_into().map_err(|_| ProgramError::InvalidAccountData)?,
    );
    let capped_spread = std::cmp::min(effective_spread, max_spread);

    let exec_price = compute_exec_price(oracle_price, capped_spread as u64)?;

    drop(ctx_data);

    // Write execution price to return buffer
    let mut ctx_data = ctx_account.try_borrow_mut_data()?;
    write_exec_price(&mut ctx_data, exec_price);

    // Update daily volume
    if data.len() >= 9 {
        let trade_size = u64::from_le_bytes(data[1..9].try_into().unwrap_or([0u8; 8]));
        let current_volume = u64::from_le_bytes(
            ctx_data[CURRENT_DAY_VOLUME_OFFSET..CURRENT_DAY_VOLUME_OFFSET + 8]
                .try_into()
                .map_err(|_| ProgramError::InvalidAccountData)?,
        );
        let day_reset = i64::from_le_bytes(
            ctx_data[DAY_RESET_TIMESTAMP_OFFSET..DAY_RESET_TIMESTAMP_OFFSET + 8]
                .try_into()
                .map_err(|_| ProgramError::InvalidAccountData)?,
        );
        let clock = Clock::get()?;

        if clock.unix_timestamp > day_reset + 86400 {
            // New day — reset volume and update timestamp
            ctx_data[CURRENT_DAY_VOLUME_OFFSET..CURRENT_DAY_VOLUME_OFFSET + 8]
                .copy_from_slice(&trade_size.to_le_bytes());
            ctx_data[DAY_RESET_TIMESTAMP_OFFSET..DAY_RESET_TIMESTAMP_OFFSET + 8]
                .copy_from_slice(&clock.unix_timestamp.to_le_bytes());
        } else {
            let new_volume = current_volume.saturating_add(trade_size);
            ctx_data[CURRENT_DAY_VOLUME_OFFSET..CURRENT_DAY_VOLUME_OFFSET + 8]
                .copy_from_slice(&new_volume.to_le_bytes());
        }
    }

    msg!(
        "MATCH: price={} spread={} kyc_level={}",
        exec_price,
        capped_spread,
        user_kyc_level
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::state::*;
    use matcher_common::compute_exec_price;

    /// Helper: replicates the pricing logic from process_match_with_compliance
    /// without requiring any Solana runtime state.
    fn calc_price(
        oracle_price: u64,
        base_spread: u32,
        discount: u32,
        max_spread: u32,
    ) -> u64 {
        let effective_spread = base_spread.saturating_sub(discount);
        let capped_spread = std::cmp::min(effective_spread, max_spread);
        compute_exec_price(oracle_price, capped_spread as u64)
            .expect("compute_exec_price should not overflow in test")
    }

    // ---------------------------------------------------------------
    // 1. Normal pricing — no KYC discount
    // ---------------------------------------------------------------
    #[test]
    fn test_normal_pricing_no_discount() {
        let oracle: u64 = 150_000_000;
        let price = calc_price(oracle, 30, 0, 100);
        // 150_000_000 * 10030 / 10000 = 150_450_000
        assert_eq!(price, 150_450_000);
    }

    // ---------------------------------------------------------------
    // 2. Institutional KYC discount
    // ---------------------------------------------------------------
    #[test]
    fn test_institutional_kyc_discount() {
        let oracle: u64 = 150_000_000;
        // base=30, discount=10 → effective=20
        let price = calc_price(oracle, 30, 10, 100);
        // 150_000_000 * 10020 / 10000 = 150_300_000
        assert_eq!(price, 150_300_000);
    }

    // ---------------------------------------------------------------
    // 3. Spread capping
    // ---------------------------------------------------------------
    #[test]
    fn test_spread_capping() {
        let oracle: u64 = 150_000_000;
        // base=200, discount=0, max=100 → capped=100
        let price = calc_price(oracle, 200, 0, 100);
        // 150_000_000 * 10100 / 10000 = 151_500_000
        assert_eq!(price, 151_500_000);
    }

    // ---------------------------------------------------------------
    // 4. Full discount — spread saturates to 0
    // ---------------------------------------------------------------
    #[test]
    fn test_full_discount_spread_zero() {
        let oracle: u64 = 150_000_000;
        // base=15, discount=20 → effective = 15.saturating_sub(20) = 0
        let price = calc_price(oracle, 15, 20, 100);
        // spread=0 → price == oracle_price
        assert_eq!(price, oracle);
    }

    // ---------------------------------------------------------------
    // 5. Jurisdiction bitmask logic
    // ---------------------------------------------------------------
    #[test]
    fn test_jurisdiction_bitmask_blocked() {
        let blocked_mask: u8 = 0b0000_0001; // bit 0 set → jurisdiction 0 blocked
        let jurisdiction: u8 = 0;
        // Replicates the check in process_match_with_compliance:
        // jurisdiction < 8 && (mask >> jurisdiction) & 1 == 1
        let is_blocked = jurisdiction < 8 && (blocked_mask >> jurisdiction) & 1 == 1;
        assert!(is_blocked, "Jurisdiction 0 should be blocked when bit 0 is set");
    }

    #[test]
    fn test_jurisdiction_bitmask_not_blocked() {
        let blocked_mask: u8 = 0b0000_0001; // bit 0 set → only jurisdiction 0 blocked
        let jurisdiction: u8 = 1;
        let is_blocked = jurisdiction < 8 && (blocked_mask >> jurisdiction) & 1 == 1;
        assert!(!is_blocked, "Jurisdiction 1 should NOT be blocked when only bit 0 is set");
    }

    // ---------------------------------------------------------------
    // 6. KYC level constants
    // ---------------------------------------------------------------
    #[test]
    fn test_kyc_level_constants() {
        assert_eq!(KYC_BASIC, 0);
        assert_eq!(KYC_STANDARD, 1);
        assert_eq!(KYC_ENHANCED, 2);
        assert_eq!(KYC_INSTITUTIONAL, 3);
    }
}
