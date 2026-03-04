/**
 * cbBTC/BTC Depeg Monitor
 *
 * Monitors the peg between cbBTC (Solana SPL token) and native BTC
 * by comparing cbBTC market price against Pyth BTC/USD oracle.
 *
 * If depeg exceeds threshold:
 * - WARNING level (2%): logs alert
 * - CRITICAL level (5%): resolves (halts) the market
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  DEPEG_THRESHOLD_BPS,
  DEPEG_CRITICAL_BPS,
} from "../../../cli/btc/src/config";

// Jupiter Price API v2
const JUPITER_PRICE_API = "https://api.jup.ag/price/v2";

// cbBTC mint on Solana
const CBBTC_MINT = "cbbtcn3HgpBkSJRGHZRN4yWZAW2JQhSqDerDoHt5xGCA";

interface PriceResult {
  cbbtcUsd: number;
  btcUsd: number;
  pegRatio: number;
  depegBps: number;
}

/**
 * Fetch cbBTC and BTC prices from Jupiter Price API + Pyth Hermes.
 */
async function fetchPrices(): Promise<PriceResult> {
  // Fetch cbBTC price from Jupiter
  const resp = await fetch(
    `${JUPITER_PRICE_API}?ids=${CBBTC_MINT}&vsToken=USDC`
  );
  if (!resp.ok) throw new Error(`Jupiter API error: ${resp.status}`);

  const data = await resp.json();
  const cbbtcData = data?.data?.[CBBTC_MINT];
  if (!cbbtcData?.price) {
    throw new Error("No cbBTC price from Jupiter");
  }

  const cbbtcUsd = parseFloat(cbbtcData.price);

  // For BTC/USD reference, we use Pyth via the Hermes API
  const pythResp = await fetch(
    "https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43"
  );
  if (!pythResp.ok) throw new Error(`Pyth API error: ${pythResp.status}`);

  const pythData = await pythResp.json();
  const btcPriceData = pythData?.parsed?.[0]?.price;
  if (!btcPriceData) {
    throw new Error("No BTC price from Pyth");
  }

  const btcUsd =
    parseFloat(btcPriceData.price) *
    Math.pow(10, btcPriceData.expo);

  const pegRatio = cbbtcUsd / btcUsd;
  const depegBps = Math.abs(1 - pegRatio) * 10000;

  return { cbbtcUsd, btcUsd, pegRatio, depegBps };
}

export class DepegMonitor {
  constructor(
    private connection: Connection,
    private payer: Keypair,
    private programId: PublicKey,
    private slab: PublicKey,
  ) {}

  private async haltMarket(reason: string): Promise<void> {
    console.error(`\n!!! HALTING BTC MARKET: ${reason} !!!\n`);

    // Use the resolve-market instruction (admin only) to halt trading
    const { encodeResolveMarket } = await import(
      "../../../../percolator-cli/src/abi/instructions.js"
    );
    const { ACCOUNTS_RESOLVE_MARKET, buildAccountMetas } = await import(
      "../../../../percolator-cli/src/abi/accounts.js"
    );
    const { buildIx } = await import("../../../../percolator-cli/src/runtime/tx.js");

    // Resolve at current oracle price (0 = use last known oracle price)
    const ixData = encodeResolveMarket({ priceE6: BigInt(0) });
    const keys = buildAccountMetas(ACCOUNTS_RESOLVE_MARKET, [
      this.payer.publicKey,
      this.slab,
    ]);

    const tx = new Transaction().add(
      buildIx({ programId: this.programId, keys, data: ixData })
    );

    const sig = await sendAndConfirmTransaction(this.connection, tx, [this.payer], {
      commitment: "confirmed",
    });

    console.error(`Market halted. Tx: ${sig}`);
    console.error("Manual intervention required to restart.");
  }

  async run(intervalMs: number): Promise<void> {
    console.log(`Depeg monitor: warning=${DEPEG_THRESHOLD_BPS}bps, critical=${DEPEG_CRITICAL_BPS}bps`);

    let checkCount = 0;
    let warningCount = 0;

    while (true) {
      try {
        checkCount++;
        const prices = await fetchPrices();

        if (prices.depegBps >= DEPEG_CRITICAL_BPS) {
          // CRITICAL — halt the market
          console.error(
            `[${new Date().toISOString()}] CRITICAL DEPEG: ${prices.depegBps.toFixed(0)} bps ` +
              `(cbBTC=$${prices.cbbtcUsd.toFixed(2)}, BTC=$${prices.btcUsd.toFixed(2)}, ratio=${prices.pegRatio.toFixed(4)})`
          );
          await this.haltMarket(
            `cbBTC depeg ${prices.depegBps.toFixed(0)} bps exceeds critical threshold ${DEPEG_CRITICAL_BPS} bps`
          );
          console.error("Depeg monitor exiting — market has been halted.");
          process.exit(1);
        } else if (prices.depegBps >= DEPEG_THRESHOLD_BPS) {
          // WARNING — log but don't halt
          warningCount++;
          console.warn(
            `[${new Date().toISOString()}] WARNING DEPEG: ${prices.depegBps.toFixed(0)} bps ` +
              `(cbBTC=$${prices.cbbtcUsd.toFixed(2)}, BTC=$${prices.btcUsd.toFixed(2)}, ratio=${prices.pegRatio.toFixed(4)}) ` +
              `[warning #${warningCount}]`
          );
        } else if (checkCount % 30 === 0) {
          // Heartbeat every ~5 minutes
          console.log(
            `[${new Date().toISOString()}] Peg healthy: ${prices.depegBps.toFixed(1)} bps ` +
              `(cbBTC=$${prices.cbbtcUsd.toFixed(2)}, BTC=$${prices.btcUsd.toFixed(2)})`
          );
        }
      } catch (err: any) {
        console.error(
          `[${new Date().toISOString()}] Monitor error: ${(err.message || String(err)).slice(0, 120)}`
        );
        // Don't halt on API errors — just retry
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}
