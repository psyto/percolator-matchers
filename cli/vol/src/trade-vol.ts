export async function tradeVol(opts: {
  direction: string;
  size: string;
  rpc: string;
}): Promise<void> {
  const direction = opts.direction.toLowerCase();
  const size = parseInt(opts.size);
  const signedSize = direction === "short" ? -size : size;

  console.log("Vol Perps Trade");
  console.log("================");
  console.log(`  Direction: ${direction} vol`);
  console.log(`  Size: ${Math.abs(size)} (signed: ${signedSize})`);
  console.log("");
  console.log(`  ${direction === "long" ? "Profit if vol increases" : "Profit if vol decreases"}`);
  console.log("");
  console.log("Run the following percolator-cli command:");
  console.log("");
  console.log(`  percolator-cli trade-cpi \\`);
  console.log(`    --size ${signedSize} \\`);
  console.log(`    --matcher VOL_MATCHER_PROGRAM_ID \\`);
  console.log(`    --matcher-ctx MATCHER_CONTEXT`);
}
