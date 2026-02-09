async function main() {
  console.log("Vol Matcher — Devnet Setup");
  console.log("==========================");
  console.log("");
  console.log("Prerequisites:");
  console.log("  1. Sigma shared oracle deployed (VarianceTracker + VolatilityIndex)");
  console.log("  2. anchor build && anchor deploy for vol-matcher");
  console.log("  3. Percolator installed");
  console.log("");
  console.log("Steps:");
  console.log("  1. Deploy vol-matcher: anchor deploy");
  console.log("  2. Create Percolator market (Hyperp mode):");
  console.log("     npm run cli:init-market -- --initial-vol 4500");
  console.log("  3. Init LP with matcher:");
  console.log("     npm run cli:init-lp -- --base-spread 20 --vov-spread 30 --max-spread 200 \\");
  console.log("       --variance-tracker <VT_PUBKEY> --vol-index <VI_PUBKEY>");
  console.log("  4. Start keeper: npm run keeper:start");
  console.log("  5. Trade: npm run cli:trade -- --direction long --size 1000000");
}

main().catch(console.error);
