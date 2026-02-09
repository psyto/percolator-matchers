export async function createEventMarket(opts: {
  eventName: string;
  initialProbability: string;
  resolutionDate?: string;
  rpc: string;
}): Promise<void> {
  const probPct = parseInt(opts.initialProbability);
  const probE6 = probPct * 10_000; // 50% = 500_000

  console.log("Event Perps Market Creation (Hyperp Mode)");
  console.log("==========================================");
  console.log(`  Event: ${opts.eventName}`);
  console.log(`  Initial probability: ${probPct}% (${probE6} e6)`);
  if (opts.resolutionDate) {
    console.log(`  Resolution date: ${opts.resolutionDate}`);
  }
  console.log("");
  console.log("Run the following percolator-cli command:");
  console.log("");
  console.log(`  percolator-cli init-market \\`);
  console.log(`    --mint USDC_MINT \\`);
  console.log(`    --index-feed-id ${"0".repeat(64)} \\`);
  console.log(`    --invert 0 \\`);
  console.log(`    --unit-scale 0 \\`);
  console.log(`    --initial-mark ${probE6} \\`);
  console.log(`    --maintenance-margin-bps 1000 \\`);
  console.log(`    --initial-margin-bps 2000 \\`);
  console.log(`    --trading-fee-bps 5 \\`);
  console.log(`    --max-accounts 512`);
  console.log("");
  console.log("Note: Hyperp mode (all-zeros feed ID). Keeper pushes probability as oracle price.");
  console.log("Price range: 0 (0% probability) to 1,000,000 (100% probability)");
}
