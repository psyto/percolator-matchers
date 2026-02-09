async function main() {
  console.log("Event Matcher — Devnet Setup");
  console.log("=============================");
  console.log("");
  console.log("Prerequisites:");
  console.log("  1. anchor build && anchor deploy for event-matcher");
  console.log("  2. Percolator installed");
  console.log("");
  console.log("Steps:");
  console.log("  1. Deploy event-matcher: anchor deploy");
  console.log("  2. Create event market (Hyperp mode):");
  console.log('     npm run cli:create-market -- --event-name "Will SOL exceed $300 by March 2026?"');
  console.log("  3. Init LP with matcher:");
  console.log("     npm run cli:init-lp -- --base-spread 20 --edge-spread 50 --max-spread 500 \\");
  console.log("       --event-oracle <ORACLE_PUBKEY> --initial-probability 500000");
  console.log("  4. Start oracle service: npm run oracle:start");
  console.log("  5. Start keeper: npm run keeper:start");
  console.log("  6. Trade: npm run cli:trade -- --direction long --size 1000000");
  console.log("  7. Resolve: npm run cli:resolve -- --outcome yes --context <CTX>");
}

main().catch(console.error);
