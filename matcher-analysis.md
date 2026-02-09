# Percolator Custom Matching Programs — Deep Analysis

## 1. privacy-matcher — Encrypted Trade Intents via NaCl Box Solver

### How It Works

The core insight: **traders never reveal their orders on-chain**. Instead, orders are encrypted off-chain and only a trusted solver sees the plaintext.

**The flow:**

1. **User encrypts** their intent — `{ size: i128, maxSlippageBps: u16, deadline: i64 }` (26 bytes) — using NaCl `box` with the solver's X25519 public key (`encryption.ts:13-31`). Each encryption generates a fresh ephemeral keypair, so even repeated identical orders produce different ciphertexts.

2. **Solver decrypts** using `nacl.box.open` (`solver.ts:83-101`), validates the intent (deadline not passed, slippage within bounds, size non-zero at `solver.ts:106-128`), then fetches the current oracle price.

3. **Solver updates the matcher's cached oracle price** via tag `0x03` (`match_engine.rs:281-346`). Only the solver pubkey stored at init can call this — the program verifies `solver.is_signer` and checks against the stored solver pubkey at offset 112.

4. **Solver submits the trade** via Percolator's `trade-cpi`. Percolator CPI's into the matcher's tag `0x00` handler (`match_engine.rs:145-272`), which:
   - Verifies `lp_pda.is_signer` (line 158)
   - Verifies LP PDA matches stored value at offset 80 (line 173)
   - Reads `base_spread_bps`, `solver_fee_bps`, `max_spread_bps` from context
   - Computes: `exec_price = oracle_price * (10000 + min(base + solver_fee, max)) / 10000`
   - Writes the 8-byte result to `ctx_data[0..8]` (the return buffer)
   - Increments `total_orders` and `total_volume`

**Anti-MEV properties:**
- Searchers/validators cannot see order direction or size (encrypted)
- The solver is the only one who can update the oracle price (authorized via stored pubkey)
- `max_spread_bps` caps how much the solver can extract, bounding MEV

### Next Steps

- **Intent delivery mechanism**: Currently `intentQueue` is an in-memory array (`solver.ts:11`). Need either a WebSocket server for real-time intent submission, or an on-chain intent queue program for censorship resistance.
- **Oracle integration**: `fetchOraclePrice()` returns a hardcoded `100_000_000n` (`solver.ts:133-137`). Need to integrate Pyth or Switchboard to read real prices.
- **Solver competition**: Currently single solver. The plan mentions multiple solvers bidding — would need an auction mechanism or round-robin with slashing.
- **`trade-cpi` integration**: `executeTrade()` currently just logs (`solver.ts:164-170`). Need to actually shell out to `percolator-cli trade-cpi` or build the CPI transaction directly.

---

## 2. vol-matcher — Volatility Perps via Sigma Oracle

### How It Works

This creates a **perpetual contract on realized volatility itself**. The "price" of the perp is the annualized vol in bps (e.g., 45% vol = mark price of 4,500,000,000 in e6).

**The flow:**

1. **Keeper reads Sigma's VarianceTracker and VolatilityIndex** accounts on-chain, extracts the current realized vol, vol averages, and volatility regime (VeryLow through Extreme).

2. **Keeper calls tag `0x03` (Oracle Sync)** (`vol_pricing.rs:225-303`), which:
   - Verifies the passed VarianceTracker and VolatilityIndex pubkeys match those stored at offsets 208 and 240 (lines 253-266)
   - Validates the regime is 0-4 (line 276)
   - Writes `current_vol_bps`, `vol_mark_price_e6`, `regime`, `vol_7d_avg`, `vol_30d_avg` to context
   - Stamps `last_update_slot` from `Clock::get()` (line 289)

3. **Keeper also pushes the vol level to Percolator's oracle authority** (Hyperp mode — `indexFeedId` = all zeros means admin-controlled oracle). This is how Percolator's risk engine treats the vol level as the "asset price" for margin calculations.

4. **When a trade executes**, tag `0x00` (`vol_pricing.rs:113-211`):
   - Verifies LP PDA signer + match
   - **Staleness check**: rejects if oracle is >100 slots old (line 171) — prevents trading on stale vol data
   - Reads the regime and computes a dynamic spread:
     ```
     adjusted_vov = vov_spread * regime.spread_multiplier() / 100
     total_spread = min(base_spread + adjusted_vov, max_spread)
     ```
   - Regime multipliers: VeryLow=50 (0.5x), Low=75, Normal=100, High=150, Extreme=250 (2.5x)
   - `exec_price = vol_mark * (10000 + total_spread) / 10000`

