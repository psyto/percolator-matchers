# percolator-matchers

Custom matching programs for the [Percolator](https://github.com/nicholasgasior/percolator) perpetual futures engine on Solana. Each matcher plugs into Percolator's CPI interface to provide specialized pricing, compliance, or execution logic.

## Programs

| Program | Description | Magic |
|---------|-------------|-------|
| [privacy-matcher](docs/privacy-matcher.md) | Encrypted trade intents via NaCl solver, preventing MEV/frontrunning | `PRIVMATC` |
| [vol-matcher](docs/vol-matcher.md) | Volatility perps with regime-adaptive pricing via [Sigma](https://github.com/nicholasgasior/sigma) oracle | `VOLMATCH` |
| [jpy-matcher](docs/jpy-matcher.md) | KYC/jurisdiction-compliant JPY perps via [Meridian](https://github.com/nicholasgasior/meridian) WhitelistEntry | `JPYMATCH` |
| [event-matcher](docs/event-matcher.md) | Event probability perps with edge spread and [Kalshify](https://github.com/nicholasgasior/kalshify)-style signal detection | `EVNTMATC` |
| [macro-matcher](programs/macro-matcher/) | Real rate perps with macroeconomic regime-aware pricing (Expansion/Stagnation/Crisis/Recovery) | `MACOMATC` |

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
│   └── event-keeper/            # Probability sync + settlement
├── cli/
│   ├── privacy/                 # Privacy matcher CLI
│   ├── vol/                     # Vol matcher CLI
│   ├── jpy/                     # JPY matcher CLI
│   └── event/                   # Event matcher CLI
├── tests/                       # TypeScript unit tests
├── scripts/                     # Setup and simulation scripts
└── docs/                        # Per-matcher documentation
```

## Build

```bash
# Rust tests (78 tests)
cargo test --workspace

# Build SBF programs
cargo build-sbf

# TypeScript tests (36 tests)
npm install
npm test
```

## License

MIT
