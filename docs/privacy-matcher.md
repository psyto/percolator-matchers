# privacy-matcher

A [Percolator](https://github.com/nicholasgasior/percolator) custom matching program that accepts **encrypted trade intents** via an off-chain solver, preventing MEV and frontrunning on Solana perpetual futures.

## How It Works

1. User encrypts order parameters (size, direction, max slippage) with the solver's X25519 public key using NaCl box
2. Solver decrypts the intent, validates parameters, and computes fair pricing
3. Solver updates the matcher's cached oracle price and submits the trade through Percolator's `trade-cpi`
4. The on-chain matcher verifies the LP PDA signature, applies spread, and writes the execution price to the return buffer

The solver is the only entity that sees decrypted orders. Extraction is bounded by `max_spread_bps`.

## Architecture

```
User                     Solver                   Percolator
  |                        |                         |
  |-- encrypt(intent) ---->|                         |
  |                        |-- update oracle price -->|
  |                        |-- trade-cpi ----------->|
  |                        |                         |-- CPI --> privacy-matcher
  |                        |                         |           verify LP PDA
  |                        |                         |           compute exec price
  |                        |                         |<-- return price
  |                        |                         |-- settle position
```

## Context Account Layout (320 bytes)

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 64 | return_data | Reserved for price return |
| 64 | 8 | magic | `0x5052_4956_4d41_5443` ("PRIVMATC") |
| 72 | 4 | version | 1 |
| 76 | 1 | mode | 0 = SolverVerified |
| 80 | 32 | lp_pda | LP PDA for signature verification |
| 112 | 32 | solver_pubkey | Authorized solver wallet |
| 144 | 4 | base_spread_bps | Minimum spread |
| 148 | 4 | max_spread_bps | Maximum spread cap |
| 152 | 4 | solver_fee_bps | Solver's fee on top of spread |
| 156 | 8 | last_oracle_price_e6 | Cached oracle price |
| 164 | 8 | last_exec_price_e6 | Last execution price |
| 172 | 16 | total_volume_e6 | Lifetime volume |
| 188 | 8 | total_orders | Lifetime order count |
| 196 | 32 | solver_encryption_pubkey | Solver's X25519 public key |
| 228 | 92 | _reserved | Future use |

## Instructions

| Tag | Name | Description |
|-----|------|-------------|
| `0x02` | Init | Store LP PDA, solver pubkey, spread params, encryption key |
| `0x00` | Match | Verify LP PDA signer, compute `oracle * (1 + min(base + solver_fee, max) / 10000)` |
| `0x03` | Oracle Update | Solver-authorized oracle price update |

## Project Structure

```
programs/privacy-matcher/src/
  lib.rs            # Entrypoint + instruction dispatch
  state.rs          # 320-byte context layout + field offsets
  match_engine.rs   # Init, Match, OracleUpdate logic
  errors.rs         # Custom error codes
app/privacy-solver/src/
  solver.ts         # Poll -> decrypt -> validate -> price -> execute
  encryption.ts     # NaCl box encrypt/decrypt
  config.ts         # Solver configuration types
cli/privacy/src/
  init-privacy-lp.ts   # Create context account + init matcher
  submit-intent.ts     # Encrypt and submit trade intent
  solver-status.ts     # Read matcher context on-chain
```

## Build

```bash
cargo build-sbf
```

## Usage

```bash
# Install dependencies
npm install

# Initialize LP with matcher
npm run privacy:init-lp -- --keypair <path> --solver <pubkey> --base-spread 15 --max-spread 50

# Start solver service
npm run privacy:solver

# Submit encrypted trade intent
npm run privacy:submit-intent -- --size 1000000 --slippage 50 --solver-key <x25519-pubkey>
```

## License

MIT
