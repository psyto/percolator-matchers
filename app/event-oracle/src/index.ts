import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { ProbabilityFeed } from "./probability-feed";
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

  const matcherProgramId = new PublicKey(
    process.env.MATCHER_PROGRAM_ID || "Evnt1111111111111111111111111111111111111111"
  );
  const matcherContext = new PublicKey(
    process.env.MATCHER_CONTEXT || "1111111111111111111111111111111111111111111"
  );
  const eventOracle = new PublicKey(
    process.env.EVENT_ORACLE || payer.publicKey
  );

  const updateIntervalMs = parseInt(process.env.UPDATE_INTERVAL_MS || "30000");

  const feed = new ProbabilityFeed(
    connection,
    payer,
    matcherProgramId,
    matcherContext,
    eventOracle,
  );

  console.log("Event Oracle Service started");
  console.log(`  Program: ${matcherProgramId.toBase58()}`);
  console.log(`  Context: ${matcherContext.toBase58()}`);
  console.log(`  Oracle: ${eventOracle.toBase58()}`);
  console.log(`  Update interval: ${updateIntervalMs}ms`);

  process.on("SIGINT", () => {
    console.log("\nShutting down oracle...");
    process.exit(0);
  });

  while (true) {
    try {
      await feed.updateProbability();
    } catch (err) {
      console.error("Oracle update error:", err);
    }
    await new Promise((r) => setTimeout(r, updateIntervalMs));
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
