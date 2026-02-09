import { PublicKey } from "@solana/web3.js";
import { PrivacyPerpsSolver } from "./solver";
import { SolverConfig } from "./config";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const config: SolverConfig = {
    rpcUrl: process.env.RPC_URL || "https://api.devnet.solana.com",
    solverKeypairPath: process.env.SOLVER_KEYPAIR || "~/.config/solana/id.json",
    matcherProgramId: new PublicKey(
      process.env.MATCHER_PROGRAM_ID || "Priv1111111111111111111111111111111111111111"
    ),
    matcherContextAccount: new PublicKey(
      process.env.MATCHER_CONTEXT || "1111111111111111111111111111111111111111111"
    ),
    percolatorCliPath: process.env.PERCOLATOR_CLI || "percolator-cli",
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "1000"),
    maxSlippageBps: parseInt(process.env.MAX_SLIPPAGE_BPS || "500"),
    intentQueueUrl: process.env.INTENT_QUEUE_URL || "ws://localhost:8080",
  };

  const solver = new PrivacyPerpsSolver(config);

  process.on("SIGINT", () => {
    console.log("\nShutting down solver...");
    solver.stop();
    process.exit(0);
  });

  await solver.start();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
