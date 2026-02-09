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

export async function initMacroLp(opts: {
  baseSpread: string;
  regimeSpread: string;
  maxSpread: string;
  macroOracle: string;
  impactK: string;
  rpc: string;
}): Promise<void> {
  const connection = new Connection(opts.rpc, "confirmed");
  const walletPath = process.env.WALLET_PATH || `${process.env.HOME}/.config/solana/id.json`;
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  const matcherProgramId = new PublicKey(
    process.env.MATCHER_PROGRAM_ID || "MACm1111111111111111111111111111111111111111"
  );

  const contextAccount = Keypair.generate();

  // Build init data (tag 0x02)
  // Layout: [0] tag, [1] mode, [2..6] base_spread, [6..10] regime_spread,
  //         [10..14] max_spread, [14..18] impact_k, [18..34] liquidity(u128),
  //         [34..50] max_fill(u128), [50..82] macro_oracle(32 bytes)
  const data = Buffer.alloc(82);
  data[0] = 0x02; // Init tag
  data[1] = 0;    // Mode: RealRate

  // Spread params
  data.writeUInt32LE(parseInt(opts.baseSpread), 2);
  data.writeUInt32LE(parseInt(opts.regimeSpread), 6);
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

  // Macro oracle pubkey
  new PublicKey(opts.macroOracle).toBuffer().copy(data, 50);

  // Create context account (320 bytes)
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

  console.log("Macro matcher LP initialized!");
  console.log(`  Context: ${contextAccount.publicKey.toBase58()}`);
  console.log(`  Base spread: ${opts.baseSpread} bps`);
  console.log(`  Regime spread: ${opts.regimeSpread} bps`);
  console.log(`  Max spread: ${opts.maxSpread} bps`);
  console.log(`  Macro oracle: ${opts.macroOracle}`);
  console.log(`  Transaction: ${sig}`);
}
