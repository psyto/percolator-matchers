import { Keypair } from "@solana/web3.js";
import { encrypt, serializeIntent, generateKeyPair } from "../../../app/privacy-solver/src/encryption";
import * as fs from "fs";

export async function submitIntent(opts: {
  size: string;
  maxSlippage: string;
  deadline: string;
  solverPubkey?: string;
  rpc: string;
}): Promise<void> {
  const walletPath = process.env.WALLET_PATH || `${process.env.HOME}/.config/solana/id.json`;
  const userKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  // Serialize intent
  const intent = {
    size: BigInt(opts.size),
    maxSlippageBps: parseInt(opts.maxSlippage),
    deadline: BigInt(opts.deadline),
  };

  const serialized = serializeIntent(intent);

  // Get solver's encryption pubkey
  let solverPubkey: Uint8Array;
  if (opts.solverPubkey) {
    solverPubkey = Uint8Array.from(Buffer.from(opts.solverPubkey, "hex"));
  } else {
    console.error("Error: --solver-pubkey is required");
    process.exit(1);
  }

  // Encrypt with solver's pubkey
  const { encrypted, nonce, ephemeralPubkey } = encrypt(
    serialized,
    solverPubkey,
    userKeypair.secretKey.slice(0, 32)
  );

  // In production, submit to WebSocket intent queue
  // For now, output the encrypted intent
  const encryptedIntent = {
    id: `intent-${Date.now()}`,
    userPubkey: userKeypair.publicKey.toBase58(),
    encryptedPayload: Buffer.from(encrypted).toString("hex"),
    nonce: Buffer.from(nonce).toString("hex"),
    userEphemeralPubkey: Buffer.from(ephemeralPubkey).toString("hex"),
    timestamp: Date.now(),
  };

  console.log("Encrypted intent created:");
  console.log(JSON.stringify(encryptedIntent, null, 2));
  console.log("\nSubmit this to the solver's intent queue endpoint.");
}
