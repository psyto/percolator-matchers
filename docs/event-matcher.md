# event-matcher

A [Percolator](https://github.com/nicholasgasior/percolator) custom matching program for **perpetual contracts on event probabilities**. Traders take leveraged perpetual positions on a continuous probability (0-100%). The mark price = event probability * 1,000,000. Funding rate anchors the perp price to the oracle probability.

## How It Works

1. An oracle service aggregates event probability from multiple sources (Polymarket, Kalshi, custom feeds)
2. A keeper syncs the probability to the matcher context and Percolator's oracle authority (Hyperp mode)
3. On each trade, the matcher computes execution price with **edge spread** that widens dramatically near 0% and 100%
4. [Kalshify](https://github.com/nicholasgasior/kalshify)-style signal detection (volume spikes, whale alerts) dynamically widens spreads
5. When the event resolves, the oracle snaps probability to 0 or 1,000,000 and all positions settle at the terminal value

## Edge Spread

Near probability extremes, pricing becomes uncertain. The edge factor widens the spread:

```
edge_factor = 1 / (p * (1 - p) * 4)    capped at 10x

At 50%:  factor = 1.0   (no extra spread)
At 10%:  factor = 2.78  (wider)
At  1%:  factor = 25.3  (very wide, capped at 10x)
```

Total spread = `base_spread + edge_spread * edge_factor + signal_adjustment`

## Signal Severity

Unusual activity on source markets triggers spread widening:

| Severity | Description | Effect |
|----------|-------------|--------|
| NONE (0) | Normal conditions | No adjustment |
| LOW (1) | Mild activity change | Slight widening |
| HIGH (2) | Volume spike / rapid price move | Moderate widening |
| CRITICAL (3) | Whale alert / volatility clustering | Maximum widening |

## Context Account Layout (320 bytes)

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 64 | return_data | Reserved for price return |
| 64 | 8 | magic | `0x4556_4e54_4d41_5443` ("EVNTMATC") |
| 72 | 4 | version | 1 |
| 76 | 1 | mode | 0 = Continuous, 1 = BinarySettlement |
| 80 | 32 | lp_pda | LP PDA for signature verification |
| 112 | 4 | base_spread_bps | Base spread |
| 116 | 4 | edge_spread_bps | Extra spread near 0% or 100% |
| 120 | 4 | max_spread_bps | Maximum spread |
| 124 | 4 | impact_k_bps | Impact multiplier |
| 128 | 8 | current_probability_e6 | Current probability (0 - 1,000,000) |
| 136 | 8 | probability_mark_e6 | Mark price = probability * 1e6 |
| 144 | 8 | last_update_slot | Slot of last probability sync |
| 152 | 8 | resolution_timestamp | When event resolves (0 = no expiry) |
| 160 | 1 | is_resolved | 0 = active, 1 = resolved |
| 161 | 1 | resolution_outcome | 0 = NO, 1 = YES |
| 168 | 8 | signal_severity | Current signal severity (0-3) |
| 176 | 8 | signal_adjusted_spread | Spread adjustment from signal intel |
| 184 | 16 | liquidity_notional_e6 | Quoting depth |
| 200 | 16 | max_fill_abs | Max fill per trade |
| 216 | 32 | event_oracle | Oracle account for probability |
| 248 | 72 | _reserved | Future use |

## Instructions

| Tag | Name | Description |
|-----|------|-------------|
| `0x02` | Init | Store LP PDA, spread params, oracle pubkey, initial probability |
| `0x00` | Match | Verify LP PDA, compute price with edge spread + signal adjustment |
| `0x03` | Probability Sync | Keeper updates probability and signal severity |
| `0x04` | Resolve | Oracle sets outcome (YES/NO), snaps probability to 0 or 1,000,000 |

## Settlement

When an event resolves:

1. Oracle detects resolution on source platforms
2. Oracle calls `resolve` instruction -> probability snaps to 0 or 1,000,000
3. Keeper updates Percolator oracle authority to terminal value
4. All positions settle through normal Percolator P&L mechanics
5. Long YES positions profit if outcome = YES (probability -> 1,000,000)

## Project Structure

```
programs/event-matcher/src/
  lib.rs            # Entrypoint + instruction dispatch
  state.rs          # 320-byte context layout + signal constants
  probability.rs    # Init, Match (edge spread), ProbabilitySync, Resolve
  errors.rs         # Custom error codes
app/event-oracle/src/
  probability-feed.ts    # Aggregate probability from sources
  kalshi-adapter.ts      # Kalshi API adapter
  polymarket-adapter.ts  # Polymarket API adapter
  signal-detector.ts     # Kalshify-style signal detection
app/event-keeper/src/
  probability-sync.ts    # Push probability to Percolator oracle
  settlement.ts          # Handle event resolution
cli/event/src/
  create-event-market.ts # Create Hyperp-mode event market
  init-event-lp.ts       # Create context account + init matcher
  trade-event.ts         # Long/short probability
  resolve-event.ts       # Settle market on resolution
  list-events.ts         # Show active event markets
```

## Build

```bash
cargo build-sbf
```

## Usage

```bash
# Install dependencies
npm install

# Start oracle service (aggregates Kalshi + Polymarket)
npm run event:oracle

# Start keeper (syncs probability to Percolator)
npm run event:keeper

# Long probability (bet YES)
npm run event:trade -- --keypair <path> --side long --size 1000000
```

## License

MIT
