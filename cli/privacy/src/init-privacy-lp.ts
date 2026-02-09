import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } from "@solana/web3.js";
import * as fs from "fs";
import { generateKeyPair } from "../../../app/privacy-solver/src/encryption";

export async function initPrivacyLp(opts: {
  solver: string;
  baseSpread: string;
  maxSpread: string;
  solverFee: string;
  rpc: string;
}): Promise<void> {
  const connection = new Connection(opts.rpc, "confirmed");
  const walletPath = process.env.WALLET_PATH || `${process.env.HOME}/.config/solana/id.json`;
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  const matcherProgramId = new PublicKey(
    process.env.MATCHER_PROGRAM_ID || "Priv1111111111111111111111111111111111111111"
  );

  // Generate context account
  const contextAccount = Keypair.generate();

  // Generate solver encryption keypair
  const encryptionKeys = generateKeyPair();

  // Build init instruction data
  const baseSpread = parseInt(opts.baseSpread);
  const maxSpread = parseInt(opts.maxSpread);
  const solverFee = parseInt(opts.solverFee);

  const data = Buffer.alloc(45);
  data[0] = 0x02; // Init tag
  data.writeUInt32LE(baseSpread, 1);
  data.writeUInt32LE(maxSpread, 5);
  data.writeUInt32LE(solverFee, 9);
  Buffer.from(encryptionKeys.publicKey).copy(data, 13);

  // Create context account with enough space
  const lamports = await connection.getMinimumBalanceForRentExemption(320);
  const createAccountIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: contextAccount.publicKey,
    lamports,
    space: 320,
    programId: matcherProgramId,
  });

  // Init matcher instruction
  const initIx = new TransactionInstruction({
    programId: matcherProgramId,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // LP PDA (for now, payer acts as LP authority)
      { pubkey: contextAccount.publicKey, isSigner: false, isWritable: true },
      { pubkey: new PublicKey(opts.solver), isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(createAccountIx, initIx);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer, contextAccount]);

  console.log("Privacy matcher LP initialized!");
  console.log(`  Context account: ${contextAccount.publicKey.toBase58()}`);
  console.log(`  Solver: ${opts.solver}`);
  console.log(`  Base spread: ${baseSpread} bps`);
  console.log(`  Max spread: ${maxSpread} bps`);
  console.log(`  Solver fee: ${solverFee} bps`);
  console.log(`  Solver encryption pubkey: ${Buffer.from(encryptionKeys.publicKey).toString("hex")}`);
  console.log(`  Transaction: ${sig}`);
}
