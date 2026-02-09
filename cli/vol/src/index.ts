import { Command } from "commander";

const program = new Command();

program
  .name("vol-matcher-cli")
  .description("CLI for Volatility Perps Matcher — trade realized vol via Percolator")
  .version("0.1.0");

program
  .command("init-market")
  .description("Initialize a Percolator market for vol perps (Hyperp mode)")
  .requiredOption("--initial-vol <bps>", "Initial volatility in bps (e.g., 4500 for 45%)")
  .option("--rpc <url>", "RPC URL", "https://api.devnet.solana.com")
  .action(async (opts) => {
    const { initVolMarket } = await import("./init-vol-market");
    await initVolMarket(opts);
  });

program
  .command("init-lp")
  .description("Initialize LP with vol matcher")
  .requiredOption("--base-spread <bps>", "Base spread in bps")
  .requiredOption("--vov-spread <bps>", "Vol-of-vol spread in bps")
  .requiredOption("--max-spread <bps>", "Maximum spread in bps")
  .requiredOption("--variance-tracker <pubkey>", "Sigma VarianceTracker account")
  .requiredOption("--vol-index <pubkey>", "Sigma VolatilityIndex account")
  .option("--impact-k <bps>", "Impact multiplier bps", "100")
  .option("--rpc <url>", "RPC URL", "https://api.devnet.solana.com")
  .action(async (opts) => {
    const { initVolLp } = await import("./init-vol-lp");
    await initVolLp(opts);
  });

program
  .command("trade")
  .description("Trade vol perps — long or short volatility")
  .requiredOption("--direction <long|short>", "Trade direction")
  .requiredOption("--size <amount>", "Trade size")
  .option("--rpc <url>", "RPC URL", "https://api.devnet.solana.com")
  .action(async (opts) => {
    const { tradeVol } = await import("./trade-vol");
    await tradeVol(opts);
  });

program
  .command("status")
  .description("Show current vol regime, mark price, and positions")
  .option("--context <pubkey>", "Matcher context account")
  .option("--rpc <url>", "RPC URL", "https://api.devnet.solana.com")
  .action(async (opts) => {
    const { volStatus } = await import("./vol-status");
    await volStatus(opts);
  });

program.parse();
