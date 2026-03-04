/**
 * BTC Market Keeper
 *
 * Runs all BTC market maintenance tasks concurrently:
 * - Crank: oracle updates, funding, sweeps
 * - Liquidator: scan and liquidate undercollateralized positions
 * - Depeg monitor: watch cbBTC/BTC peg, halt on critical depeg
 *
 * Usage: ts-node app/btc-keeper/src/index.ts
 */
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import { BtcCrank } from "./crank";
import { BtcLiquidator } from "./liquidator";
import { DepegMonitor } from "./depeg-monitor";
import {
  CRANK_INTERVAL_MS,
  LIQUIDATOR_INTERVAL_MS,
  DEPEG_CHECK_INTERVAL_MS,
} from "../../../cli/btc/src/config";

dotenv.config();

function loadMarketInfo(): { programId: string; slab: string; oracle: string } {
  for (const file of ["devnet-btc-market.json", "mainnet-btc-market.json"]) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch { /* ignore */ }
  }
  const programId = process.env.PROGRAM_ID;
  const slab = process.env.BTC_SLAB;
  const oracle = process.env.BTC_ORACLE;
  if (!programId || !slab) {
    throw new Error("Set PROGRAM_ID and BTC_SLAB in .env or run setup-btc-devnet first");
  }
  return { programId, slab, oracle: oracle || "" };
}

async function main() {
  const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  const walletPath = process.env.WALLET_PATH || `${process.env.HOME}/.config/solana/id.json`;
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  const marketInfo = loadMarketInfo();
  const programId = new PublicKey(marketInfo.programId);
  const slab = new PublicKey(marketInfo.slab);
  const oracle = new PublicKey(marketInfo.oracle || slab.toBase58());

  console.log("=== Percolator BTC Keeper ===\n");
  console.log(`Program:    ${programId.toBase58()}`);
  console.log(`Slab:       ${slab.toBase58()}`);
  console.log(`Oracle:     ${oracle.toBase58()}`);
  console.log(`Payer:      ${payer.publicKey.toBase58()}`);
  console.log(`Crank:      every ${CRANK_INTERVAL_MS}ms`);
  console.log(`Liquidator: every ${LIQUIDATOR_INTERVAL_MS}ms`);
  console.log(`Depeg:      every ${DEPEG_CHECK_INTERVAL_MS}ms\n`);

  const crank = new BtcCrank(connection, payer, programId, slab, oracle);
  const liquidator = new BtcLiquidator(connection, payer, programId, slab, oracle);
  const depeg = new DepegMonitor(connection, payer, programId, slab);

  process.on("SIGINT", () => {
    console.log("\nShutting down BTC keeper...");
    process.exit(0);
  });

  // Run all three loops concurrently
  await Promise.all([
    crank.run(CRANK_INTERVAL_MS),
    liquidator.run(LIQUIDATOR_INTERVAL_MS),
    depeg.run(DEPEG_CHECK_INTERVAL_MS),
  ]);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
