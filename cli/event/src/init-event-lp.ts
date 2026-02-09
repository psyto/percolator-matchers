import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction,
  SystemProgram, sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";

export async function initEventLp(opts: {
  baseSpread: string;
  edgeSpread: string;
  maxSpread: string;
  eventOracle: string;
  initialProbability: string;
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

  const contextAccount = Keypair.generate();

  // Build init data (98 bytes)
  const data = Buffer.alloc(98);
  data[0] = 0x02; // tag
  data[1] = 0;    // mode: Continuous

  // Spread params
  data.writeUInt32LE(parseInt(opts.baseSpread), 2);
  data.writeUInt32LE(parseInt(opts.edgeSpread), 6);
  data.writeUInt32LE(parseInt(opts.maxSpread), 10);
  data.writeUInt32LE(100, 14); // impact_k default

  // Initial probability
  data.writeBigUInt64LE(BigInt(opts.initialProbability), 18);

  // Resolution timestamp (0 = no expiry)
  data.writeBigInt64LE(0n, 26);

  // Liquidity notional (default 500K USDC in e6)
  const liquidityBuf = Buffer.alloc(16);
  liquidityBuf.writeBigUInt64LE(500_000_000_000n, 0);
  liquidityBuf.copy(data, 34);

  // Max fill (default 50K in e6)
  const maxFillBuf = Buffer.alloc(16);
  maxFillBuf.writeBigUInt64LE(50_000_000_000n, 0);
  maxFillBuf.copy(data, 50);

  // Event oracle
  new PublicKey(opts.eventOracle).toBuffer().copy(data, 66);

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

  console.log("Event matcher LP initialized!");
  console.log(`  Context: ${contextAccount.publicKey.toBase58()}`);
  console.log(`  Base spread: ${opts.baseSpread} bps`);
  console.log(`  Edge spread: ${opts.edgeSpread} bps`);
  console.log(`  Max spread: ${opts.maxSpread} bps`);
  console.log(`  Initial probability: ${opts.initialProbability}`);
  console.log(`  Event oracle: ${opts.eventOracle}`);
  console.log(`  Transaction: ${sig}`);
}
