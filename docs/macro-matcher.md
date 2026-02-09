# macro-matcher

A [Percolator](https://github.com/nicholasgasior/percolator) custom matching program that creates a **perpetual contract on the real interest rate** (nominal rate minus inflation expectations). Inspired by Gary Stevenson's "The Trading Game" thesis — that wealth inequality forces interest rates to zero permanently.

**Going LONG = betting real rates rise** (economy recovers, policy works).
**Going SHORT = Stevenson's bet** (inequality keeps rates at zero/negative forever).

The funding rate on this market becomes a real-time, incentive-aligned signal of society's collective belief about whether rates can ever normalize.

## How It Works

1. A keeper service fetches SOFR (nominal rate) and 5-Year Breakeven Inflation from the FRED API
2. Real rate = nominal - inflation. The mark price is shifted by +5.00% to stay positive: `mark = (real_rate_bps + 500) * 10_000`
3. The keeper syncs the real rate index to the matcher context and pushes it to Percolator's oracle authority (Hyperp mode)
4. When a trade executes, Percolator CPI's into macro-matcher which applies a **regime-adaptive spread** based on the current macroeconomic regime

Mark price examples: +2% real rate → 7,000,000 | 0% → 5,000,000 | -1% → 4,000,000 | -5% → 0 (floor).

## Macro Regimes

The spread dynamically adjusts based on the macroeconomic environment:

| Regime | Spread Multiplier | When |
|--------|------------------|------|
| Expansion | 0.60x | Rates rising, GDP growing — tighter spreads |
| Stagnation | 1.00x | Rates flat, low growth — Stevenson's baseline |
| Crisis | 2.00x | Rates collapsing, panic — widest spreads |
| Recovery | 1.25x | Transitional, moderate uncertainty |

Execution price = `mark * (1 + min(base_spread + regime_spread * regime_mult / 100 + signal_adj, max_spread) / 10000)`

## Context Account Layout (320 bytes)

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 64 | return_data | Reserved for price return |
| 64 | 8 | magic | `0x4d41_434f_4d41_5443` ("MACOMATC") |
| 72 | 4 | version | 1 |
| 76 | 1 | mode | 0 = RealRate, 1 = HousingRatio (future) |
| 80 | 32 | lp_pda | LP PDA for signature verification |
| 112 | 4 | base_spread_bps | Base spread |
| 116 | 4 | regime_spread_bps | Additional spread scaled by regime |
| 120 | 4 | max_spread_bps | Maximum spread cap |
| 124 | 4 | impact_k_bps | Price impact multiplier (reserved) |
| 128 | 8 | current_index_e6 | Real rate index mark price (e6) |
| 136 | 8 | index_components_packed | Packed: nominal(high 32) \| inflation(low 32) |
| 144 | 8 | last_update_slot | Slot of last oracle sync |
| 152 | 1 | current_regime | MacroRegime (0-3) |
| 160 | 8 | signal_severity | Signal level (0-3) |
| 168 | 8 | signal_adjusted_spread | Spread adjustment from signal intel |
| 176 | 16 | liquidity_notional_e6 | Quoting depth |
| 192 | 16 | max_fill_abs | Max fill per trade |
| 208 | 32 | macro_oracle | Authorized oracle pubkey |
| 240 | 16 | total_volume_e6 | Lifetime matched volume |
| 256 | 8 | total_trades | Lifetime trade count |
| 264 | 56 | _reserved | Future (Sovereign tier, housing data) |

## Instructions

| Tag | Name | Description |
|-----|------|-------------|
| `0x02` | Init | Store LP PDA, spread params, macro oracle pubkey |
| `0x00` | Match | Verify LP PDA signer, compute regime-adaptive execution price |
| `0x03` | IndexSync | Keeper updates real rate index + signal intelligence |
| `0x04` | RegimeUpdate | Change macro regime (requires oracle signer) |

## Project Structure

```
programs/macro-matcher/src/
  lib.rs           # Entrypoint + instruction dispatch
  state.rs         # 320-byte context layout + MacroRegime enum
  pricing.rs       # Init, Match, IndexSync, RegimeUpdate logic
  errors.rs        # Custom error codes (0x300-0x306)
  instructions.rs  # Shank IDL annotations
app/macro-keeper/src/
  macro-oracle-sync.ts  # Compute real rate -> update matcher context
  data-sources.ts       # FRED API adapter for SOFR, CPI, breakeven
  crank.ts              # Percolator keeper crank wrapper
cli/macro/src/
  init-macro-market.ts  # Create Hyperp-mode Percolator market
  init-macro-lp.ts      # Create context account + init matcher
  trade-macro.ts        # Long/short real rate positions
  macro-status.ts       # Display regime + real rate index
```

## Build

```bash
cargo build-sbf
```

## Usage

```bash
# Install dependencies
npm install

# Initialize Percolator market (Hyperp mode)
npm run macro:init-market -- --keypair <path>

# Initialize LP with macro-matcher
npm run macro:init-lp -- --keypair <path> --base-spread 20 --regime-spread 40 --max-spread 200 --macro-oracle <pubkey>

# Start keeper (syncs FRED data -> matcher -> Percolator)
npm run macro:keeper

# Long real rates (economy recovers)
npm run macro:trade -- --keypair <path> --side long --size 1000000

# Short real rates (Stevenson's bet)
npm run macro:trade -- --keypair <path> --side short --size 1000000
```

## License

MIT
