import { Connection, PublicKey } from "@solana/web3.js";

const WHITELIST_KYC_LEVEL_OFFSET = 40;
const WHITELIST_EXPIRY_OFFSET = 48;
const WHITELIST_JURISDICTION_OFFSET = 56;

const KYC_LEVEL_NAMES = ["Basic", "Standard", "Enhanced", "Institutional"];
const JURISDICTION_NAMES: Record<number, string> = {
  0: "US",
  1: "Sanctioned",
  2: "JP (Japan)",
  3: "SG (Singapore)",
  4: "EU",
  5: "UK",
  6: "Other-Regulated",
  7: "Other",
};

export async function checkCompliance(opts: {
  wallet: string;
  rpc: string;
}): Promise<void> {
  const connection = new Connection(opts.rpc, "confirmed");
  const wallet = new PublicKey(opts.wallet);

  // In production, derive the WhitelistEntry PDA from Meridian's program
  // PDA = [b"whitelist", registry.key, wallet.key]
  const kycRegistryPubkey = new PublicKey(
    process.env.KYC_REGISTRY || "1111111111111111111111111111111111111111111"
  );
  const meridianProgramId = new PublicKey(
    process.env.MERIDIAN_PROGRAM_ID || "1111111111111111111111111111111111111111111"
  );

  const [whitelistPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("whitelist"), kycRegistryPubkey.toBuffer(), wallet.toBuffer()],
    meridianProgramId,
  );

  console.log("Compliance Check");
  console.log("=================");
  console.log(`  Wallet: ${wallet.toBase58()}`);
  console.log(`  Whitelist PDA: ${whitelistPda.toBase58()}`);

  const info = await connection.getAccountInfo(whitelistPda);
  if (!info) {
    console.log("\n  Status: NOT WHITELISTED");
    console.log("  The wallet does not have a WhitelistEntry in the KYC registry.");
    console.log("  Contact the market operator for KYC onboarding.");
    return;
  }

  const data = info.data;
  const kycLevel = data[WHITELIST_KYC_LEVEL_OFFSET];
  const expiry = Number(data.readBigInt64LE(WHITELIST_EXPIRY_OFFSET));
  const jurisdiction = data[WHITELIST_JURISDICTION_OFFSET];
  const now = Math.floor(Date.now() / 1000);

  console.log(`\n  KYC Level: ${kycLevel} (${KYC_LEVEL_NAMES[kycLevel] || "Unknown"})`);
  console.log(`  Jurisdiction: ${jurisdiction} (${JURISDICTION_NAMES[jurisdiction] || "Unknown"})`);
  console.log(`  Expiry: ${new Date(expiry * 1000).toISOString()}`);
  console.log(`  Status: ${now < expiry ? "VALID" : "EXPIRED"}`);
}
