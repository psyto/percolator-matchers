/**
 * BTC Market Liquidation Bot
 *
 * Monitors all accounts in the BTC Percolator market and liquidates
 * undercollateralized positions. Earns liquidation fees as reward.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  SYSVAR_CLOCK_PUBKEY,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { encodeLiquidateAtOracle } from "../../../../percolator-cli/src/abi/instructions.js";
import {
  ACCOUNTS_LIQUIDATE_AT_ORACLE,
  buildAccountMetas,
} from "../../../../percolator-cli/src/abi/accounts.js";
import { buildIx } from "../../../../percolator-cli/src/runtime/tx.js";
import {
  fetchSlab,
  parseUsedIndices,
  parseAccount,
  parseParams,
  AccountKind,
} from "../../../../percolator-cli/src/solana/slab.js";

/**
 * Check if an account is liquidatable.
 * An account is liquidatable when its effective capital (capital + PnL)
 * falls below the maintenance margin requirement.
 */
function isLiquidatable(
  capital: bigint,
  pnl: bigint,
  positionSize: bigint,
  maintenanceMarginBps: bigint
): boolean {
  if (positionSize === 0n) return false;

  const equity = capital + pnl;
  if (equity <= 0n) return true; // Bankrupt

  const absPos = positionSize < 0n ? -positionSize : positionSize;
  const maintenanceMargin = (absPos * maintenanceMarginBps) / 10000n;

  return equity < maintenanceMargin;
}

export class BtcLiquidator {
  constructor(
    private connection: Connection,
    private payer: Keypair,
    private programId: PublicKey,
    private slab: PublicKey,
    private oracle: PublicKey,
  ) {}

  private async scanAndLiquidate(): Promise<number> {
    const data = await fetchSlab(this.connection, this.slab);
    const params = parseParams(data);
    const usedIndices = parseUsedIndices(data);

    let liquidated = 0;

    for (const idx of usedIndices) {
      try {
        const account = parseAccount(data, idx);

        // Skip LPs (they can't be liquidated via this path)
        if (account.kind === AccountKind.LP) continue;

        // Skip accounts with no position
        if (account.positionSize === 0n) continue;

        // Check if liquidatable
        if (
          !isLiquidatable(
            account.capital as bigint,
            account.pnl,
            account.positionSize,
            params.maintenanceMarginBps
          )
        ) {
          continue;
        }

        console.log(
          `[${new Date().toISOString()}] Liquidating account #${idx} ` +
            `(capital=${account.capital}, pnl=${account.pnl}, pos=${account.positionSize})`
        );

        // Execute liquidation
        const ixData = encodeLiquidateAtOracle({ targetIdx: idx });
        const keys = buildAccountMetas(ACCOUNTS_LIQUIDATE_AT_ORACLE, [
          this.payer.publicKey,
          this.slab,
          SYSVAR_CLOCK_PUBKEY,
          this.oracle,
        ]);

        const tx = new Transaction();
        tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
        tx.add(buildIx({ programId: this.programId, keys, data: ixData }));

        const sig = await sendAndConfirmTransaction(this.connection, tx, [this.payer], {
          commitment: "confirmed",
          skipPreflight: true,
        });

        console.log(
          `[${new Date().toISOString()}] Liquidated #${idx}: ${sig.slice(0, 16)}...`
        );
        liquidated++;
      } catch (err: any) {
        // Account may have been liquidated by someone else, or margin recovered
        const msg = err.message || String(err);
        if (!msg.includes("NotLiquidatable") && !msg.includes("0x177")) {
          console.error(
            `[${new Date().toISOString()}] Liquidation error for #${idx}: ${msg.slice(0, 120)}`
          );
        }
      }
    }

    return liquidated;
  }

  async run(intervalMs: number): Promise<void> {
    let scanCount = 0;
    let totalLiquidated = 0;

    while (true) {
      try {
        scanCount++;
        const liquidated = await this.scanAndLiquidate();
        totalLiquidated += liquidated;

        if (liquidated > 0) {
          console.log(
            `[${new Date().toISOString()}] Scan #${scanCount}: liquidated ${liquidated} (total: ${totalLiquidated})`
          );
        } else if (scanCount % 60 === 0) {
          // Log heartbeat every ~60 scans
          console.log(
            `[${new Date().toISOString()}] Scan #${scanCount}: all healthy (total liquidated: ${totalLiquidated})`
          );
        }
      } catch (err: any) {
        console.error(
          `[${new Date().toISOString()}] Scan error: ${(err.message || String(err)).slice(0, 120)}`
        );
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}
