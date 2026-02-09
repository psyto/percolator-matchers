import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";

export async function initVolLp(opts: {
  baseSpread: string;
  vovSpread: string;
  maxSpread: string;
  varianceTracker: string;
  volIndex: string;
  impactK: string;
  rpc: string;
}): Promise<void> {
  const connection = new Connection(opts.rpc, "confirmed");
  const walletPath = process.env.WALLET_PATH || `${process.env.HOME}/.config/solana/id.json`;
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  const matcherProgramId = new PublicKey(
    process.env.MATCHER_PROGRAM_ID || "VoLm1111111111111111111111111111111111111111"
  );

  const contextAccount = Keypair.generate();

  // Build init data (tag 0x02)
  const data = Buffer.alloc(114);
  data[0] = 0x02; // Init tag
  data[1] = 0;    // Mode: RealizedVol

  // Spread params
  data.writeUInt32LE(parseInt(opts.baseSpread), 2);
  data.writeUInt32LE(parseInt(opts.vovSpread), 6);
  data.writeUInt32LE(parseInt(opts.maxSpread), 10);
  data.writeUInt32LE(parseInt(opts.impactK), 14);

  // Liquidity notional (default 1M USDC in e6)
  const liquidityBuf = Buffer.alloc(16);
  liquidityBuf.writeBigUInt64LE(1_000_000_000_000n, 0);
  liquidityBuf.copy(data, 18);

  // Max fill (default 100K in e6)
  const maxFillBuf = Buffer.alloc(16);
  maxFillBuf.writeBigUInt64LE(100_000_000_000n, 0);
  maxFillBuf.copy(data, 34);

  // Oracle accounts
  new PublicKey(opts.varianceTracker).toBuffer().copy(data, 50);
  new PublicKey(opts.volIndex).toBuffer().copy(data, 82);

  // Create context account
  const lamports = await connection.getMinimumBalanceForRentExemption(320);
  const createIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: contextAccount.publicKey,
    lamports,
    space: 320,
    programId: matcherProgramId,
  });

  const initIx = new TransactionInstruction({
    programId: matcherProgramId,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: contextAccount.publicKey, isSigner: false, isWritable: true },
    ],
    data,
  });

  const tx = new Transaction().add(createIx, initIx);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer, contextAccount]);

  console.log("Vol matcher LP initialized!");
  console.log(`  Context: ${contextAccount.publicKey.toBase58()}`);
  console.log(`  Base spread: ${opts.baseSpread} bps`);
  console.log(`  VoV spread: ${opts.vovSpread} bps`);
  console.log(`  Max spread: ${opts.maxSpread} bps`);
  console.log(`  Variance tracker: ${opts.varianceTracker}`);
  console.log(`  Vol index: ${opts.volIndex}`);
  console.log(`  Transaction: ${sig}`);
}
