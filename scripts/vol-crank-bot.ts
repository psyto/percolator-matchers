async function main() {
  console.log("Vol Crank Bot");
  console.log("=============");
  console.log("");
  console.log("This bot runs continuous vol oracle sync + Percolator keeper crank.");
  console.log("");
  console.log("Usage:");
  console.log("  MATCHER_CONTEXT=<pubkey> VARIANCE_TRACKER=<pubkey> VOL_INDEX=<pubkey> \\");
  console.log("    npm run keeper:start");
  console.log("");
  console.log("The keeper will:");
  console.log("  1. Read Sigma VarianceTracker for current vol + regime");
  console.log("  2. Read Sigma VolatilityIndex for 7d/30d averages");
  console.log("  3. Write vol data to vol-matcher context (tag 0x03)");
  console.log("  4. Update Percolator oracle authority price (vol level)");
  console.log("  5. Call Percolator keeper crank (funding rate update)");
  console.log("  6. Repeat every 5 seconds");
}

main().catch(console.error);
