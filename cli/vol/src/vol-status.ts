import { Connection, PublicKey } from "@solana/web3.js";

export async function volStatus(opts: {
  context?: string;
  rpc: string;
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

  const magic = data.readBigUInt64LE(64);
  if (magic !== 0x564F_4c4d_4154_4348n) {
    console.error("Invalid magic — not a vol matcher context");
    process.exit(1);
  }

  const regimeNames = ["VeryLow", "Low", "Normal", "High", "Extreme"];
  const mode = data[76];
  const currentVol = data.readBigUInt64LE(128);
  const volMark = data.readBigUInt64LE(136);
  const lastSlot = data.readBigUInt64LE(144);
  const regime = data[152];
  const vol7d = data.readBigUInt64LE(160);
  const vol30d = data.readBigUInt64LE(168);
  const baseSpread = data.readUInt32LE(112);
  const vovSpread = data.readUInt32LE(116);
  const maxSpread = data.readUInt32LE(120);

  console.log("Vol Matcher Status");
  console.log("===================");
  console.log(`  Context: ${contextPubkey.toBase58()}`);
  console.log(`  Mode: ${mode === 0 ? "RealizedVol" : "ImpliedVol"}`);
  console.log(`  Current vol: ${currentVol} bps (${Number(currentVol) / 100}%)`);
  console.log(`  Vol mark price: ${volMark} (e6)`);
  console.log(`  Regime: ${regimeNames[regime] || "Unknown"} (${regime})`);
  console.log(`  7-day avg vol: ${vol7d} bps (${Number(vol7d) / 100}%)`);
  console.log(`  30-day avg vol: ${vol30d} bps (${Number(vol30d) / 100}%)`);
  console.log(`  Last update slot: ${lastSlot}`);
  console.log(`  Base spread: ${baseSpread} bps`);
  console.log(`  VoV spread: ${vovSpread} bps`);
  console.log(`  Max spread: ${maxSpread} bps`);
}