**Example**: If vol is 4500 bps (45%), regime is High, base_spread=20, vov_spread=30:
- `adjusted_vov = 30 * 150 / 100 = 45`
- `total_spread = 20 + 45 = 65` bps
- `exec_price = 4_500_000_000 * 10065 / 10000 = 4_529_250_000`

### Next Steps

- **Sigma oracle deserialization**: The keeper currently passes vol data in instruction data (`vol_pricing.rs:269-273`). The keeper needs to actually deserialize Sigma's `VarianceTracker` and `VolatilityIndex` account data. Need to import or replicate Sigma's account struct layouts.
- **Percolator oracle authority sync**: The keeper crank (`crank.ts`) is a placeholder that prints CLI commands. Need to integrate with Percolator's oracle authority update mechanism.
- **Implied vol mode**: `mode=1` (ImpliedVol) is defined in the context layout but not implemented in the match logic — both modes currently use the same pricing.
- **Price impact**: `impact_k_bps` is stored (offset 124) but not used in the match pricing formula. For a production system, larger trades should incur proportionally more impact.

---

## 3. jpy-matcher — KYC/Jurisdiction-Compliant JPY Perps

### How It Works

This is the most complex matcher — it runs a **7-step compliance pipeline** before pricing. The matcher reads Meridian's on-chain WhitelistEntry PDAs to verify KYC status.

**The compliance pipeline** (`compliance.rs:15-235`):

1. **LP PDA verification** (lines 28-44) — standard signer + stored value check

2. **KYC level check** (lines 66-74) — reads `user_wl_data[40]` (WhitelistEntry KYC level offset) and compares against `min_kyc_level` (context offset 77). Levels: Basic(0), Standard(1), Enhanced(2), Institutional(3)

3. **KYC expiry check** (lines 77-90) — reads `user_wl_data[48..56]` as i64, compares against `Clock::get().unix_timestamp`. Expired KYC = rejected.

4. **Jurisdiction bitmask** (lines 93-101) — reads `user_wl_data[56]` as jurisdiction code (0-7), checks against `blocked_jurisdictions` bitmask at context offset 156. If `(mask >> jurisdiction) & 1 == 1`, the jurisdiction is blocked. E.g., `mask=0x03` blocks jurisdictions 0 (US) and 1 (sanctioned).

5. **Daily volume cap** (lines 104-145) — tracks aggregate volume per day with automatic reset when `clock.unix_timestamp > day_reset + 86400`. If `current_volume + trade_size > daily_cap`, rejected.

6. **Same-jurisdiction enforcement** (lines 148-161) — if `require_same_jurisdiction=1` and LP's WhitelistEntry is provided as `accounts[3]`, verifies user and LP jurisdictions match.

7. **Pricing with institutional discount** (lines 169-191):
   ```
   effective_spread = base_spread - (kyc_discount if Institutional else 0)
   capped_spread = min(effective_spread, max_spread)
   exec_price = oracle_price * (10000 + capped_spread) / 10000
   ```

**Inverted market**: JPY is both collateral AND denomination. Percolator is initialized with `invert=1` and the Pyth JPY/USD feed, so the displayed price is USD/JPY. "Long" = long USD (profit if JPY weakens).

### Next Steps

- **WhitelistEntry PDA derivation**: The CLI's `trade-jpy.ts` needs to correctly derive Meridian's WhitelistEntry PDAs from user wallet + registry pubkey. The offsets (40, 48, 56) are hardcoded in `state.rs:33-35` — need to verify these match Meridian's actual struct layout.
- **On-chain oracle integration**: `process_oracle_update` (in `pricing.rs`) is a manual update. Should integrate with Pyth's JPY/USD feed directly or via a keeper that reads Pyth and pushes to the context.
- **Per-user volume tracking**: The daily volume cap (`compliance.rs:104-145`) is aggregate across all users, not per-user. True per-user tracking would require separate PDA accounts per user, which is a significant architectural addition.
- **Token-2022 integration**: The JPY mint uses Token-2022, but the actual deposit/withdrawal flow through Percolator with Token-2022 transfer hooks isn't wired up yet. Need to verify Percolator's vault handles Token-2022 correctly.
- **LP compliance**: LP's WhitelistEntry (`accounts[3]`) is only checked for same-jurisdiction, not for KYC level. May want to enforce LP KYC as well.

