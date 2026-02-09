import nacl from "tweetnacl";

/**
 * NaCl box encryption/decryption for privacy intents
 * Adapted from Veil's confidential swap crypto
 */

export function generateKeyPair(): nacl.BoxKeyPair {
  return nacl.box.keyPair();
}

export function encrypt(
  message: Uint8Array,
  recipientPublicKey: Uint8Array,
  senderSecretKey: Uint8Array
): { encrypted: Uint8Array; nonce: Uint8Array; ephemeralPubkey: Uint8Array } {
  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const encrypted = nacl.box(message, nonce, recipientPublicKey, ephemeral.secretKey);

  if (!encrypted) {
    throw new Error("Encryption failed");
  }

  return {
    encrypted,
    nonce,
    ephemeralPubkey: ephemeral.publicKey,
  };
}

export function decrypt(
  encrypted: Uint8Array,
  nonce: Uint8Array,
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array
): Uint8Array {
  const decrypted = nacl.box.open(encrypted, nonce, senderPublicKey, recipientSecretKey);

  if (!decrypted) {
    throw new Error("Decryption failed — invalid ciphertext or wrong keys");
  }

  return decrypted;
}

/**
 * Serialize an intent for encryption
 */
export function serializeIntent(intent: {
  size: bigint;
  maxSlippageBps: number;
  deadline: bigint;
}): Uint8Array {
  const buffer = new ArrayBuffer(26); // 16 (i128) + 2 (u16) + 8 (i64)
  const view = new DataView(buffer);

  // Write size as i128 (little-endian, split into two i64)
  const sizeLow = intent.size & BigInt("0xFFFFFFFFFFFFFFFF");
  const sizeHigh = (intent.size >> 64n) & BigInt("0xFFFFFFFFFFFFFFFF");
  view.setBigUint64(0, sizeLow, true);
  view.setBigUint64(8, sizeHigh, true);

  // Write maxSlippageBps as u16
  view.setUint16(16, intent.maxSlippageBps, true);

  // Write deadline as i64
  view.setBigInt64(18, intent.deadline, true);

  return new Uint8Array(buffer);
}

/**
 * Deserialize a decrypted intent
 */
export function deserializeIntent(data: Uint8Array): {
  size: bigint;
  maxSlippageBps: number;
  deadline: bigint;
} {
  if (data.length < 26) {
    throw new Error(`Invalid intent data length: ${data.length}, expected 26`);
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const sizeLow = view.getBigUint64(0, true);
  const sizeHigh = view.getBigUint64(8, true);
  const size = (sizeHigh << 64n) | sizeLow;

  const maxSlippageBps = view.getUint16(16, true);
  const deadline = view.getBigInt64(18, true);

  return { size, maxSlippageBps, deadline };
}
