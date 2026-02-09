import { Command } from "commander";

const program = new Command();

program
  .name("macro-matcher-cli")
  .description("CLI for Real Rate Perps Matcher — trade real interest rates via Percolator")
  .version("0.1.0");

program
  .command("init-market")
  .description("Initialize a Percolator market for real rate perps (Hyperp mode)")
  .option("--rpc <url>", "RPC URL", "https://api.devnet.solana.com")
  .action(async (opts) => {
    const { initMacroMarket } = await import("./init-macro-market");
    await initMacroMarket(opts);
  });

program
  .command("init-lp")
  .description("Initialize LP with macro matcher")
  .requiredOption("--base-spread <bps>", "Base spread in bps")
  .requiredOption("--regime-spread <bps>", "Regime spread in bps")
  .requiredOption("--max-spread <bps>", "Maximum spread in bps")
  .requiredOption("--macro-oracle <pubkey>", "Authorized macro oracle pubkey")
  .option("--impact-k <bps>", "Impact multiplier bps", "100")
  .option("--rpc <url>", "RPC URL", "https://api.devnet.solana.com")
  .action(async (opts) => {
    const { initMacroLp } = await import("./init-macro-lp");
    await initMacroLp(opts);
  });

program
  .command("trade")
  .description("Trade real rate perps — long or short real rates")
  .requiredOption("--side <long|short>", "Trade side (long = rates rise, short = Stevenson's bet)")
  .requiredOption("--size <amount>", "Trade size")
  .option("--rpc <url>", "RPC URL", "https://api.devnet.solana.com")
  .action(async (opts) => {
    const { tradeMacro } = await import("./trade-macro");
    await tradeMacro(opts);
  });

program
  .command("status")
  .description("Show current macro regime, real rate index, and positions")
  .option("--context <pubkey>", "Matcher context account")
  .option("--rpc <url>", "RPC URL", "https://api.devnet.solana.com")
  .action(async (opts) => {
    const { macroStatus } = await import("./macro-status");
    await macroStatus(opts);
  });

program.parse();
