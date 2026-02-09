import { Connection, PublicKey } from "@solana/web3.js";

const MAGIC_OFFSET = 64;
const ORACLE_PRICE_OFFSET = 156;
const LAST_EXEC_PRICE_OFFSET = 164;
const TOTAL_VOLUME_OFFSET = 172;
const TOTAL_ORDERS_OFFSET = 188;
const SOLVER_PUBKEY_OFFSET = 112;
const BASE_SPREAD_OFFSET = 144;
const MAX_SPREAD_OFFSET = 148;
const SOLVER_FEE_OFFSET = 152;

export async function solverStatus(opts: {
  rpc: string;
  context?: string;
}): Promise<void> {
  const connection = new Connection(opts.rpc, "confirmed");

  const contextPubkey = new PublicKey(
    opts.context || process.env.MATCHER_CONTEXT || ""
  );

  const accountInfo = await connection.getAccountInfo(contextPubkey);
  if (!accountInfo) {
    console.error("Context account not found");
    process.exit(1);
  }

  const data = accountInfo.data;

  // Verify magic
  const magic = data.readBigUInt64LE(MAGIC_OFFSET);
  if (magic !== 0x5052_4956_4d41_5443n) {
    console.error("Invalid magic bytes — not a privacy matcher context");
    process.exit(1);
  }

  const solver = new PublicKey(data.subarray(SOLVER_PUBKEY_OFFSET, SOLVER_PUBKEY_OFFSET + 32));
  const oraclePrice = data.readBigUInt64LE(ORACLE_PRICE_OFFSET);
  const lastExecPrice = data.readBigUInt64LE(LAST_EXEC_PRICE_OFFSET);
  const totalOrders = data.readBigUInt64LE(TOTAL_ORDERS_OFFSET);
  const baseSpread = data.readUInt32LE(BASE_SPREAD_OFFSET);
  const maxSpread = data.readUInt32LE(MAX_SPREAD_OFFSET);
  const solverFee = data.readUInt32LE(SOLVER_FEE_OFFSET);

  console.log("Privacy Matcher Status");
  console.log("======================");
  console.log(`  Context: ${contextPubkey.toBase58()}`);
  console.log(`  Solver: ${solver.toBase58()}`);
  console.log(`  Oracle price: ${oraclePrice} (e6: $${Number(oraclePrice) / 1e6})`);
  console.log(`  Last exec price: ${lastExecPrice} (e6: $${Number(lastExecPrice) / 1e6})`);
  console.log(`  Total orders: ${totalOrders}`);
  console.log(`  Base spread: ${baseSpread} bps`);
  console.log(`  Max spread: ${maxSpread} bps`);
  console.log(`  Solver fee: ${solverFee} bps`);
}
