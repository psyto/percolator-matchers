# jpy-matcher

A [Percolator](https://github.com/nicholasgasior/percolator) custom matching program that **enforces KYC/jurisdiction compliance** before allowing trades. The matcher reads [Meridian](https://github.com/nicholasgasior/meridian)'s transfer hook WhitelistEntry accounts to verify both the trader and LP are KYC-verified. Uses JPY stablecoin (Token-2022) as collateral in an inverted USD/JPY market.

## How It Works

1. On each trade, Percolator CPI's into jpy-matcher with the user's and LP's Meridian WhitelistEntry PDAs as remaining accounts
2. The matcher runs a full compliance pipeline before pricing:
   - KYC level >= configured minimum (Basic / Standard / Enhanced / Institutional)
   - KYC not expired (checked against Solana clock)
   - Jurisdiction not in blocked bitmask (e.g., US, sanctioned)
   - Optional same-jurisdiction enforcement
   - Daily volume cap with automatic day-boundary reset
3. If compliant, the matcher computes execution price with an institutional KYC discount
4. Non-compliant trades are rejected on-chain at the matcher level

## Compliance Pipeline

```
Trade Request
  |
  v
[1] Verify LP PDA signature
  |
  v
[2] Check user KYC level >= min_kyc_level
  |
  v
[3] Check KYC expiry vs Clock::get()
  |
  v
[4] Check jurisdiction bitmask (blocked_jurisdictions)
  |
  v
[5] Check same-jurisdiction (if required)
  |
  v
[6] Check daily volume cap
  |
  v
[7] Compute price (with institutional discount)
  |
  v
Return execution price
```

## Context Account Layout (320 bytes)

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 64 | return_data | Reserved for price return |
| 64 | 8 | magic | `0x4A50_594D_4154_4348` ("JPYMATCH") |
| 72 | 4 | version | 1 |
| 76 | 1 | mode | 0 = PassiveKYC, 1 = vAMMKYC |
| 77 | 1 | min_kyc_level | Minimum KycLevel (0=Basic .. 3=Institutional) |
| 78 | 1 | require_same_jurisdiction | 1 = both parties must match |
| 80 | 32 | lp_pda | LP PDA for signature verification |
| 112 | 32 | kyc_registry | Meridian KycRegistry account |
| 144 | 4 | base_spread_bps | Base spread |
| 148 | 4 | kyc_discount_bps | Fee discount for Institutional KYC |
| 152 | 4 | max_spread_bps | Maximum spread |
| 156 | 1 | blocked_jurisdictions | Bitmask (bit0=US, bit1=sanctioned, ...) |
| 164 | 8 | last_oracle_price_e6 | Cached JPY/USD oracle price |
| 172 | 8 | daily_volume_cap_e6 | Max daily volume per user (0=unlimited) |
| 180 | 8 | current_day_volume_e6 | Current day's volume |
| 188 | 8 | day_reset_timestamp | When daily volume resets |
| 196 | 4 | impact_k_bps | Impact multiplier |
| 200 | 16 | liquidity_notional_e6 | Quoting depth |
| 216 | 16 | max_fill_abs | Max fill per trade |
| 232 | 88 | _reserved | Future use |

## KYC Levels

| Level | Value | Fee Discount |
|-------|-------|-------------|
| Basic | 0 | None |
| Standard | 1 | None |
| Enhanced | 2 | None |
| Institutional | 3 | `kyc_discount_bps` off spread |

## Instructions

| Tag | Name | Description |
|-----|------|-------------|
| `0x02` | Init | Store LP PDA, KYC registry, spread params, compliance config |
| `0x00` | Match | Full compliance check + pricing with institutional discount |
| `0x03` | Oracle Update | Update cached JPY/USD oracle price |

## Project Structure

```
programs/jpy-matcher/src/
  lib.rs          # Entrypoint + instruction dispatch
  state.rs        # 320-byte context layout + WhitelistEntry offsets
  compliance.rs   # Full compliance pipeline + match pricing
  pricing.rs      # Init + oracle update logic
  errors.rs       # Compliance-specific error codes
cli/jpy/src/
  init-jpy-market.ts    # Create inverted USD/JPY Percolator market
  init-jpy-lp.ts        # Create context account + init matcher
  trade-jpy.ts          # Trade with WhitelistEntry PDA derivation
  check-compliance.ts   # Verify wallet compliance status
  admin-whitelist.ts    # Manage whitelist entries
```

## Build

```bash
cargo build-sbf
```

## Usage

```bash
# Install dependencies
npm install

# Initialize inverted JPY market (Token-2022 collateral)
npm run jpy:init-market -- --keypair <path> --jpy-mint <pubkey>

# Initialize LP with compliance config
npm run jpy:init-lp -- --keypair <path> --min-kyc 1 --blocked-jurisdictions 3 --base-spread 10

# Trade USD/JPY (derives WhitelistEntry PDAs automatically)
npm run jpy:trade -- --keypair <path> --side long --size 1000000
```

## License

MIT
