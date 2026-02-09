export async function tradeMacro(opts: {
  side: string;
  size: string;
  rpc: string;
}): Promise<void> {
  const side = opts.side.toLowerCase();
  const size = parseInt(opts.size);
  const signedSize = side === "short" ? -size : size;

  console.log("Real Rate Perps Trade");
  console.log("=====================");
  console.log(`  Side: ${side} real rates`);
  console.log(`  Size: ${Math.abs(size)} (signed: ${signedSize})`);
  console.log("");
  if (side === "long") {
    console.log("  LONG = betting real rates rise (economy recovers, policy works)");
  } else {
    console.log("  SHORT = Stevenson's bet (inequality keeps rates at zero/negative forever)");
  }
  console.log("");
  console.log("Run the following percolator-cli command:");
  console.log("");
  console.log(`  percolator-cli trade-cpi \\`);
  console.log(`    --size ${signedSize} \\`);
  console.log(`    --matcher MACRO_MATCHER_PROGRAM_ID \\`);
  console.log(`    --matcher-ctx MATCHER_CONTEXT`);
}
