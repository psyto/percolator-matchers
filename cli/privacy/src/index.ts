import { Command } from "commander";

const program = new Command();

program
  .name("privacy-matcher-cli")
  .description("CLI for Privacy Perps Matcher — encrypted trade intents for Percolator")
  .version("0.1.0");

program
  .command("init-lp")
  .description("Initialize LP with privacy matcher")
  .requiredOption("--solver <pubkey>", "Solver wallet public key")
  .requiredOption("--base-spread <bps>", "Base spread in bps")
  .requiredOption("--max-spread <bps>", "Maximum spread in bps")
  .option("--solver-fee <bps>", "Solver fee in bps", "10")
  .option("--rpc <url>", "RPC URL", "https://api.devnet.solana.com")
  .action(async (opts) => {
    const { initPrivacyLp } = await import("./init-privacy-lp");
    await initPrivacyLp(opts);
  });

program
  .command("submit-intent")
  .description("Submit an encrypted trade intent")
  .requiredOption("--size <amount>", "Trade size (positive=long, negative=short)")
  .requiredOption("--max-slippage <bps>", "Max slippage in bps")
  .option("--deadline <timestamp>", "Unix timestamp deadline", "0")
  .option("--solver-pubkey <key>", "Solver encryption public key")
  .option("--rpc <url>", "RPC URL", "https://api.devnet.solana.com")
  .action(async (opts) => {
    const { submitIntent } = await import("./submit-intent");
    await submitIntent(opts);
  });

program
  .command("solver-status")
  .description("Check solver health and stats")
  .option("--rpc <url>", "RPC URL", "https://api.devnet.solana.com")
  .option("--context <pubkey>", "Matcher context account")
  .action(async (opts) => {
    const { solverStatus } = await import("./solver-status");
    await solverStatus(opts);
  });

program.parse();
