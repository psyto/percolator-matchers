import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction,
  SystemProgram, sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";

export async function initJpyLp(opts: {
  kycRegistry: string;
  baseSpread: string;
  maxSpread: string;
  minKyc: string;
  kycDiscount: string;
  blockedJurisdictions: string;
  dailyVolumeCap: string;
  rpc: string;
}): Promise<void> {
  const connection = new Connection(opts.rpc, "confirmed");
  const walletPath = process.env.WALLET_PATH || `${process.env.HOME}/.config/solana/id.json`;
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  const matcherProgramId = new PublicKey(
    process.env.MATCHER_PROGRAM_ID || "JPYm1111111111111111111111111111111111111111"
  );

  const contextAccount = Keypair.generate();

  // Build init data (93 bytes)
  const data = Buffer.alloc(93);
  data[0] = 0x02; // tag
  data[1] = 0;    // mode: PassiveKYC
  data[2] = parseInt(opts.minKyc);
  data[3] = 0;    // require_same_jurisdiction: no

  // KYC registry pubkey
  new PublicKey(opts.kycRegistry).toBuffer().copy(data, 4);

  // Spread params
  data.writeUInt32LE(parseInt(opts.baseSpread), 36);
  data.writeUInt32LE(parseInt(opts.kycDiscount), 40);
  data.writeUInt32LE(parseInt(opts.maxSpread), 44);

  // Blocked jurisdictions
  data[48] = parseInt(opts.blockedJurisdictions, 16);

  // Daily volume cap
  data.writeBigUInt64LE(BigInt(opts.dailyVolumeCap), 49);

  // Impact K (default 100)
  data.writeUInt32LE(100, 57);

  // Liquidity notional (default 10M JPY in e6)
  const liquidityBuf = Buffer.alloc(16);
  liquidityBuf.writeBigUInt64LE(10_000_000_000_000n, 0);
  liquidityBuf.copy(data, 61);

  // Max fill (default 1M JPY in e6)
  const maxFillBuf = Buffer.alloc(16);
  maxFillBuf.writeBigUInt64LE(1_000_000_000_000n, 0);
  maxFillBuf.copy(data, 77);

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

  console.log("JPY matcher LP initialized!");
  console.log(`  Context: ${contextAccount.publicKey.toBase58()}`);
  console.log(`  KYC Registry: ${opts.kycRegistry}`);
  console.log(`  Min KYC level: ${opts.minKyc}`);
  console.log(`  Base spread: ${opts.baseSpread} bps`);
  console.log(`  KYC discount: ${opts.kycDiscount} bps`);
  console.log(`  Max spread: ${opts.maxSpread} bps`);
  console.log(`  Blocked jurisdictions: 0x${opts.blockedJurisdictions}`);
  console.log(`  Daily volume cap: ${opts.dailyVolumeCap}`);
  console.log(`  Transaction: ${sig}`);
}
