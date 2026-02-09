async function main() {
  console.log("JPY Matcher — Devnet Setup");
  console.log("===========================");
  console.log("");
  console.log("Prerequisites:");
  console.log("  1. Meridian KYC registry deployed with WhitelistEntry accounts");
  console.log("  2. Meridian JPY Token-2022 mint deployed with transfer hooks");
  console.log("  3. anchor build && anchor deploy for jpy-matcher");
  console.log("  4. Percolator installed");
  console.log("");
  console.log("Steps:");
  console.log("  1. Deploy jpy-matcher: anchor deploy");
  console.log("  2. Create Percolator market (inverted mode):");
  console.log("     npm run cli:init-market");
  console.log("  3. Create whitelist entries for test wallets:");
  console.log("     npm run cli:whitelist -- --action add --wallet <WALLET> --kyc-level 2 --jurisdiction 2");
  console.log("  4. Init LP with matcher:");
  console.log("     npm run cli:init-lp -- --kyc-registry <REG> --base-spread 20 --max-spread 100 --blocked-jurisdictions 03");
  console.log("  5. Update oracle price: (keeper or manual)");
  console.log("  6. Trade: npm run cli:trade -- --direction long --size 1000000");
  console.log("");
  console.log("Jurisdiction bitmask reference:");
  console.log("  bit 0 = US (0x01)");
  console.log("  bit 1 = Sanctioned (0x02)");
  console.log("  bit 2 = JP (0x04)");
  console.log("  bit 3 = SG (0x08)");
  console.log("  0x03 = block US + Sanctioned");
}

main().catch(console.error);
