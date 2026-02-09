import { PublicKey } from "@solana/web3.js";

export interface SolverConfig {
  rpcUrl: string;
  solverKeypairPath: string;
  matcherProgramId: PublicKey;
  matcherContextAccount: PublicKey;
  percolatorCliPath: string;
  pollIntervalMs: number;
  maxSlippageBps: number;
  intentQueueUrl: string; // WebSocket URL for off-chain intent queue
}

export const DEFAULT_CONFIG: Partial<SolverConfig> = {
  rpcUrl: "https://api.devnet.solana.com",
  pollIntervalMs: 1000,
  maxSlippageBps: 500,
};

export interface EncryptedIntent {
  id: string;
  userPubkey: string;
  encryptedPayload: Uint8Array; // NaCl box encrypted
  nonce: Uint8Array;
  userEphemeralPubkey: Uint8Array; // X25519 ephemeral pubkey from user
  timestamp: number;
}

export interface DecryptedIntent {
  id: string;
  userPubkey: string;
  size: bigint; // i128: positive=long, negative=short
  maxSlippageBps: number; // u16
  deadline: bigint; // i64 unix timestamp
}
