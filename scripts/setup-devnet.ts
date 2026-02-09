import { Connection, Keypair } from "@solana/web3.js";
import * as fs from "fs";

async function main() {
  console.log("Privacy Matcher — Devnet Setup");
  console.log("==============================");
  console.log("");
  console.log("Prerequisites:");
  console.log("  1. Solana CLI configured for devnet");
  console.log("  2. anchor build && anchor deploy completed");
  console.log("  3. Percolator market created");
  console.log("");
  console.log("Steps:");
  console.log("  1. Deploy privacy-matcher program: anchor deploy");
  console.log("  2. Create Percolator market: percolator-cli init-market ...");
  console.log("  3. Init LP with matcher: ts-node cli/src/index.ts init-lp --solver <SOLVER_KEY> --base-spread 15 --max-spread 100");
  console.log("  4. Start solver: npm run solver:start");
  console.log("  5. Submit test intent: ts-node cli/src/index.ts submit-intent --size 1000000 --max-slippage 50");
}

main().catch(console.error);
