import { Connection, PublicKey } from "@solana/web3.js";

export async function listEvents(opts: { rpc: string }): Promise<void> {
  const connection = new Connection(opts.rpc, "confirmed");

  console.log("Event Markets");
  console.log("==============");
  console.log("");
  console.log("Note: In production, this would scan for all event-matcher context accounts");
  console.log("owned by the event-matcher program and display their status.");
  console.log("");
  console.log("To check a specific market:");
  console.log("  Set MATCHER_CONTEXT env var and read the account data.");
  console.log("");

  const contextPubkey = process.env.MATCHER_CONTEXT;
  if (!contextPubkey) {
    console.log("Set MATCHER_CONTEXT to view a specific market.");
    return;
  }

  const info = await connection.getAccountInfo(new PublicKey(contextPubkey));
  if (!info) {
    console.log("Context account not found.");
    return;
  }

  const data = info.data;
  const magic = data.readBigUInt64LE(64);
  if (magic !== 0x4556_4e54_4d41_5443n) {
    console.log("Not an event matcher context.");
    return;
  }

  const probability = data.readBigUInt64LE(128);
  const isResolved = data[160];
  const outcome = data[161];
  const signalSev = data.readBigUInt64LE(168);
  const baseSpread = data.readUInt32LE(112);
  const edgeSpread = data.readUInt32LE(116);
  const maxSpread = data.readUInt32LE(120);

  console.log(`  Context: ${contextPubkey}`);
  console.log(`  Probability: ${(Number(probability) / 10_000).toFixed(2)}%`);
  console.log(`  Status: ${isResolved ? `RESOLVED (${outcome === 1 ? "YES" : "NO"})` : "ACTIVE"}`);
  console.log(`  Signal severity: ${signalSev}`);
  console.log(`  Base spread: ${baseSpread} bps`);
  console.log(`  Edge spread: ${edgeSpread} bps`);
  console.log(`  Max spread: ${maxSpread} bps`);
}
