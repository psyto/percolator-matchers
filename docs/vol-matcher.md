# vol-matcher

A [Percolator](https://github.com/nicholasgasior/percolator) custom matching program that prices perpetual contracts where the **underlying is realized volatility**. The mark price tracks [Sigma](https://github.com/nicholasgasior/sigma)'s VarianceTracker (annualized realized vol in bps). Traders go long vol (profit when vol increases) or short vol (profit when vol decreases).

## How It Works

1. Sigma's shared oracle computes realized volatility from on-chain price samples
2. A keeper service reads the VarianceTracker and VolatilityIndex accounts and syncs the vol level to the matcher context
3. The keeper also pushes the vol level to Percolator's oracle authority (Hyperp mode)
4. When a trade executes, Percolator CPI's into vol-matcher which applies a **regime-adaptive spread** based on the current volatility regime

Mark price = current vol level in bps * 1e6. Position P&L = (exit_vol - entry_vol) * notional.

## Volatility Regimes

The spread dynamically adjusts based on Sigma's VolatilityRegime:

| Regime | Vol-of-Vol Multiplier | Behavior |
|--------|----------------------|----------|
| VeryLow | 0.5x | Tight spreads, stable vol |
| Low | 0.75x | Slightly wider |
| Normal | 1.0x | Baseline |
| High | 1.5x | Wider spreads, uncertain vol |
| Extreme | 2.5x | Widest spreads, vol crisis |

Execution price = `vol_mark * (1 + min(base_spread + vov_spread * regime_mult / 100, max_spread) / 10000)`

## Context Account Layout (320 bytes)

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 64 | return_data | Reserved for price return |
| 64 | 8 | magic | `0x564F_4c4d_4154_4348` ("VOLMATCH") |
| 72 | 4 | version | 1 |
| 76 | 1 | mode | 0 = RealizedVol, 1 = ImpliedVol |
| 80 | 32 | lp_pda | LP PDA for signature verification |
| 112 | 4 | base_spread_bps | Base spread around vol mark |
| 116 | 4 | vol_of_vol_spread_bps | Additional spread when vol-of-vol is high |
| 120 | 4 | max_spread_bps | Maximum total spread |
| 124 | 4 | impact_k_bps | Price impact multiplier |
| 128 | 8 | current_vol_bps | Current realized vol from Sigma |
| 136 | 8 | vol_mark_price_e6 | Mark price in e6 |
| 144 | 8 | last_update_slot | Slot of last oracle sync |
| 152 | 1 | current_regime | VolatilityRegime (0-4) |
| 160 | 8 | vol_7d_avg_bps | 7-day average vol |
| 168 | 8 | vol_30d_avg_bps | 30-day average vol |
| 176 | 16 | liquidity_notional_e6 | Quoting depth |
| 192 | 16 | max_fill_abs | Max fill per trade |
| 208 | 32 | variance_tracker | Sigma VarianceTracker pubkey |
| 240 | 32 | vol_index | Sigma VolatilityIndex pubkey |
| 272 | 48 | _reserved | Future use |

## Instructions

| Tag | Name | Description |
|-----|------|-------------|
| `0x02` | Init | Store LP PDA, spread params, Sigma oracle pubkeys |
| `0x00` | Match | Verify LP PDA signer, compute regime-adaptive execution price |
| `0x03` | Oracle Sync | Keeper updates vol level and regime from Sigma accounts |

## Project Structure

```
programs/vol-matcher/src/
  lib.rs           # Entrypoint + instruction dispatch
  state.rs         # 320-byte context layout + VolatilityRegime enum
  vol_pricing.rs   # Init, Match, OracleSync logic
  errors.rs        # Custom error codes
app/vol-keeper/src/
  vol-oracle-sync.ts  # Read Sigma oracle -> update matcher context
  crank.ts            # Percolator keeper crank wrapper
cli/vol/src/
  init-vol-market.ts  # Create Hyperp-mode Percolator market
  init-vol-lp.ts      # Create context account + init matcher
  trade-vol.ts        # Long/short vol positions
  vol-status.ts       # Display vol regime + mark price
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
npm run vol:init-market -- --keypair <path> --initial-vol 4500

# Initialize LP with vol-matcher
npm run vol:init-lp -- --keypair <path> --base-spread 20 --vov-spread 30 --max-spread 100

# Start keeper (syncs Sigma oracle -> matcher -> Percolator)
npm run vol:keeper

# Long volatility
npm run vol:trade -- --keypair <path> --side long --size 1000000
```

## License

MIT
