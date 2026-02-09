import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import * as fs from "fs";

export async function resolveEvent(opts: {
  outcome: string;
  context: string;
  rpc: string;
}): Promise<void> {
  const connection = new Connection(opts.rpc, "confirmed");
  const walletPath = process.env.WALLET_PATH || `${process.env.HOME}/.config/solana/id.json`;
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  const matcherProgramId = new PublicKey(
    process.env.MATCHER_PROGRAM_ID || "Evnt1111111111111111111111111111111111111111"
  );

  const outcome = opts.outcome.toLowerCase() === "yes" ? 1 : 0;

  const data = Buffer.alloc(2);
  data[0] = 0x04; // Resolve tag
  data[1] = outcome;

  const ix = new TransactionInstruction({
    programId: matcherProgramId,
    keys: [
      { pubkey: new PublicKey(opts.context), isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer]);

  console.log("Event resolved!");
  console.log(`  Outcome: ${outcome === 1 ? "YES (100%)" : "NO (0%)"}`);
  console.log(`  Context: ${opts.context}`);
  console.log(`  Transaction: ${sig}`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Keeper will sync final probability to Percolator oracle");
  console.log("  2. All positions settle at terminal price (0 or 1,000,000)");
  console.log("  3. Traders can close positions through normal Percolator mechanics");
}
