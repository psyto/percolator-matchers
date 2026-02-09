import { describe, it } from "mocha";
import { expect } from "chai";

// Unit tests for privacy matcher pricing logic
describe("Privacy Matcher", () => {
  describe("Pricing", () => {
    function computeExecPrice(
      oraclePrice: number,
      baseSpread: number,
      solverFee: number,
      maxSpread: number
    ): number {
      const totalSpread = Math.min(baseSpread + solverFee, maxSpread);
      const spreadMultiplier = 10_000 + totalSpread;
      return Math.floor((oraclePrice * spreadMultiplier) / 10_000);
    }

    it("should compute correct exec price with base spread", () => {
      // Oracle: $100, base: 15bps, solver: 10bps, max: 100bps
      const price = computeExecPrice(100_000_000, 15, 10, 100);
      // Expected: 100_000_000 * 10025 / 10000 = 100_250_000
      expect(price).to.equal(100_250_000);
    });

    it("should cap spread at max_spread", () => {
      const price = computeExecPrice(100_000_000, 80, 50, 100);
      // total = 130, capped to 100
      // Expected: 100_000_000 * 10100 / 10000 = 101_000_000
      expect(price).to.equal(101_000_000);
    });

    it("should handle zero solver fee", () => {
      const price = computeExecPrice(100_000_000, 15, 0, 100);
      expect(price).to.equal(100_150_000);
    });

    it("should handle large oracle prices", () => {
      // BTC at $70,000
      const price = computeExecPrice(70_000_000_000, 15, 10, 100);
      expect(price).to.equal(70_175_000_000);
    });
  });

  describe("Encryption", () => {
    it("should encrypt and decrypt intent roundtrip", async () => {
      const { generateKeyPair, encrypt, decrypt, serializeIntent, deserializeIntent } =
        await import("../app/privacy-solver/src/encryption.ts");

      const solverKeys = generateKeyPair();
      const userKeys = generateKeyPair();

      const intent = {
        size: 1000000n,
        maxSlippageBps: 50,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      };

      const serialized = serializeIntent(intent);
      const { encrypted, nonce, ephemeralPubkey } = encrypt(
        serialized,
        solverKeys.publicKey,
        userKeys.secretKey
      );

      const decrypted = decrypt(encrypted, nonce, ephemeralPubkey, solverKeys.secretKey);
      const parsed = deserializeIntent(decrypted);

      expect(parsed.size).to.equal(intent.size);
      expect(parsed.maxSlippageBps).to.equal(intent.maxSlippageBps);
      expect(parsed.deadline).to.equal(intent.deadline);
    });
  });
});
