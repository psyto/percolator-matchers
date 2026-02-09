export async function initJpyMarket(opts: { rpc: string }): Promise<void> {
  console.log("JPY Perps Market Init (Inverted Mode)");
  console.log("======================================");
  console.log("");
  console.log("JPY perps use an inverted market — JPY is both collateral and denomination.");
  console.log("Price = 1/JPY_USD = USD/JPY. 'Long' = long USD (profit if JPY weakens).");
  console.log("");
  console.log("Run the following percolator-cli command:");
  console.log("");
  console.log("  percolator-cli init-market \\");
  console.log("    --mint JPY_MINT \\");
  console.log("    --index-feed-id PYTH_JPY_USD_FEED \\");
  console.log("    --invert 1 \\");
  console.log("    --unit-scale 0 \\");
  console.log("    --maintenance-margin-bps 500 \\");
  console.log("    --initial-margin-bps 1000 \\");
  console.log("    --trading-fee-bps 3 \\");
  console.log("    --max-accounts 1024");
  console.log("");
  console.log("Note: invert=1 means price is displayed as USD/JPY (e.g., 150.00).");
  console.log("      JPY_MINT must be a Token-2022 mint with Meridian transfer hooks.");
  console.log("      Trading fee of 3 bps (0.03%) is competitive with institutional FX.");
}
