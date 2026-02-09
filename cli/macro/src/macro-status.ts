import { Connection, PublicKey } from "@solana/web3.js";

export async function macroStatus(opts: {
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
  if (magic !== 0x4d41_434f_4d41_5443n) {
    console.error("Invalid magic — not a macro matcher context");
    process.exit(1);
  }

  const regimeNames = ["Expansion", "Stagnation", "Crisis", "Recovery"];
  const signalNames = ["None", "Low", "High", "Critical"];
  const mode = data[76];
  const currentIndex = data.readBigUInt64LE(128);
  const componentsPacked = data.readBigUInt64LE(136);
  const lastSlot = data.readBigUInt64LE(144);
  const regime = data[152];
  const signalSeverity = data.readBigUInt64LE(160);
  const signalSpread = data.readBigUInt64LE(168);
  const baseSpread = data.readUInt32LE(112);
  const regimeSpread = data.readUInt32LE(116);
  const maxSpread = data.readUInt32LE(120);
  const totalTrades = data.readBigUInt64LE(256);

  // Unpack components: nominal(high 32) | inflation(low 32)
  const nominalBps = Number(componentsPacked >> 32n);
  const inflationBps = Number(componentsPacked & 0xFFFFFFFFn);
  const realRateBps = nominalBps - inflationBps;

  console.log("Macro Matcher Status");
  console.log("====================");
  console.log(`  Context: ${contextPubkey.toBase58()}`);
  console.log(`  Mode: ${mode === 0 ? "RealRate" : "HousingRatio"}`);
  console.log(`  Regime: ${regimeNames[regime] || "Unknown"} (${regime})`);
  console.log("");
  console.log("  Real Rate Index:");
  console.log(`    Mark price: ${currentIndex} (e6)`);
  console.log(`    Nominal (SOFR): ${nominalBps} bps (${nominalBps / 100}%)`);
  console.log(`    Inflation (breakeven): ${inflationBps} bps (${inflationBps / 100}%)`);
  console.log(`    Real rate: ${realRateBps} bps (${realRateBps / 100}%)`);
  console.log("");
  console.log("  Spreads:");
  console.log(`    Base spread: ${baseSpread} bps`);
  console.log(`    Regime spread: ${regimeSpread} bps`);
  console.log(`    Max spread: ${maxSpread} bps`);
  console.log("");
  console.log("  Signal Intelligence:");
  console.log(`    Severity: ${signalNames[Number(signalSeverity)] || "Unknown"} (${signalSeverity})`);
  console.log(`    Adjusted spread: ${signalSpread} bps`);
  console.log("");
  console.log(`  Last update slot: ${lastSlot}`);
  console.log(`  Total trades: ${totalTrades}`);
}
