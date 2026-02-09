# percolator-matchers

Custom matching programs for the [Percolator](https://github.com/nicholasgasior/percolator) perpetual futures engine on Solana. Each matcher plugs into Percolator's CPI interface to provide specialized pricing, compliance, or execution logic.

## Programs

| Program | Description | Adaptive Mechanism | Magic |
|---------|-------------|--------------------|-------|
| [privacy-matcher](docs/privacy-matcher.md) | Encrypted trade intents via NaCl solver, preventing MEV/frontrunning | Solver fee adapts to MEV conditions | `PRIVMATC` |
| [vol-matcher](docs/vol-matcher.md) | Volatility perps with regime-adaptive pricing via [Sigma](https://github.com/nicholasgasior/sigma) oracle | Regime multipliers 0.5x--2.5x | `VOLMATCH` |
| [jpy-matcher](docs/jpy-matcher.md) | KYC/jurisdiction-compliant JPY perps via [Meridian](https://github.com/nicholasgasior/meridian) WhitelistEntry | KYC-tiered pricing with institutional discount | `JPYMATCH` |
| [event-matcher](docs/event-matcher.md) | Event probability perps with edge spread and [Kalshify](https://github.com/nicholasgasior/kalshify)-style signal detection | Edge factor up to 10x near 0%/100% | `EVNTMATC` |
| [macro-matcher](programs/macro-matcher/) | Real rate perps with macroeconomic regime-aware pricing (Expansion/Stagnation/Crisis/Recovery) | Regime multipliers 0.6x--2.0x | `MACOMATC` |

All programs share a 320-byte context account layout and use [matcher-common](packages/matcher-common/) for CPI contract utilities.

## Repository Structure

```
percolator-matchers/
├── packages/matcher-common/     # Shared Rust library (CPI helpers, pricing, PDA verification)
├── programs/
│   ├── privacy-matcher/         # On-chain program
│   ├── vol-matcher/
│   ├── jpy-matcher/
│   ├── event-matcher/
│   └── macro-matcher/
├── app/
│   ├── privacy-solver/          # Off-chain solver service (decrypt + execute)
│   ├── vol-keeper/              # Sigma oracle sync + Percolator crank
│   ├── event-oracle/            # Probability aggregation (Kalshi, Polymarket)
│   ├── event-keeper/            # Probability sync + settlement
│   └── macro-keeper/            # FRED data sync + regime detection
├── cli/
│   ├── privacy/                 # Privacy matcher CLI
│   ├── vol/                     # Vol matcher CLI
│   ├── jpy/                     # JPY matcher CLI
│   ├── event/                   # Event matcher CLI
│   └── macro/                   # Macro matcher CLI
├── tests/                       # TypeScript unit tests
├── scripts/                     # Setup, simulation, and backtest scripts
└── docs/                        # Per-matcher documentation
```

## Build & Test

```bash
# Install TypeScript dependencies
npm install

# Rust tests (66 tests across 6 crates)
cargo test --workspace

# Build SBF programs
cargo build-sbf

# TypeScript tests (54 tests — pricing parity with on-chain Rust)
npm test
```

## LP Protection Backtest

Simulates 200 trades per matcher under changing market conditions, comparing each matcher's adaptive spread against a naive fixed spread. Demonstrates why regime-aware pricing protects LPs during high-risk periods.

```bash
npm run backtest
```

Output is deterministic (seeded PRNG, seed=42) and covers five scenarios:

| Matcher | Scenario | Stress Event |
|---------|----------|-------------|
| Vol | VIX-like cycle | VeryLow -> Extreme -> Recovery |
| Macro | 2008-style economic cycle | Expansion -> Crisis -> Recovery |
| Event | Election night | 52% stable -> near-resolution at ~2% |
| Privacy | MEV cycle | Low MEV -> solver fee spike -> Low MEV |
| JPY | BOJ intervention | Normal mixed -> risk spike -> Normal |

For each scenario, the script reports:
- **Per-step detail** (every 10th trade): regime, true risk, adaptive spread, fixed spread, cumulative P&L
- **Summary statistics**: total P&L, max drawdown, Sharpe ratio, win rate
- **Final scorecard**: side-by-side comparison across all 5 matchers

Sample scorecard:

```
  Matcher               Adaptive P&L     Fixed P&L     Advantage
  Vol-Matcher             +3,102 bps    +2,982 bps      +120 bps  █
  Macro-Matcher           +4,505 bps    +2,665 bps    +1,840 bps  ████
  Event-Matcher          +18,945 bps    +9,513 bps    +9,432 bps  ████████████████████
  Privacy-Matcher         +2,025 bps    +1,025 bps    +1,000 bps  ██
  JPY-Matcher               +530 bps      +350 bps      +180 bps  █
```

The pricing functions in the backtest are copied verbatim from `tests/*.test.ts` to ensure parity with the on-chain Rust implementations.

## npm Scripts

### Trading & Setup

```bash
npm run privacy:init-lp          # Initialize privacy matcher LP
npm run privacy:submit-intent    # Encrypt and submit trade intent
npm run vol:init-market           # Generate Percolator market setup for vol perps
npm run vol:trade                 # Generate trade command for vol perps
npm run jpy:init-market           # Generate inverted USD/JPY market setup
npm run jpy:trade                 # Trade with automatic KYC verification
npm run event:trade               # Execute probability trade
npm run macro:init-market         # Generate real rate market setup
npm run macro:init-lp             # Initialize macro matcher LP
npm run macro:trade               # Trade real interest rates
npm run macro:status              # Check regime, real rate, mark price
```

### Off-chain Services

```bash
npm run privacy:solver           # Solver daemon (decrypt + execute intents)
npm run vol:keeper               # Sigma oracle sync + Percolator crank
npm run event:oracle             # Probability aggregation (Kalshi, Polymarket)
npm run event:keeper             # Probability sync + settlement
npm run macro:keeper             # FRED data sync + regime detection
```

### Testing & Simulation

```bash
npm test                         # 54 TypeScript pricing tests
npm run backtest                 # LP protection backtest (200 trades x 5 matchers)
npm run setup:devnet             # Deploy and configure on devnet
```

## Pricing Formulas

All matchers use the same base formula from `matcher-common`:

```
exec_price = price * (10_000 + spread_bps) / 10_000
```

Each matcher computes `spread_bps` differently:

| Matcher | Spread Formula |
|---------|---------------|
| **Vol** | `min(base + vov * regime_multiplier/100, max)` — multiplier: 50 (VeryLow) to 250 (Extreme) |
| **Macro** | `min(base + regime_spread * regime_multiplier/100 + signal, max)` — multiplier: 60 (Expansion) to 200 (Crisis) |
| **Event** | `min(base + edge * edge_factor/1e6 + signal, max)` — edge_factor: `1/(4*p*(1-p))` capped at 10x |
| **Privacy** | `min(base + solver_fee, max)` |
| **JPY** | `min(max(base - kyc_discount, 0), max)` — discount for institutional KYC only |

## License

MIT
