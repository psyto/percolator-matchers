import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { ProbabilitySync } from "./probability-sync";
import * as dotenv from "dotenv";
import * as fs from "fs";

dotenv.config();

async function main() {
  const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  const walletPath = process.env.WALLET_PATH || `${process.env.HOME}/.config/solana/id.json`;
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  const marketPubkey = new PublicKey(
    process.env.PERCOLATOR_MARKET || "1111111111111111111111111111111111111111111"
  );
  const matcherContext = new PublicKey(
    process.env.MATCHER_CONTEXT || "1111111111111111111111111111111111111111111"
  );

  const syncIntervalMs = parseInt(process.env.SYNC_INTERVAL_MS || "10000");

  const sync = new ProbabilitySync(
    connection,
    payer,
    marketPubkey,
    matcherContext,
  );

  console.log("Event Keeper started");
  console.log(`  Market: ${marketPubkey.toBase58()}`);
  console.log(`  Context: ${matcherContext.toBase58()}`);
  console.log(`  Sync interval: ${syncIntervalMs}ms`);

  process.on("SIGINT", () => {
    console.log("\nShutting down keeper...");
    process.exit(0);
  });

  while (true) {
    try {
      await sync.syncProbabilityToOracle();
    } catch (err) {
      console.error("Keeper error:", err);
    }
    await new Promise((r) => setTimeout(r, syncIntervalMs));
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
