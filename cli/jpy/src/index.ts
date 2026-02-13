import { Command } from "commander";

const program = new Command();

program
  .name("jpy-matcher-cli")
  .description("CLI for JPY Regulated Perps Matcher — KYC-enforced trading with Token-2022 JPY")
  .version("0.1.0");

program
  .command("init-market")
  .description("Initialize a Percolator market for JPY perps (inverted)")
  .option("--rpc <url>", "RPC URL", process.env.RPC_URL || "https://api.devnet.solana.com")
  .action(async (opts) => {
    const { initJpyMarket } = await import("./init-jpy-market");
    await initJpyMarket(opts);
  });

program
  .command("init-lp")
  .description("Initialize LP with JPY matcher + compliance")
  .requiredOption("--kyc-registry <pubkey>", "Meridian KYC registry account")
  .requiredOption("--base-spread <bps>", "Base spread in bps")
  .requiredOption("--max-spread <bps>", "Maximum spread in bps")
  .option("--min-kyc <level>", "Minimum KYC level (0-3)", "1")
  .option("--kyc-discount <bps>", "Institutional discount in bps", "5")
  .option("--blocked-jurisdictions <mask>", "Blocked jurisdiction bitmask (hex)", "01")
  .option("--daily-volume-cap <amount>", "Daily volume cap in e6 (0=unlimited)", "0")
  .option("--rpc <url>", "RPC URL", process.env.RPC_URL || "https://api.devnet.solana.com")
  .action(async (opts) => {
    const { initJpyLp } = await import("./init-jpy-lp");
    await initJpyLp(opts);
  });

program
  .command("trade")
  .description("Trade JPY perps with KYC verification")
  .requiredOption("--direction <long|short>", "Trade direction (long USD/short JPY = long)")
  .requiredOption("--size <amount>", "Trade size")
  .option("--rpc <url>", "RPC URL", process.env.RPC_URL || "https://api.devnet.solana.com")
  .action(async (opts) => {
    const { tradeJpy } = await import("./trade-jpy");
    await tradeJpy(opts);
  });

program
  .command("check-compliance")
  .description("Check if a wallet is KYC-compliant for trading")
  .requiredOption("--wallet <pubkey>", "Wallet to check")
  .option("--rpc <url>", "RPC URL", process.env.RPC_URL || "https://api.devnet.solana.com")
  .action(async (opts) => {
    const { checkCompliance } = await import("./check-compliance");
    await checkCompliance(opts);
  });

program
  .command("admin-whitelist")
  .description("Manage whitelist entries (admin only)")
  .requiredOption("--action <add|remove|update>", "Whitelist action")
  .requiredOption("--wallet <pubkey>", "Target wallet")
  .option("--kyc-level <level>", "KYC level (0-3)", "1")
  .option("--jurisdiction <code>", "Jurisdiction code", "2")
  .option("--rpc <url>", "RPC URL", process.env.RPC_URL || "https://api.devnet.solana.com")
  .action(async (opts) => {
    const { adminWhitelist } = await import("./admin-whitelist");
    await adminWhitelist(opts);
  });

program.parse();
