export async function tradeEvent(opts: {
  direction: string;
  size: string;
  rpc: string;
}): Promise<void> {
  const direction = opts.direction.toLowerCase();
  const size = parseInt(opts.size);
  const signedSize = direction === "short" ? -size : size;

  console.log("Event Perps Trade");
  console.log("==================");
  console.log(`  Direction: ${direction} probability`);
  console.log(`  Size: ${Math.abs(size)} (signed: ${signedSize})`);
  console.log(`  ${direction === "long"
    ? "Profit if event probability increases (betting YES)"
    : "Profit if event probability decreases (betting NO)"
  }`);
  console.log("");
  console.log("Run:");
  console.log(`  percolator-cli trade-cpi \\`);
  console.log(`    --size ${signedSize} \\`);
  console.log(`    --matcher EVENT_MATCHER_PROGRAM_ID \\`);
  console.log(`    --matcher-ctx MATCHER_CONTEXT`);
}