---

## 4. event-matcher — Event Probability Perps

### How It Works

Traders take leveraged positions on a **continuous probability** (0-100%). The mark price = probability * 1,000,000. Going long = betting the probability increases (YES). The key innovation is the **edge spread** that widens dramatically near 0% and 100%.

**The pricing** (`probability.rs:132-261`):

1. **Staleness check**: rejects if >200 slots old (line 200)

2. **Edge spread calculation** (lines 210-230):
   ```
   edge_denominator = p * (1-p) * 4 / 1e12
   edge_factor = min(1_000_000 / edge_denominator, 10_000_000)  // cap at 10x
   adjusted_edge = edge_spread * edge_factor / 1_000_000
   ```
   At 50%: `factor = 1e6 / (500000 * 500000 * 4 / 1e12)` = `1e6 / 1e6` = 1.0x
   At 10%: `factor = 1e6 / (100000 * 900000 * 4 / 1e12)` = `1e6 / 360000` = 2.78x
   At 1%:  `factor = 1e6 / (10000 * 990000 * 4 / 1e12)` = `1e6 / 39600` = 25.25x (capped at 10x)

3. **Signal adjustment** (line 234): `signal_adjusted_spread` from Kalshify-style detection is added directly. The oracle service sets this when it detects volume spikes (SIGNAL_HIGH) or whale activity (SIGNAL_CRITICAL).

4. **Final price**: `total_spread = min(base + adjusted_edge + signal_adj, max_spread)`, then `exec_price = probability * (10000 + total_spread) / 10000`

**Resolution** (`probability.rs:359-426`):
- Only the stored oracle can call tag `0x04` (must be signer, line 375)
- Sets `is_resolved=1` and `resolution_outcome` to 0 (NO) or 1 (YES)
- Snaps probability to 0 or 1,000,000
- After this, the keeper pushes the terminal price to Percolator's oracle, and all positions settle via normal P&L mechanics
- Tag `0x00` (Match) rejects after resolution (line 167)
- Tag `0x03` (Probability Sync) also rejects (line 299)

**Settlement example**: Trader goes long at probability=500,000 (50%) with $1000 notional. Event resolves YES (probability -> 1,000,000). P&L = (1,000,000 - 500,000) * notional / 1e6 = +$500.

### Next Steps

- **Oracle service**: The Kalshi and Polymarket adapters (`kalshi-adapter.ts`, `polymarket-adapter.ts`) use placeholder API calls. Need real API integration with proper authentication and rate limiting.
- **Signal detector**: `signal-detector.ts` implements basic heuristics (price move thresholds, volatility clustering). The spread adjustment mapping (severity -> bps) needs calibration against real market data.
- **Oracle authority pattern**: The oracle must be a signer for resolution (line 375), but the current design stores a single oracle pubkey. For decentralization, could use a multisig or a committee oracle.
- **Funding rate calibration**: Percolator's funding rate naturally anchors the perp price to the oracle probability, but the rate parameters (in Percolator's market config) need tuning for probability markets where the range is bounded [0, 1M].
- **Market creation flow**: `create-event-market.ts` prints CLI commands but doesn't execute them. Need end-to-end automation: create Percolator market -> deploy matcher context -> init LP -> start oracle/keeper.

---

## 5. macro-matcher — Real Rate Perps via FRED Macroeconomic Data

### How It Works

Traders take leveraged positions on **real interest rates** (nominal rate minus inflation). The mark price is derived from FRED's SOFR and 5-Year Breakeven Inflation data. Spreads adapt to macroeconomic regimes.

**The flow:**

1. **Keeper fetches FRED data** every 60 seconds — SOFR (nominal rate) and 5-Year Breakeven Inflation. Computes: `real_rate_bps = nominal_bps - inflation_bps`.

2. **Keeper detects macroeconomic regime** (Expansion, Stagnation, Crisis, Recovery) and computes mark price: `mark = max(0, (real_rate_bps + 500) * 10_000)`. The +500 offset keeps mark positive for moderately negative real rates.

