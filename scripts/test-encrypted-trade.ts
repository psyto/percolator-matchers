import { generateKeyPair, encrypt, serializeIntent, decrypt, deserializeIntent } from "../app/privacy-solver/src/encryption";

async function main() {
  console.log("Privacy Matcher — End-to-End Encrypted Trade Test");
  console.log("==================================================");

  // 1. Generate solver keypair
  const solverKeys = generateKeyPair();
  console.log(`Solver pubkey: ${Buffer.from(solverKeys.publicKey).toString("hex")}`);

  // 2. User creates and encrypts intent
  const intent = {
    size: 5_000_000n, // 5 units long
    maxSlippageBps: 30,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 300), // 5 min deadline
  };
  console.log(`\nUser intent: size=${intent.size}, slippage=${intent.maxSlippageBps}bps`);

  const serialized = serializeIntent(intent);
  const userKeys = generateKeyPair();
  const { encrypted, nonce, ephemeralPubkey } = encrypt(
    serialized,
    solverKeys.publicKey,
    userKeys.secretKey
  );
  console.log(`Encrypted payload: ${Buffer.from(encrypted).toString("hex").slice(0, 40)}...`);

  // 3. Solver decrypts
  const decrypted = decrypt(encrypted, nonce, ephemeralPubkey, solverKeys.secretKey);
  const parsed = deserializeIntent(decrypted);
  console.log(`\nSolver decrypted: size=${parsed.size}, slippage=${parsed.maxSlippageBps}bps`);

  // 4. Verify roundtrip
  if (parsed.size === intent.size && parsed.maxSlippageBps === intent.maxSlippageBps) {
    console.log("\n✓ Encryption roundtrip successful!");
  } else {
    console.error("\n✗ Encryption roundtrip failed!");
    process.exit(1);
  }

  // 5. Simulate pricing
  const oraclePrice = 150_000_000; // $150
  const baseSpread = 15; // 0.15%
  const solverFee = 10; // 0.1%
  const maxSpread = 100; // 1%
  const totalSpread = Math.min(baseSpread + solverFee, maxSpread);
  const execPrice = Math.floor((oraclePrice * (10_000 + totalSpread)) / 10_000);
  console.log(`\nPricing simulation:`);
  console.log(`  Oracle: $${oraclePrice / 1e6}`);
  console.log(`  Spread: ${totalSpread} bps`);
  console.log(`  Exec price: $${execPrice / 1e6}`);
  console.log(`  Spread cost: $${(execPrice - oraclePrice) / 1e6}`);
}

main().catch(console.error);
