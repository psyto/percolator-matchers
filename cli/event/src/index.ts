import { Command } from "commander";

const program = new Command();

program
  .name("event-matcher-cli")
  .description("CLI for Event Probability Perps Matcher — leveraged positions on event outcomes")
  .version("0.1.0");

program
  .command("create-market")
  .description("Create a new event perp market (Hyperp mode)")
  .requiredOption("--event-name <name>", "Event description")
  .option("--initial-probability <pct>", "Initial probability 0-100", "50")
  .option("--resolution-date <date>", "Resolution date (ISO format)")
  .option("--rpc <url>", "RPC URL", "https://api.devnet.solana.com")
  .action(async (opts) => {
    const { createEventMarket } = await import("./create-event-market");
    await createEventMarket(opts);
  });

program
  .command("init-lp")
  .description("Initialize LP with event matcher")
  .requiredOption("--base-spread <bps>", "Base spread in bps")
  .requiredOption("--edge-spread <bps>", "Edge spread in bps (extra near 0%/100%)")
  .requiredOption("--max-spread <bps>", "Maximum spread in bps")
  .requiredOption("--event-oracle <pubkey>", "Event oracle authority")
  .option("--initial-probability <e6>", "Initial probability (0-1000000)", "500000")
  .option("--rpc <url>", "RPC URL", "https://api.devnet.solana.com")
  .action(async (opts) => {
    const { initEventLp } = await import("./init-event-lp");
    await initEventLp(opts);
  });

program
  .command("trade")
  .description("Trade event perps — long/short probability")
  .requiredOption("--direction <long|short>", "Long = bet probability increases, Short = decreases")
  .requiredOption("--size <amount>", "Trade size")
  .option("--rpc <url>", "RPC URL", "https://api.devnet.solana.com")
  .action(async (opts) => {
    const { tradeEvent } = await import("./trade-event");
    await tradeEvent(opts);
  });

program
  .command("resolve")
  .description("Resolve an event market")
  .requiredOption("--outcome <yes|no>", "Event outcome")
  .requiredOption("--context <pubkey>", "Matcher context account")
  .option("--rpc <url>", "RPC URL", "https://api.devnet.solana.com")
  .action(async (opts) => {
    const { resolveEvent } = await import("./resolve-event");
    await resolveEvent(opts);
  });

program
  .command("list")
  .description("List active event markets")
  .option("--rpc <url>", "RPC URL", "https://api.devnet.solana.com")
  .action(async (opts) => {
    const { listEvents } = await import("./list-events");
    await listEvents(opts);
  });

program.parse();
