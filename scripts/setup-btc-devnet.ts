/**
 * Deploy a BTC-collateralized perpetual futures market on Percolator.
 *
 * This script:
 * 1. Creates a slab account (or uses existing)
 * 2. Creates the cbBTC vault token account
 * 3. Initializes the market with BTC-specific parameters
 *
 * Usage: ts-node scripts/setup-btc-devnet.ts [--mainnet]
 */
import "dotenv/config";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import * as fs from "fs";
import {
  BTC_MARKET_DEVNET,
  BTC_MARKET_MAINNET,
  type BtcMarketConfig,
} from "../cli/btc/src/config";

// Import ABI encoders from percolator-cli
import { encodeInitMarket } from "../../percolator-cli/src/abi/instructions.js";
import {
  ACCOUNTS_INIT_MARKET,
  buildAccountMetas,
  WELL_KNOWN,
} from "../../percolator-cli/src/abi/accounts.js";
import { buildIx } from "../../percolator-cli/src/runtime/tx.js";
import { deriveVaultAuthority } from "../../percolator-cli/src/solana/pda.js";

// ============================================================================
// Configuration
// ============================================================================

const isMainnet = process.argv.includes("--mainnet");
const config: BtcMarketConfig = isMainnet ? BTC_MARKET_MAINNET : BTC_MARKET_DEVNET;
const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
const programId = new PublicKey(
  process.env.PROGRAM_ID || "Perco1ator111111111111111111111111111111111"
);

// Slab size: header(72) + config(320) + engine(~990KB for 4096 accounts)
// Minimum for 256 accounts: ~72 + 320 + 9136 + 256*240 = ~70KB
const SLAB_SIZE = 72 + 320 + 9136 + 256 * 240; // ~70,768 bytes for 256 accounts

const walletPath =
  process.env.WALLET_PATH || `${process.env.HOME}/.config/solana/id.json`;
const payer = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
);

const connection = new Connection(rpcUrl, "confirmed");

// ============================================================================
// Deployment
// ============================================================================

async function deploy() {
  console.log("=== Percolator BTC Market Deployment ===\n");
  console.log(`Network:    ${isMainnet ? "mainnet-beta" : "devnet"}`);
  console.log(`RPC:        ${rpcUrl}`);
  console.log(`Program:    ${programId.toBase58()}`);
  console.log(`Payer:      ${payer.publicKey.toBase58()}`);
  console.log(`Collateral: ${config.collateralMint} (cbBTC)`);
  console.log(`Oracle:     Pyth BTC/USD (${config.indexFeedId.slice(0, 16)}...)`);
  console.log(`Unit Scale: ${config.unitScale} (${config.unitScale} sats = 1 unit)`);
  console.log(`Leverage:   ${10000 / parseInt(config.initialMarginBps)}x max`);
  console.log();

  // Check balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Payer balance: ${(balance / 1e9).toFixed(4)} SOL`);

  const rentExempt = await connection.getMinimumBalanceForRentExemption(SLAB_SIZE);
  console.log(`Slab rent:     ${(rentExempt / 1e9).toFixed(4)} SOL (${SLAB_SIZE} bytes)`);

  if (balance < rentExempt + 0.1e9) {
    throw new Error(
      `Insufficient balance. Need at least ${((rentExempt + 0.1e9) / 1e9).toFixed(4)} SOL`
    );
  }

  // Step 1: Create slab account
  console.log("\n[1/3] Creating slab account...");
  const slabKeypair = Keypair.generate();

  const createSlabTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: slabKeypair.publicKey,
      lamports: rentExempt,
      space: SLAB_SIZE,
      programId,
    })
  );

  const slabSig = await sendAndConfirmTransaction(
    connection,
    createSlabTx,
    [payer, slabKeypair],
    { commitment: "confirmed" }
  );
  console.log(`  Slab:  ${slabKeypair.publicKey.toBase58()}`);
  console.log(`  Tx:    ${slabSig.slice(0, 16)}...`);

  // Step 2: Create vault token account (owned by vault PDA)
  console.log("\n[2/3] Creating vault token account...");
  const collateralMint = new PublicKey(config.collateralMint);
  const [vaultPda] = deriveVaultAuthority(programId, slabKeypair.publicKey);

  const vault = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    collateralMint,
    vaultPda,
    true // allowOwnerOffCurve — PDA owns the vault
  );
  console.log(`  Vault: ${vault.address.toBase58()}`);

  // Step 3: Initialize market
  console.log("\n[3/3] Initializing BTC market...");

  const ixData = encodeInitMarket({
    admin: payer.publicKey,
    collateralMint,
    indexFeedId: config.indexFeedId,
    maxStalenessSecs: config.maxStalenessSecs,
    confFilterBps: config.confFilterBps,
    invert: config.invert,
    unitScale: config.unitScale,
    initialMarkPriceE6: "0", // Pyth-based (not Hyperp mode)
    warmupPeriodSlots: config.warmupPeriodSlots,
    maintenanceMarginBps: config.maintenanceMarginBps,
    initialMarginBps: config.initialMarginBps,
    tradingFeeBps: config.tradingFeeBps,
    maxAccounts: config.maxAccounts,
    newAccountFee: config.newAccountFee,
    riskReductionThreshold: config.riskReductionThreshold,
    maintenanceFeePerSlot: config.maintenanceFeePerSlot,
    maxCrankStaleness: config.maxCrankStalenessSlots,
    liquidationFeeBps: config.liquidationFeeBps,
    liquidationFeeCap: config.liquidationFeeCap,
    liquidationBufferBps: config.liquidationBufferBps,
    minLiquidationAbs: config.minLiquidationAbs,
  });

  const keys = buildAccountMetas(ACCOUNTS_INIT_MARKET, [
    payer.publicKey,
    slabKeypair.publicKey,
    collateralMint,
    vault.address,
    WELL_KNOWN.tokenProgram,
    WELL_KNOWN.clock,
    WELL_KNOWN.rent,
    vaultPda,
    WELL_KNOWN.systemProgram,
  ]);

  const initTx = new Transaction();
  initTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  initTx.add(buildIx({ programId, keys, data: ixData }));

  const initSig = await sendAndConfirmTransaction(connection, initTx, [payer], {
    commitment: "confirmed",
  });
  console.log(`  Tx:    ${initSig.slice(0, 16)}...`);

  // Save deployment info
  const deploymentInfo = {
    network: isMainnet ? "mainnet-beta" : "devnet",
    programId: programId.toBase58(),
    slab: slabKeypair.publicKey.toBase58(),
    vault: vault.address.toBase58(),
    vaultPda: vaultPda.toBase58(),
    collateralMint: config.collateralMint,
    oracleFeedId: config.indexFeedId,
    unitScale: config.unitScale,
    maxLeverage: `${10000 / parseInt(config.initialMarginBps)}x`,
    deployedAt: new Date().toISOString(),
    deployer: payer.publicKey.toBase58(),
  };

  const outFile = isMainnet ? "mainnet-btc-market.json" : "devnet-btc-market.json";
  fs.writeFileSync(outFile, JSON.stringify(deploymentInfo, null, 2));

  console.log("\n=== Deployment Complete ===");
  console.log(`\nSaved to ${outFile}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Set BTC_SLAB=${slabKeypair.publicKey.toBase58()} in .env`);
  console.log(`  2. Run: npm run btc:keeper`);
}

deploy().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
