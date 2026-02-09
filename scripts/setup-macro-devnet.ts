async function main() {
  console.log("Macro Matcher — Devnet Setup");
  console.log("============================");
  console.log("");
  console.log("Prerequisites:");
  console.log("  1. FRED API key (https://fred.stlouisfed.org/docs/api/api_key.html)");
  console.log("  2. anchor build && anchor deploy for macro-matcher");
  console.log("  3. Percolator installed");
  console.log("");
  console.log("Steps:");
  console.log("  1. Deploy macro-matcher: anchor deploy");
  console.log("  2. Create Percolator market (Hyperp mode):");
  console.log("     npm run macro:init-market");
  console.log("  3. Init LP with matcher:");
  console.log("     npm run macro:init-lp -- --base-spread 20 --regime-spread 40 --max-spread 200 \\");
  console.log("       --macro-oracle <ORACLE_PUBKEY>");
  console.log("  4. Set FRED_API_KEY in .env");
  console.log("  5. Start keeper: npm run macro:keeper");
  console.log("  6. Trade:");
  console.log("     npm run macro:trade -- --side long --size 1000000   (economy recovers)");
  console.log("     npm run macro:trade -- --side short --size 1000000  (Stevenson's bet)");
  console.log("");
  console.log("Macro Regimes:");
  console.log("  0 = Expansion  (0.60x spread) — rates rising, GDP growing");
  console.log("  1 = Stagnation (1.00x spread) — Stevenson's baseline");
  console.log("  2 = Crisis     (2.00x spread) — rates collapsing, panic");
  console.log("  3 = Recovery   (1.25x spread) — transitional");
}

main().catch(console.error);
