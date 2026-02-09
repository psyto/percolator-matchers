# Percolator Custom Matching Programs — Complete Analysis

## Overview

Four novel custom matching programs for [Percolator](https://github.com/nicholasgasior/percolator), Anatoly Yakovenko's open-source formally verified risk engine for Solana perpetual futures. Each matcher plugs into Percolator via CPI to determine trade pricing with unique domain-specific logic. A shared library (`matcher-common`) provides common infrastructure.

**Repositories:**

| Repo | GitHub | Description |
|------|--------|-------------|
| `matcher-common` | [psyto/matcher-common](https://github.com/psyto/matcher-common) | Shared utilities for all matchers |
| `privacy-matcher` | [psyto/privacy-matcher](https://github.com/psyto/privacy-matcher) | Encrypted trade intents via solver |
| `vol-matcher` | [psyto/vol-matcher](https://github.com/psyto/vol-matcher) | Volatility perps via Sigma oracle |
| `jpy-matcher` | [psyto/jpy-matcher](https://github.com/psyto/jpy-matcher) | KYC-enforced JPY regulated perps |
| `event-matcher` | [psyto/event-matcher](https://github.com/psyto/event-matcher) | Event probability perps |

**Tech Stack:** Rust 2021, Solana SDK 2.1, Anchor (devnet), Shank IDL 0.4, TypeScript (solvers/keepers/CLI)

---

## Architecture

### CPI Contract

Percolator invokes matchers via Cross-Program Invocation (CPI) during `trade-cpi`. Every matcher uses a fixed 320-byte **context account** with a standardized header:

```
Offset  Size  Field           Type      Description
──────────────────────────────────────────────────────────────
0       64    return_data     [u8;64]   Execution price written here (first 8 bytes)
64       8    magic           u64       Matcher type identifier
72       4    version         u32       Always 1
76       1    mode            u8        Matcher-specific mode
77       3    _pad            [u8;3]    Padding
80      32    lp_pda          Pubkey    LP PDA for signature verification
112    208    (matcher-specific fields)
```

### Instruction Tags

All matchers use raw byte tags for instruction dispatch:

| Tag | Instruction | Description |
|-----|------------|-------------|
| `0x00` | Match | Compute execution price (called by Percolator CPI) |
| `0x02` | Init | Initialize context account with LP PDA and config |
| `0x03` | OracleUpdate / OracleSync / ProbabilitySync | Update oracle data (keeper/solver) |
| `0x04` | Resolve | Event resolution (event-matcher only) |

### Security Model

Every Match instruction performs three critical checks (implemented in `matcher-common`):

1. **LP PDA Signature**: `accounts[0].is_signer` must be true
2. **Magic Verification**: Context account magic bytes must match expected value
3. **LP PDA Match**: `accounts[0].key` must equal the stored LP PDA at offset 80

```rust
pub fn verify_lp_pda(
    lp_pda: &AccountInfo,
    ctx_account: &AccountInfo,
    expected_magic: u64,
    matcher_name: &str,
) -> ProgramResult {
    if !lp_pda.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let ctx_data = ctx_account.try_borrow_data()?;
    if !verify_magic(&ctx_data, expected_magic) {
        return Err(ProgramError::UninitializedAccount);
    }
    let stored_pda = read_lp_pda(&ctx_data);
    if *lp_pda.key != stored_pda {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}
```

### Magic Bytes

Each matcher has a unique 8-byte magic identifier to prevent cross-matcher CPI attacks:

| Matcher | Magic (hex) | ASCII |
|---------|-------------|-------|
| privacy-matcher | `0x5052_4956_4d41_5443` | `PRIVMATC` |
| vol-matcher | `0x564F_4c4d_4154_4348` | `VOLMATCH` |
| jpy-matcher | `0x4A50_594D_4154_4348` | `JPYMATCH` |
| event-matcher | `0x4556_4e54_4d41_5443` | `EVNTMATC` |

---

## 1. matcher-common (Shared Library)

### Purpose

Shared Rust crate providing constants, verification functions, and header utilities used by all four matchers. Eliminates code duplication and ensures consistent CPI contract compliance.

### File Structure

```
matcher-common/
├── Cargo.toml
├── Cargo.lock
└── src/
    └── lib.rs          # All shared logic + 15 tests
```

### Dependencies

```toml
[package]
name = "matcher-common"
version = "0.1.0"
edition = "2021"

[dependencies]
solana-program = "2.1"

[lib]
crate-type = ["lib"]
```

### Public API

| Function | Signature | Description |
|----------|-----------|-------------|
| `read_magic` | `(ctx_data: &[u8]) -> u64` | Read magic bytes from offset 64 |
| `read_lp_pda` | `(ctx_data: &[u8]) -> Pubkey` | Read LP PDA from offset 80 |
| `verify_magic` | `(ctx_data: &[u8], expected: u64) -> bool` | Check magic + minimum size |
| `verify_lp_pda` | `(lp_pda, ctx_account, magic, name) -> ProgramResult` | Full security check |
| `verify_init_preconditions` | `(ctx_account, magic, name) -> ProgramResult` | Pre-init validation |
| `write_header` | `(ctx_data, magic, mode, lp_pda)` | Write standard header fields |
| `write_exec_price` | `(ctx_data, price: u64)` | Write price to return buffer |
| `compute_exec_price` | `(price: u64, spread_bps: u64) -> Result<u64>` | `price * (10000 + spread) / 10000` |

### Constants

```rust
pub const CTX_SIZE: usize = 320;
pub const RETURN_DATA_OFFSET: usize = 0;
pub const RETURN_DATA_SIZE: usize = 64;
pub const MAGIC_OFFSET: usize = 64;
pub const LP_PDA_OFFSET: usize = 80;
```

### Pricing Formula

All matchers use the same base pricing via `compute_exec_price`:

```
exec_price = price * (10_000 + spread_bps) / 10_000
```

Uses `u128` intermediate multiplication to prevent overflow on large prices (e.g., BTC at 70B lamports).

### Tests (15 total)

**Unit tests (6):**
- `test_verify_magic` — correct magic passes
- `test_verify_magic_short_buffer` — undersized buffer fails
- `test_compute_exec_price` — 100M * (10000+50)/10000 = 100.5M
- `test_compute_exec_price_zero_spread` — zero spread returns original price
- `test_write_header` — magic, version, mode, LP PDA written correctly
- `test_write_exec_price` — price written at offset 0

**CPI contract verification tests (9):**
- `test_cpi_contract_header_roundtrip` — write_header creates valid context
- `test_cpi_contract_exec_price_location` — price at offset 0 doesn't corrupt other fields
- `test_cpi_contract_magic_mismatch_rejected` — cross-matcher CPI blocked
- `test_cpi_contract_lp_pda_mismatch_detected` — wrong LP PDA detected
- `test_cpi_contract_uninitialized_context_rejected` — zeroed context fails
- `test_cpi_contract_undersized_context_rejected` — < 320 bytes fails
- `test_cpi_contract_all_four_magics_unique` — all 4 magics are distinct
- `test_cpi_contract_exec_price_overwrite` — new price correctly overwrites old
- `test_cpi_contract_read_magic_short_data` — graceful handling of short data

---

## 2. privacy-matcher

### Concept

A matching program that accepts **encrypted trade intents** via an off-chain solver, preventing MEV and frontrunning. Users encrypt order parameters with the solver's public key. The solver decrypts, computes fair pricing, and submits through Percolator's `trade-cpi`.

### File Structure

```
privacy-matcher/
├── Cargo.toml                          # Workspace root
├── Anchor.toml                         # Devnet: Priv1111...
├── package.json                        # Solver + CLI deps
├── tsconfig.json
├── programs/privacy-matcher/
│   ├── Cargo.toml                      # solana-program 2.1, matcher-common, shank 0.4
│   └── src/
│       ├── lib.rs                      # Entrypoint (3 instructions)
│       ├── instructions.rs             # Shank IDL annotations
│       ├── state.rs                    # Context layout + constants
│       ├── match_engine.rs             # Init + Match + OracleUpdate (409 lines)
│       └── errors.rs                   # 4 error codes
├── solver/src/
│   ├── index.ts                        # Solver service entrypoint
│   ├── config.ts                       # Configuration
│   ├── encryption.ts                   # NaCl box encryption (from Veil)
│   └── solver.ts                       # Poll → decrypt → price → submit
├── cli/src/
│   ├── index.ts                        # CLI commands
│   ├── init-privacy-lp.ts              # Atomic LP + matcher init
│   ├── submit-intent.ts                # Encrypt + submit order intent
│   └── solver-status.ts                # Monitor solver health
├── tests/privacy-matcher.test.ts       # Integration tests
└── scripts/
    ├── setup-devnet.ts                 # Deploy + init market
    └── test-encrypted-trade.ts         # E2E encrypted trade
```

### Context Account Layout (320 bytes)

```
Offset  Size  Field                    Type      Description
──────────────────────────────────────────────────────────────
0       64    return_data              [u8;64]   Execution price return buffer
64       8    magic                    u64       0x5052_4956_4d41_5443 ("PRIVMATC")
72       4    version                  u32       1
76       1    mode                     u8        0=SolverVerified
77       3    _pad                     [u8;3]
80      32    lp_pda                   Pubkey    LP PDA for signature verification
112     32    solver_pubkey            Pubkey    Authorized solver wallet
144      4    base_spread_bps          u32       Minimum spread (e.g., 15 = 0.15%)
148      4    max_spread_bps           u32       Maximum spread cap
152      4    solver_fee_bps           u32       Solver's fee on top of spread
156      8    last_oracle_price_e6     u64       Cached oracle price
164      8    last_exec_price_e6       u64       Last execution price
172     16    total_volume_e6          u128      Lifetime volume
188      8    total_orders             u64       Lifetime order count
196     32    solver_encryption_pubkey [u8;32]   Solver's X25519 public key
228     92    _reserved                [u8;92]   Future use
```

### Instructions

#### Init (Tag 0x02)

**Accounts:** `[0]` LP PDA, `[1]` context (writable), `[2]` solver pubkey

**Data layout:** `tag(1) + base_spread(4) + max_spread(4) + solver_fee(4) + solver_encryption_key(32)`

**Logic:**
1. Call `verify_init_preconditions` (writable, correct size, not already initialized)
2. Validate `base_spread <= max_spread`
3. Write header via `write_header` (magic, version=1, mode=0, LP PDA)
4. Store solver pubkey, spread params, encryption key

#### Match (Tag 0x00)

**Accounts:** `[0]` LP PDA (signer), `[1]` context (writable)

**Logic:**
1. Call `verify_lp_pda` (signature + magic + LP PDA match)
2. Reject if oracle price not set (== 0)
3. Compute: `total_spread = min(base_spread + solver_fee, max_spread)`
4. Compute: `exec_price = compute_exec_price(oracle_price, total_spread)`
5. Write exec price to return buffer
6. Update stats: last_exec_price, order count, total volume

#### OracleUpdate (Tag 0x03)

**Accounts:** `[0]` solver (signer), `[1]` context (writable)

**Logic:**
1. Verify signer matches stored solver pubkey
2. Reject zero prices
3. Update `last_oracle_price_e6`

### Pricing Model

```
total_spread = min(base_spread_bps + solver_fee_bps, max_spread_bps)
exec_price = oracle_price * (10000 + total_spread) / 10000
```

The solver fee compensates the solver for its decryption and pricing service. The max spread caps total extraction.

### Error Codes

| Code | Name | Description |
|------|------|-------------|
| `0x10` | InvalidSpreadConfig | base_spread > max_spread |
| `0x11` | UnauthorizedSolver | Signer doesn't match stored solver |
| `0x12` | OraclePriceNotSet | Oracle price is zero |
| `0x13` | ArithmeticOverflow | Computation overflow |

### Solver Flow

1. User encrypts `{ size, maxSlippageBps, deadline }` with solver's X25519 pubkey
2. User submits encrypted intent (off-chain websocket or on-chain queue)
3. Solver polls, decrypts, validates deadline + slippage
4. Solver updates matcher oracle price (Tag 0x03)
5. Solver calls `percolator-cli trade-cpi` with decrypted parameters
6. Percolator CPI invokes privacy-matcher Match
7. Trade settles through Percolator's risk engine

### Tests (9)

| Test | Description |
|------|-------------|
| `test_normal_pricing` | 100M * (10000+25)/10000 = 100.25M |
| `test_spread_capping` | base(80)+solver(50) capped at max(100) |
| `test_zero_solver_fee` | solver_fee=0, spread=base only |
| `test_large_price_btc` | 70B (BTC-scale), verifies u128 math |
| `test_verify_magic` | Correct magic passes |
| `test_verify_magic_wrong_value` | Wrong magic rejected |
| `test_verify_magic_empty_buffer` | Zeroed buffer rejected |
| `test_read_solver_pubkey` | Pubkey read from offset 112 |
| `test_read_solver_pubkey_zeroed` | Zeroed buffer returns default |

### Cross-Pollination

- **Veil** (`/veil/packages/crypto/src/nacl-box.ts`): NaCl box encryption for solver
- **Veil** (`/veil/apps/confidential-swap-router/solver/`): Solver polling pattern
- **Percolator** demo matcher: Base matcher structure

---

## 3. vol-matcher

### Concept

A matching program that prices perpetual contracts where the **underlying is realized volatility** rather than asset price. The mark price tracks Sigma's VarianceTracker (annualized realized vol in bps). Spreads widen dynamically based on the current volatility regime.

### File Structure

```
vol-matcher/
├── Cargo.toml                          # Workspace root
├── Anchor.toml                         # Devnet: VoLm1111...
├── package.json                        # Keeper + CLI deps
├── tsconfig.json
├── programs/vol-matcher/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                      # Entrypoint (3 instructions)
│       ├── instructions.rs             # Shank IDL annotations
│       ├── state.rs                    # Context layout + VolatilityRegime enum (64 lines)
│       ├── vol_pricing.rs              # Init + Match + OracleSync (361 lines)
│       └── errors.rs                   # 5 error codes
├── keeper/src/
│   ├── index.ts                        # Keeper service entrypoint
│   ├── vol-oracle-sync.ts              # Read Sigma oracle -> update matcher
│   └── crank.ts                        # Percolator keeper crank wrapper
├── cli/src/
│   ├── index.ts
│   ├── init-vol-market.ts              # Init Percolator market for vol
│   ├── init-vol-lp.ts                  # Atomic LP + vol-matcher init
│   ├── trade-vol.ts                    # Long/short vol positions
│   └── vol-status.ts                   # Current vol regime + positions
├── tests/vol-matcher.test.ts
└── scripts/
    ├── setup-vol-market.ts             # Deploy vol perp on devnet
    ├── vol-regime-test.ts              # Test across regimes
    └── vol-crank-bot.ts                # Continuous keeper crank
```

### Context Account Layout (320 bytes)

```
Offset  Size  Field                    Type      Description
──────────────────────────────────────────────────────────────
0       64    return_data              [u8;64]   Execution price return buffer
64       8    magic                    u64       0x564F_4c4d_4154_4348 ("VOLMATCH")
72       4    version                  u32       1
76       1    mode                     u8        0=RealizedVol, 1=ImpliedVol
77       3    _pad                     [u8;3]
80      32    lp_pda                   Pubkey    LP PDA for signature verification
112      4    base_spread_bps          u32       Base spread around vol mark
116      4    vol_of_vol_spread_bps    u32       Additional spread when vol-of-vol is high
120      4    max_spread_bps           u32       Maximum total spread
124      4    impact_k_bps             u32       Price impact multiplier
128      8    current_vol_bps          u64       Current realized vol (from Sigma oracle)
136      8    vol_mark_price_e6        u64       Mark price in e6 (vol level = price)
144      8    last_update_slot         u64       Slot of last vol oracle sync
152      1    current_regime           u8        VolatilityRegime enum (0-4)
153      7    _pad2                    [u8;7]
160      8    vol_7d_avg_bps           u64       7-day average vol
168      8    vol_30d_avg_bps          u64       30-day average vol
176     16    liquidity_notional_e6    u128      Quoting depth for impact
192     16    max_fill_abs             u128      Max fill per trade
208     32    variance_tracker         Pubkey    Sigma VarianceTracker account
240     32    vol_index                Pubkey    Sigma VolatilityIndex account
272     48    _reserved                [u8;48]   Future use
```

### Volatility Regime System

The vol-matcher dynamically adjusts spreads based on the current volatility environment:

| Regime | Value | Spread Multiplier | Effect |
|--------|-------|-------------------|--------|
| VeryLow | 0 | 0.50x | Tighter spreads in calm markets |
| Low | 1 | 0.75x | Slightly tighter |
| Normal | 2 | 1.00x | Baseline |
| High | 3 | 1.50x | Wider spreads during vol spikes |
| Extreme | 4 | 2.50x | Maximum widening during crises |

### Instructions

#### Init (Tag 0x02)

**Accounts:** `[0]` LP PDA, `[1]` context (writable)

**Data layout:** `tag(1) + mode(1) + base_spread(4) + vov_spread(4) + max_spread(4) + impact_k(4) + liquidity(16) + max_fill(16) + variance_tracker(32) + vol_index(32)`

#### Match (Tag 0x00)

**Accounts:** `[0]` LP PDA (signer), `[1]` context (writable)

**Logic:**
1. Verify LP PDA (signature + magic + match)
2. Reject if `vol_mark_price == 0` (oracle not synced)
3. Check oracle staleness (reject if > 100 slots old)
4. Compute regime-adaptive spread:
   ```
   adjusted_vov = vov_spread * regime_multiplier / 100
   total_spread = min(base_spread + adjusted_vov, max_spread)
   ```
5. Compute exec price via `compute_exec_price(vol_mark, total_spread)`
6. Write to return buffer

#### OracleSync (Tag 0x03)

**Accounts:** `[0]` context (writable), `[1]` variance_tracker, `[2]` vol_index

**Logic:**
1. Verify oracle accounts match stored pubkeys
2. Read from Sigma oracle: current_vol, regime, 7d/30d averages
3. Update matcher context fields
4. Mark = current_vol * 1_000_000 (vol in bps scaled to e6)

### Pricing Model

```
adjusted_vov = vov_spread_bps * regime.spread_multiplier() / 100
total_spread = min(base_spread_bps + adjusted_vov, max_spread_bps)
exec_price = vol_mark_price * (10000 + total_spread) / 10000
```

**Example:** 45% annualized vol = 4500 bps = mark price 4,500,000,000 (e6)

### Percolator Market Setup

Uses **Hyperp mode** (`indexFeedId = all zeros`) — admin-controlled oracle:

```typescript
await percolatorCli.initMarket({
    mint: USDC_MINT,
    indexFeedId: "0".repeat(64),  // Hyperp mode
    initialMark: currentVolBps * 1_000_000,
    maintenanceMarginBps: 1000,   // 10% (vol is volatile)
    initialMarginBps: 2000,       // 20%
    tradingFeeBps: 10,            // 0.1%
});
```

### Error Codes

| Code | Name | Description |
|------|------|-------------|
| `0x20` | OracleNotSynced | Vol mark price is zero |
| `0x21` | OracleStale | > 100 slots since last sync |
| `0x22` | OracleAccountMismatch | Oracle accounts don't match stored |
| `0x23` | InvalidRegime | Regime value > 4 |
| `0x24` | ArithmeticOverflow | Computation overflow |

### Tests (6)

| Test | Description |
|------|-------------|
| `test_normal_regime_pricing` | Normal (1.0x): base=20, vov=30, total=50 |
| `test_extreme_regime_pricing` | Extreme (2.5x): adjusted_vov=75, total=95 |
| `test_very_low_regime_pricing` | VeryLow (0.5x): adjusted_vov=15, total=35 |
| `test_spread_capping` | base+adjusted capped at max_spread |
| `test_regime_from_u8` | All 5 + out-of-range defaults to Normal |
| `test_regime_spread_multiplier` | All 5 multiplier values |

### Cross-Pollination

- **Sigma** (`/sigma/programs/shared-oracle/`): VarianceTracker, VolatilityIndex struct layouts
- **Sigma** variance calculation logic: Reference for vol computation
- **Percolator** demo matcher: Base structure

---

## 4. jpy-matcher

### Concept

A matching program that **enforces KYC/jurisdiction compliance** before allowing trades. Reads Meridian's transfer hook WhitelistEntry accounts to verify trader and LP compliance. Uses JPY stablecoin (Token-2022) as collateral. Institutional KYC tiers get fee discounts.

### File Structure

```
jpy-matcher/
├── Cargo.toml                          # Workspace root
├── Anchor.toml                         # Devnet: JPYm1111...
├── package.json                        # CLI deps + @solana/spl-token
├── tsconfig.json
├── programs/jpy-matcher/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                      # Entrypoint (3 instructions)
│       ├── instructions.rs             # Shank IDL (optional WhitelistEntry accounts)
│       ├── state.rs                    # Context layout + KYC constants (39 lines)
│       ├── compliance.rs               # Match with compliance verification (316 lines)
│       ├── pricing.rs                  # Init + OracleUpdate (162 lines)
│       └── errors.rs                   # 8 error codes
├── cli/src/
│   ├── index.ts
│   ├── init-jpy-market.ts              # Init JPY-collateral market
│   ├── init-jpy-lp.ts                  # Atomic LP + matcher init
│   ├── trade-jpy.ts                    # Trade with KYC verification
│   ├── check-compliance.ts             # Check wallet compliance
│   └── admin-whitelist.ts              # Manage whitelist entries
├── tests/jpy-matcher.test.ts
└── scripts/
    ├── setup-jpy-devnet.ts             # Full JPY perp deployment
    ├── test-compliance.ts              # KYC enforcement tests
    └── test-jurisdiction.ts            # Geo-restriction tests
```

### Context Account Layout (320 bytes)

```
Offset  Size  Field                         Type      Description
──────────────────────────────────────────────────────────────────
0       64    return_data                   [u8;64]   Execution price return buffer
64       8    magic                         u64       0x4A50_594D_4154_4348 ("JPYMATCH")
72       4    version                       u32       1
76       1    mode                          u8        0=PassiveKYC, 1=vAMMKYC
77       1    min_kyc_level                 u8        Minimum KycLevel (0-3)
78       1    require_same_jurisdiction     u8        1=both parties same jurisdiction
79       1    _pad                          u8
80      32    lp_pda                        Pubkey    LP PDA for signature verification
112     32    kyc_registry                  Pubkey    Meridian KycRegistry account
144      4    base_spread_bps               u32       Base spread
148      4    kyc_discount_bps              u32       Fee discount for Institutional
152      4    max_spread_bps                u32       Maximum spread
156      1    blocked_jurisdictions         u8        Bitmask (bit0=US, bit1=sanctioned)
157      7    _pad2                         [u8;7]
164      8    last_oracle_price_e6          u64       Cached JPY/USD oracle price
172      8    daily_volume_cap_e6           u64       Max daily volume (0=unlimited)
180      8    current_day_volume_e6         u64       Current day's volume
188      8    day_reset_timestamp           i64       When daily volume resets
196      4    impact_k_bps                  u32       Impact multiplier (vAMM mode)
200     16    liquidity_notional_e6         u128      Quoting depth
216     16    max_fill_abs                  u128      Max fill per trade
232     88    _reserved                     [u8;88]   Future use
```

### KYC Level System

| Level | Value | Description | Fee Discount |
|-------|-------|-------------|-------------|
| Basic | 0 | Minimal verification | None |
| Standard | 1 | ID + address | None |
| Enhanced | 2 | Enhanced due diligence | None |
| Institutional | 3 | Full institutional KYC | `kyc_discount_bps` |

### Meridian WhitelistEntry Offsets

Read from Meridian's transfer-hook WhitelistEntry PDA accounts:

| Offset | Field | Type |
|--------|-------|------|
| 40 | kyc_level | u8 |
| 48 | expiry | i64 |
| 56 | jurisdiction | u8 |

### Instructions

#### Match with Compliance (Tag 0x00)

**Accounts:** `[0]` LP PDA (signer), `[1]` context (writable), `[2]` user WhitelistEntry (optional), `[3]` LP owner WhitelistEntry (optional)

**5-Step Compliance Pipeline:**

1. **KYC Level Check**: `user_kyc_level >= min_kyc`
2. **KYC Expiry Check**: `Clock::get().unix_timestamp <= user_expiry`
3. **Jurisdiction Block Check**: `(blocked_jurisdictions >> user_jurisdiction) & 1 != 1`
4. **Daily Volume Cap**: `effective_volume + trade_size <= daily_cap` (resets after 86400s)
5. **Same Jurisdiction Check**: If `require_same_jurisdiction == 1`, user and LP must match

**Pricing with KYC Discount:**
```
discount = (user_kyc_level >= KYC_INSTITUTIONAL) ? kyc_discount_bps : 0
effective_spread = base_spread.saturating_sub(discount)
capped_spread = min(effective_spread, max_spread)
exec_price = oracle_price * (10000 + capped_spread) / 10000
```

**Post-match:** Updates daily volume counter, resets on new day.

#### Init (Tag 0x02)

**Data layout:** `tag(1) + mode(1) + min_kyc(1) + require_same_jurisdiction(1) + kyc_registry(32) + base_spread(4) + kyc_discount(4) + max_spread(4) + blocked_mask(1) + daily_cap(8) + impact_k(4) + liquidity(16) + max_fill(16)`

#### OracleUpdate (Tag 0x03)

Authority-signed oracle price update. Verifies magic and rejects zero prices.

### Percolator Market Setup

Uses **inverted market** — JPY is both collateral and denomination:

```typescript
await percolatorCli.initMarket({
    mint: JPY_MINT,                    // Token-2022 JPY from Meridian
    indexFeedId: PYTH_JPY_USD_FEED,    // Standard Pyth feed
    invert: 1,                         // Inverted: price = USD/JPY
    maintenanceMarginBps: 500,         // 5%
    initialMarginBps: 1000,            // 10%
    tradingFeeBps: 3,                  // 0.03% (institutional FX)
});
```

### Error Codes

| Code | Name | Description |
|------|------|-------------|
| `0x100` | InsufficientKycLevel | User KYC level below minimum |
| `0x101` | KycExpired | KYC expiry timestamp passed |
| `0x102` | JurisdictionBlocked | User jurisdiction is blocked |
| `0x103` | JurisdictionMismatch | User/LP jurisdiction mismatch |
| `0x104` | DailyVolumeLimitExceeded | Daily volume cap reached |
| `0x105` | OraclePriceNotSet | Oracle price is zero |
| `0x106` | ArithmeticOverflow | Computation overflow |
| `0x107` | InvalidComplianceData | Malformed compliance data |

### Tests (7)

| Test | Description |
|------|-------------|
| `test_normal_pricing_no_discount` | 150M * (10000+30)/10000 = 150.45M |
| `test_institutional_kyc_discount` | base=30, discount=10, effective=20 |
| `test_spread_capping` | base=200 capped at max=100 |
| `test_full_discount_spread_zero` | discount > base, saturates to 0 |
| `test_jurisdiction_bitmask_blocked` | bit 0 set blocks jurisdiction 0 |
| `test_jurisdiction_bitmask_not_blocked` | bit 0 set doesn't block jurisdiction 1 |
| `test_kyc_level_constants` | KYC_BASIC=0, STANDARD=1, ENHANCED=2, INSTITUTIONAL=3 |

### Cross-Pollination

- **Meridian** (`/meridian/programs/transfer-hook/src/state/`): WhitelistEntry struct layout
- **Meridian** (`/meridian/programs/meridian-jpy/`): JPY mint config
- **Continuum** (`/continuum/programs/repo-engine/`): Atomic swap pattern for JPY deposits

---

## 5. event-matcher

### Concept

A matching program for perpetual contracts on **event probabilities**. Traders take leveraged positions on a continuous probability (0-100%). Mark price = probability * 1,000,000. Features edge spread (wider at extremes) and signal intelligence for dynamic spread adjustment.

### File Structure

```
event-matcher/
├── Cargo.toml                          # Workspace root
├── Anchor.toml                         # Devnet: Evnt1111...
├── package.json                        # Oracle + keeper + CLI deps
├── tsconfig.json
├── programs/event-matcher/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                      # Entrypoint (4 instructions)
│       ├── instructions.rs             # Shank IDL annotations
│       ├── state.rs                    # Context layout + signal constants (45 lines)
│       ├── probability.rs              # Init + Match + ProbSync + Resolve (565 lines)
│       └── errors.rs                   # 8 error codes
├── oracle/src/
│   ├── index.ts                        # Event oracle service
│   ├── probability-feed.ts             # Aggregate probability from sources
│   ├── kalshi-adapter.ts               # Read Kalshi prices as probability
│   ├── polymarket-adapter.ts           # Read Polymarket as probability
│   └── signal-detector.ts             # Kalshify-style signal detection
├── keeper/src/
│   ├── index.ts
│   ├── probability-sync.ts             # Push probability to Percolator
│   └── settlement.ts                   # Handle event resolution
├── cli/src/
│   ├── index.ts
│   ├── create-event-market.ts          # Create new event perp
│   ├── init-event-lp.ts                # Atomic LP + matcher init
│   ├── trade-event.ts                  # Long/short probability
│   ├── resolve-event.ts                # Settle market on resolution
│   └── list-events.ts                  # Show active event markets
├── tests/event-matcher.test.ts
└── scripts/
    ├── setup-event-devnet.ts
    ├── test-resolution.ts              # Test convergence to 0/1
    └── simulate-election.ts            # Simulate election market
```

### Context Account Layout (320 bytes)

```
Offset  Size  Field                    Type      Description
──────────────────────────────────────────────────────────────
0       64    return_data              [u8;64]   Execution price return buffer
64       8    magic                    u64       0x4556_4e54_4d41_5443 ("EVNTMATC")
72       4    version                  u32       1
76       1    mode                     u8        0=Continuous, 1=BinarySettlement
77       3    _pad                     [u8;3]
80      32    lp_pda                   Pubkey    LP PDA for signature verification
112      4    base_spread_bps          u32       Base spread
116      4    edge_spread_bps          u32       Extra spread near 0% or 100%
120      4    max_spread_bps           u32       Maximum spread
124      4    impact_k_bps             u32       Impact multiplier
128      8    current_probability_e6   u64       Current probability (0 - 1,000,000)
136      8    probability_mark_e6      u64       Mark price = probability * 1e6
144      8    last_update_slot         u64       Slot of last probability sync
152      8    resolution_timestamp     i64       When event resolves (0=no expiry)
160      1    is_resolved              u8        0=active, 1=resolved
161      1    resolution_outcome       u8        0=NO (prob->0), 1=YES (prob->1M)
162      6    _pad2                    [u8;6]
168      8    signal_severity          u64       Kalshify signal severity (0-3)
176      8    signal_adjusted_spread   u64       Spread adjustment from signal intel
184     16    liquidity_notional_e6    u128      Quoting depth
200     16    max_fill_abs             u128      Max fill per trade
216     32    event_oracle             Pubkey    Oracle account for probability
248     72    _reserved                [u8;72]   Future use
```

### Edge Spread Model

The innovative pricing feature: spreads widen near probability extremes (0% and 100%) where pricing becomes uncertain.

```
edge_factor = 1 / (p * (1-p) * 4)
```

| Probability | Edge Factor | Effect |
|-------------|------------|--------|
| 50% | 1.0x | No extra spread (most liquid) |
| 30% / 70% | ~1.19x | Slightly wider |
| 10% / 90% | ~2.78x | Much wider |
| 5% / 95% | ~5.26x | Very wide |
| 1% / 99% | ~25.3x | Extremely wide |
| 0% / 100% | 10x (capped) | Maximum factor cap |

**Implementation:**
```rust
let p = probability_e6 as u128;
let one_minus_p = 1_000_000u128 - p;
let edge_denominator = p * one_minus_p * 4 / 1_000_000_000_000u128;
let edge_factor = if edge_denominator > 0 {
    std::cmp::min(1_000_000u128 / edge_denominator, 10_000_000) // Cap at 10x
} else {
    10_000_000
};
let adjusted_edge = (edge_spread * edge_factor / 1_000_000) as u64;
```

### Signal Intelligence

Adapted from Kalshify's signal detection system:

| Severity | Value | Description |
|----------|-------|-------------|
| NONE | 0 | Normal conditions |
| LOW | 1 | Minor activity detected |
| HIGH | 2 | Volume spike on source market |
| CRITICAL | 3 | Whale alert / manipulation risk |

The `signal_adjusted_spread` field adds extra bps to the total spread when unusual activity is detected on source markets (Polymarket, Kalshi).

### Instructions

#### Match (Tag 0x00)

**Accounts:** `[0]` LP PDA (signer), `[1]` context (writable)

**Logic:**
1. Verify LP PDA + reject if market resolved
2. Reject if probability == 0 or oracle stale (> 200 slots)
3. Compute edge spread factor based on current probability
4. Compute: `total_spread = min(base + adjusted_edge + signal_adj, max_spread)`
5. Compute: `exec_price = probability_e6 * (10000 + total_spread) / 10000`
6. Write to return buffer

#### Init (Tag 0x02)

**Data layout:** `tag(1) + mode(1) + base_spread(4) + edge_spread(4) + max_spread(4) + impact_k(4) + initial_probability(8) + resolution_timestamp(8) + liquidity(16) + max_fill(16) + event_oracle(32)`

Validates `initial_probability <= 1,000,000`.

#### ProbabilitySync (Tag 0x03)

**Accounts:** `[0]` context (writable), `[1]` event_oracle

**Data layout:** `tag(1) + new_probability(8) + signal_severity(8) + signal_spread(8)`

Updates probability and signal data from oracle service. Rejects if market resolved.

#### Resolve (Tag 0x04)

**Accounts:** `[0]` context (writable), `[1]` event_oracle (signer)

**Data layout:** `tag(1) + outcome(1)` (0=NO, 1=YES)

Sets final probability to 0 or 1,000,000 and marks market as resolved. After resolution:
- Keeper updates Percolator oracle price to terminal value
- All positions effectively settle via normal P&L mechanics
- No more trades accepted

### Percolator Market Setup

Uses **Hyperp mode** — keeper pushes probability as price:

```typescript
await percolatorCli.initMarket({
    mint: USDC_MINT,
    indexFeedId: "0".repeat(64),  // Hyperp — admin-controlled
    initialMark: 500_000,         // 50% initial probability
    maintenanceMarginBps: 1000,   // 10%
    initialMarginBps: 2000,       // 20%
    tradingFeeBps: 5,             // 0.05%
});
```

### Error Codes

| Code | Name | Description |
|------|------|-------------|
| `0x200` | MarketResolved | Market already resolved |
| `0x201` | InvalidProbability | Probability > 1,000,000 |
| `0x202` | ProbabilityNotSet | Probability is zero |
| `0x203` | OracleStale | > 200 slots since last sync |
| `0x204` | OracleMismatch | Oracle account doesn't match stored |
| `0x205` | InvalidOutcome | Outcome not 0 or 1 |
| `0x206` | InvalidSignalSeverity | Signal severity > 3 |
| `0x207` | ArithmeticOverflow | Computation overflow |

### Tests (9)

| Test | Description |
|------|-------------|
| `test_50_percent_probability` | p=500K: edge_factor=1.0, spread=50, price=502,500 |
| `test_10_percent_probability` | p=100K: edge_factor=10x (max), wider spread |
| `test_90_percent_probability` | p=900K: symmetric to 10% |
| `test_1_percent_probability` | p=10K: edge_factor=10x, spread=320, price=10,320 |
| `test_99_percent_probability` | p=990K: symmetric to 1% |
| `test_signal_adjustment` | signal_adj=50 added to total spread |
| `test_max_spread_capping` | Total capped at max_spread |
| `test_max_probability_constant` | MAX_PROBABILITY == 1,000,000 |
| `test_signal_severity_constants` | NONE=0, LOW=1, HIGH=2, CRITICAL=3 |

### Settlement Mechanics

1. Oracle detects resolution on source platforms (Polymarket, Kalshi)
2. Oracle calls Resolve instruction (Tag 0x04) with outcome (YES/NO)
3. Probability snaps to 0 or 1,000,000
4. Keeper updates Percolator oracle to terminal value
5. All positions priced against terminal value
6. Users close positions — longs at prob=1M profit if they were long YES
7. Funding rate becomes zero (mark == oracle)

### Cross-Pollination

- **Velo** (`/velo/program/programs/gucc/`): CongestionEvent resolution pattern
- **Velo** (`/velo/oracle/`): Real-world data oracle integration
- **Kalshify** (`/kalshify/prisma/schema.prisma`): IntelSignal types/severity
- **Komon** (`/komon/programs/market-engine/`): YES/NO staking mechanics (reference)

---

## Test Summary

| Crate | Tests | Categories |
|-------|-------|------------|
| matcher-common | 15 | Unit (6) + CPI contract verification (9) |
| privacy-matcher | 9 | Pricing (4) + State (5) |
| vol-matcher | 6 | Regime pricing (3) + Spread (1) + Enum (2) |
| jpy-matcher | 7 | Pricing (4) + Jurisdiction (2) + Constants (1) |
| event-matcher | 9 | Edge spread (5) + Signal (1) + Capping (1) + Constants (2) |
| **Total** | **46** | **All passing** |

All tests are pure arithmetic with no Solana runtime dependencies, runnable via `cargo test --lib`.

---

## Shank IDL Annotations

All four matchers include `#[derive(ShankInstruction)]` annotations for TypeScript SDK generation:

| Matcher | Enum | Instructions |
|---------|------|-------------|
| privacy-matcher | `PrivacyMatcherInstruction` | Match, Init, OracleUpdate |
| vol-matcher | `VolMatcherInstruction` | Match, Init, OracleSync |
| jpy-matcher | `JpyMatcherInstruction` | Match, Init, OracleUpdate |
| event-matcher | `EventMatcherInstruction` | Match, Init, ProbabilitySync, Resolve |

Generate IDL with:
```bash
shank idl -o target/idl -p <program-path>
```

---

## Commit History

### matcher-common
| Commit | Message |
|--------|---------|
| `f12a608` | Initial implementation of matcher-common shared crate |
| `26e7256` | Add CPI contract verification tests |

### privacy-matcher
| Commit | Message |
|--------|---------|
| `c4b99c6` | Add .gitignore and remove target/ from tracking |
| `94f9cc8` | Add README |
| `5e84545` | Refactor to use shared matcher-common crate |
| `fe458f5` | Add unit tests for pricing logic and state accessors |
| `94adec9` | Add Shank IDL annotations for TypeScript SDK generation |

### vol-matcher
| Commit | Message |
|--------|---------|
| `77632f3` | Add .gitignore and remove target/ from tracking |
| `9192b88` | Add README |
| `e8bd767` | Refactor to use shared matcher-common crate |
| `9977fdb` | Add unit tests for vol regime pricing and spread logic |
| `e15a6e5` | Add Shank IDL annotations for TypeScript SDK generation |

### jpy-matcher
| Commit | Message |
|--------|---------|
| `0f5aa20` | Add .gitignore and remove target/ from tracking |
| `db235a6` | Add README |
| `e2901aa` | Refactor to use shared matcher-common crate |
| `ec7b297` | Add unit tests for compliance pricing and jurisdiction logic |
| `c343aa1` | Add Shank IDL annotations for TypeScript SDK generation |

### event-matcher
| Commit | Message |
|--------|---------|
| `5f5f26e` | Add .gitignore and remove target/ from tracking |
| `ab72de3` | Add README |
| `186b047` | Refactor to use shared matcher-common crate |
| `28f9a2c` | Add unit tests for edge spread and probability pricing |
| `b3e00c8` | Add Shank IDL annotations for TypeScript SDK generation |

---

## Security Checklist

| Check | privacy | vol | jpy | event |
|-------|---------|-----|-----|-------|
| LP PDA `is_signer` | Yes | Yes | Yes | Yes |
| LP PDA matches stored | Yes | Yes | Yes | Yes |
| Magic verification | Yes | Yes | Yes | Yes |
| Init re-initialization prevention | Yes | Yes | Yes | Yes |
| Spread capped at `max_spread_bps` | Yes | Yes | Yes | Yes |
| Checked/saturating arithmetic | Yes | Yes | Yes | Yes |
| Oracle staleness check | N/A (solver) | Yes (100 slots) | N/A | Yes (200 slots) |
| Zero price rejection | Yes | Yes | Yes | Yes (prob=0) |
| Context size validation | Yes | Yes | Yes | Yes |
| Cross-matcher magic isolation | Yes | Yes | Yes | Yes |

---

## Potential Future Work

1. **TypeScript SDK Generation** — Run `shank-cli` to generate IDL, then use `@metaplex-foundation/solita` or `@coral-xyz/anchor` codegen
2. **Devnet Deployment** — Deploy all 4 programs + create Percolator markets
3. **Solver/Keeper Services** — Implement TypeScript services for oracle sync, trade execution
4. **Oracle Integration** — Connect Sigma (vol), Meridian (KYC), Pyth (JPY), Polymarket/Kalshi (events)
5. **Integration Tests** — Full CPI cycle tests with Percolator on localnet
6. **Solver Competition** — Multiple solvers bidding for privacy-matcher trade flow
7. **On-chain Intent Queue** — Move privacy-matcher intents from off-chain to on-chain for censorship resistance
8. **Vol Surface Visualization** — Analytics dashboard for vol regime tracking
