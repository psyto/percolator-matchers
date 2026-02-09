export async function initMacroMarket(opts: {
  rpc: string;
}): Promise<void> {
  // Neutral start: 0% real rate → mark = 5,000,000
  const initialMark = 5_000_000;

  console.log("Real Rate Perps Market Init (Hyperp Mode)");
  console.log("==========================================");
  console.log(`  Initial mark: ${initialMark} (0% real rate, neutral start)`);
  console.log("");
  console.log("Run the following percolator-cli command:");
  console.log("");
  console.log(`  percolator-cli init-market \\`);
  console.log(`    --mint USDC_MINT \\`);
  console.log(`    --index-feed-id ${"0".repeat(64)} \\`);
  console.log(`    --invert 0 \\`);
  console.log(`    --unit-scale 0 \\`);
  console.log(`    --initial-mark ${initialMark} \\`);
  console.log(`    --maintenance-margin-bps 500 \\`);
  console.log(`    --initial-margin-bps 1000 \\`);
  console.log(`    --trading-fee-bps 5 \\`);
  console.log(`    --max-accounts 256`);
  console.log("");
  console.log("Note: indexFeedId=all-zeros enables Hyperp mode (admin-controlled oracle).");
  console.log("The keeper will sync FRED real rate data as the oracle price.");
  console.log("Margin is wider than vol perps since macro rates move slowly but carry risk.");
}
