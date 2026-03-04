/**
 * BTC Market Configuration for Percolator
 *
 * This module defines all BTC-specific parameters for deploying
 * and operating a Bitcoin-collateralized perpetual futures market.
 */

// ============================================================================
// COLLATERAL TOKENS
// ============================================================================

/** cbBTC (Coinbase Wrapped Bitcoin) on Solana mainnet */
export const CBBTC_MINT = "cbbtcn3HgpBkSJRGHZRN4yWZAW2JQhSqDerDoHt5xGCA";

/** cbBTC on devnet (test mint — deploy your own or use a known test mint) */
export const CBBTC_MINT_DEVNET = "cbbtcn3HgpBkSJRGHZRN4yWZAW2JQhSqDerDoHt5xGCA";

/** zBTC (Zeus Network) on Solana mainnet */
export const ZBTC_MINT = "zBTCug37RGYfEHgnmMbLfMKKU3dDHDt9PYZKLL6pumQ";

/** LBTC (Lombard Finance) on Solana mainnet */
export const LBTC_MINT = "LBTCxMPEFBLGrRYMHh42HHfNT6A4cmXXUjQ8FsNpDLU";

// ============================================================================
// PYTH ORACLE FEEDS
// ============================================================================

/** Pyth BTC/USD price feed ID (mainnet + devnet) */
export const PYTH_BTC_USD_FEED_ID =
  "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";

// ============================================================================
// MARKET PARAMETERS
// ============================================================================

export interface BtcMarketConfig {
  /** Collateral token mint address */
  collateralMint: string;
  /** Pyth feed ID (64 hex chars, no 0x prefix) */
  indexFeedId: string;
  /** Max oracle staleness in seconds */
  maxStalenessSecs: string;
  /** Oracle confidence filter in basis points */
  confFilterBps: number;
  /** Invert oracle price (0=no, 1=yes) */
  invert: number;
  /**
   * Unit scale: base tokens per unit.
   * cbBTC has 8 decimals. unit_scale=100 means 100 satoshis = 1 unit.
   * This gives 6-decimal precision (matching USDC convention).
   */
  unitScale: number;
  /** Warmup period in slots before trading is enabled */
  warmupPeriodSlots: string;
  /** Maintenance margin in basis points */
  maintenanceMarginBps: string;
  /** Initial margin in basis points */
  initialMarginBps: string;
  /** Trading fee in basis points */
  tradingFeeBps: string;
  /** Maximum number of accounts (users + LPs) */
  maxAccounts: string;
  /** Fee for creating a new account (in units) */
  newAccountFee: string;
  /** Risk reduction threshold */
  riskReductionThreshold: string;
  /** Maintenance fee per slot (in units) */
  maintenanceFeePerSlot: string;
  /** Max crank staleness in slots */
  maxCrankStalenessSlots: string;
  /** Liquidation fee in basis points */
  liquidationFeeBps: string;
  /** Liquidation fee cap (in units) */
  liquidationFeeCap: string;
  /** Liquidation buffer in basis points */
  liquidationBufferBps: string;
  /** Minimum liquidation absolute size */
  minLiquidationAbs: string;
}

/**
 * Default BTC market parameters for devnet deployment.
 * Conservative settings for initial launch.
 */
export const BTC_MARKET_DEVNET: BtcMarketConfig = {
  collateralMint: CBBTC_MINT_DEVNET,
  indexFeedId: PYTH_BTC_USD_FEED_ID,
  maxStalenessSecs: "30",
  confFilterBps: 100, // 1% confidence band
  invert: 0, // BTC/USD direct (no inversion needed)
  unitScale: 100, // 100 sats = 1 unit (gives 6-decimal precision)
  warmupPeriodSlots: "100", // ~50 seconds warmup
  maintenanceMarginBps: "250", // 2.5% maintenance margin
  initialMarginBps: "500", // 5% initial margin (20x max leverage)
  tradingFeeBps: "8", // 0.08% trading fee
  maxAccounts: "256",
  newAccountFee: "100000", // 0.001 BTC equivalent
  riskReductionThreshold: "0",
  maintenanceFeePerSlot: "0",
  maxCrankStalenessSlots: "20",
  liquidationFeeBps: "50", // 0.5% liquidation fee
  liquidationFeeCap: "100000000", // Cap at 1 BTC equivalent
  liquidationBufferBps: "100", // 1% buffer
  minLiquidationAbs: "10000", // Min ~0.0001 BTC
};

/**
 * Production BTC market parameters (mainnet).
 * More conservative than devnet.
 */
export const BTC_MARKET_MAINNET: BtcMarketConfig = {
  collateralMint: CBBTC_MINT,
  indexFeedId: PYTH_BTC_USD_FEED_ID,
  maxStalenessSecs: "30",
  confFilterBps: 50, // 0.5% confidence band (tighter for mainnet)
  invert: 0,
  unitScale: 100,
  warmupPeriodSlots: "500", // ~4 minutes warmup
  maintenanceMarginBps: "250", // 2.5%
  initialMarginBps: "500", // 5% (20x max leverage)
  tradingFeeBps: "8", // 0.08%
  maxAccounts: "1024",
  newAccountFee: "100000",
  riskReductionThreshold: "0",
  maintenanceFeePerSlot: "0",
  maxCrankStalenessSlots: "20",
  liquidationFeeBps: "50",
  liquidationFeeCap: "100000000",
  liquidationBufferBps: "100",
  minLiquidationAbs: "10000",
};

// ============================================================================
// KEEPER PARAMETERS
// ============================================================================

/** Crank bot interval in milliseconds */
export const CRANK_INTERVAL_MS = 2000;

/** Liquidator scan interval in milliseconds */
export const LIQUIDATOR_INTERVAL_MS = 1000;

/** Depeg monitor check interval in milliseconds */
export const DEPEG_CHECK_INTERVAL_MS = 10_000;

/** Depeg threshold in basis points (200 = 2%) */
export const DEPEG_THRESHOLD_BPS = 200;

/** Depeg critical threshold — halt market (500 = 5%) */
export const DEPEG_CRITICAL_BPS = 500;
