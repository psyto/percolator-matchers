export async function tradeJpy(opts: {
  direction: string;
  size: string;
  rpc: string;
}): Promise<void> {
  const direction = opts.direction.toLowerCase();
  const size = parseInt(opts.size);
  const signedSize = direction === "short" ? -size : size;

  console.log("JPY Perps Trade (KYC-Verified)");
  console.log("===============================");
  console.log(`  Direction: ${direction}`);
  console.log(`  Size: ${Math.abs(size)} (signed: ${signedSize})`);
  console.log(`  ${direction === "long" ? "Long USD/Short JPY (profit if JPY weakens)" : "Short USD/Long JPY (profit if JPY strengthens)"}`);
  console.log("");
  console.log("Note: Your wallet must have a valid WhitelistEntry PDA from Meridian's KYC registry.");
  console.log("The matcher will verify your KYC level, jurisdiction, and daily volume limits.");
  console.log("");
  console.log("Run:");
  console.log(`  percolator-cli trade-cpi \\`);
  console.log(`    --size ${signedSize} \\`);
  console.log(`    --matcher JPY_MATCHER_PROGRAM_ID \\`);
  console.log(`    --matcher-ctx MATCHER_CONTEXT \\`);
  console.log(`    --remaining-accounts USER_WHITELIST_PDA,LP_WHITELIST_PDA`);
}