3. **Keeper calls tag `0x03` (IndexSync)** to update the matcher context with regime, real rate, and mark price.

4. **When a trade executes**, tag `0x00`:
   - Verifies LP PDA signer + match
   - Computes regime-adaptive spread:
     ```
     adjusted_regime = regime_spread * regime_multiplier / 100
     total_spread = min(base_spread + adjusted_regime + signal_adj, max_spread)
     ```
   - Regime multipliers: Expansion=60 (0.6x), Stagnation=100 (1.0x), Crisis=200 (2.0x), Recovery=125 (1.25x)
   - `exec_price = mark * (10000 + total_spread) / 10000`

**Mark Price Examples:**
| Real Rate | Nominal | Inflation | Mark Price | Trade Direction |
|-----------|---------|-----------|------------|----------------|
| +2% | 5% | 3% | 7,000,000 | LONG profits |
| 0% | 3% | 3% | 5,000,000 | Neutral |
| -1% | 2% | 3% | 4,000,000 | SHORT profits |
| -5% | 0% | 5% | 0 (floor) | Maximum SHORT payout |

### Next Steps

- **FRED API integration**: The keeper needs a valid `FRED_API_KEY` for production data. Rate limit is 120 req/min.
- **Regime detection heuristics**: Currently regime is set manually by the keeper. Automating regime detection from yield curve shape, GDP data, and employment figures would make it fully autonomous.
- **Signal adjustment calibration**: The `signal_adj` parameter is available but needs calibration against historical macro data surprises (NFP, CPI prints, Fed meetings).

---

## LP Protection Backtest

All five matchers now have an LP protection backtest (`npm run backtest`) that simulates 200 trades per matcher under synthetic but realistic market conditions. The backtest compares each matcher's adaptive spread against a naive fixed spread, demonstrating that regime-aware pricing protects LPs during high-risk periods.

**Key results:**

| Matcher | Scenario | Adaptive P&L | Fixed P&L | Advantage |
|---------|----------|-------------|----------|-----------|
| Vol | VeryLow -> Extreme -> Recovery | +3,102 bps | +2,982 bps | +120 bps |
| Macro | Expansion -> Crisis -> Recovery | +4,505 bps | +2,665 bps | +1,840 bps |
| Event | 52% -> near-resolution ~2% | +18,945 bps | +9,513 bps | +9,432 bps |
| Privacy | Low MEV -> spike -> Low MEV | +2,025 bps | +1,025 bps | +1,000 bps |
| JPY | Normal -> BOJ intervention -> Normal | +530 bps | +350 bps | +180 bps |

The event-matcher shows the largest advantage because probability markets near resolution create extreme adverse selection that only adaptive pricing (via the edge factor) can handle. The macro-matcher shows strong protection during the simulated 2008-style crisis, where the 2.0x regime multiplier widens spreads to match elevated true risk.

The backtest uses a seeded PRNG (Mulberry32, seed=42) for deterministic output and pricing functions copied verbatim from `tests/*.test.ts`.

---

## Cross-Cutting Next Steps

1. **Integration tests with a local validator**: None of the projects have `solana-test-validator` based integration tests. The mocha tests are pure TypeScript unit tests that simulate pricing math but don't actually deploy programs or send transactions.

2. **Percolator CPI verification**: The matchers write execution prices to `ctx_data[0..8]`, but we haven't verified that Percolator actually reads the return buffer from this offset during CPI. Need to test against a deployed Percolator instance.

3. **Devnet deployment scripts**: The `setup-*.ts` scripts are guides, not executable scripts. Making them fully executable would be the fastest path to end-to-end validation.

4. **Shared crate for LP PDA verification**: All 5 matchers use the same LP PDA signer + stored value check via `matcher-common`.

5. **Anchor IDL generation**: The programs use raw `solana-program` without Anchor, so there's no IDL. For client ergonomics, generating an IDL (or using Codama/Shank) would help.

6. **Backtest expansion**: Extend `npm run backtest` with historical data replay, multi-seed Monte Carlo simulation, and HTML report generation.

5. **Anchor IDL generation**: The programs use raw `solana-program` without Anchor, so there's no IDL. For client ergonomics, generating an IDL (or using Codama/Shank) would help.
