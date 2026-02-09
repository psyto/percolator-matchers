import axios from "axios";

/**
 * Adapter to read event probability from Polymarket's API
 */
export class PolymarketAdapter {
  private conditionId: string;
  private apiBaseUrl: string;

  constructor() {
    this.conditionId = process.env.POLYMARKET_CONDITION_ID || "";
    this.apiBaseUrl = process.env.POLYMARKET_API_URL || "https://clob.polymarket.com";
  }

  /**
   * Get probability for the configured event
   * Returns probability in e6 format (0-1_000_000) or null if unavailable
   */
  async getProbability(): Promise<number | null> {
    if (!this.conditionId) return null;

    try {
      const response = await axios.get(
        `${this.apiBaseUrl}/markets/${this.conditionId}`,
        { timeout: 10_000 }
      );

      const market = response.data;
      if (!market) return null;

      // Polymarket returns price as decimal (0.0-1.0)
      // Convert to e6: price * 1_000_000
      const price = parseFloat(market.outcomePrices?.[0] || market.bestAsk || "0.5");
      return Math.round(price * 1_000_000);
    } catch (err) {
      console.warn(`Polymarket adapter error: ${err}`);
      return null;
    }
  }
}
