import { Connection, Keypair } from "@solana/web3.js";
import * as fs from "fs";

export async function initVolMarket(opts: {
  initialVol: string;
  rpc: string;
}): Promise<void> {
  const initialVolBps = parseInt(opts.initialVol);
  const initialMark = initialVolBps * 1_000_000; // e6 format

  console.log("Vol Perps Market Init (Hyperp Mode)");
  console.log("====================================");
  console.log(`  Initial vol: ${initialVolBps} bps (${initialVolBps / 100}%)`);
  console.log(`  Initial mark: ${initialMark}`);
  console.log("");
  console.log("Run the following percolator-cli command:");
  console.log("");
  console.log(`  percolator-cli init-market \\`);
  console.log(`    --mint USDC_MINT \\`);
  console.log(`    --index-feed-id ${"0".repeat(64)} \\`);
  console.log(`    --invert 0 \\`);
  console.log(`    --unit-scale 0 \\`);
  console.log(`    --initial-mark ${initialMark} \\`);
  console.log(`    --maintenance-margin-bps 1000 \\`);
  console.log(`    --initial-margin-bps 2000 \\`);
  console.log(`    --trading-fee-bps 10 \\`);
  console.log(`    --max-accounts 256`);
  console.log("");
  console.log("Note: indexFeedId=all-zeros enables Hyperp mode (admin-controlled oracle).");
  console.log("The keeper will sync Sigma's VarianceTracker vol level as the oracle price.");
}
