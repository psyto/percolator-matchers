import axios from "axios";

/**
 * Adapter to read event probability from Kalshi's API
 * Adapted from Kalshify's market data integration
 */
export class KalshiAdapter {
  private eventSlug: string;
  private apiBaseUrl: string;

  constructor() {
    this.eventSlug = process.env.KALSHI_EVENT_SLUG || "";
    this.apiBaseUrl = process.env.KALSHI_API_URL || "https://api.elections.kalshi.com/trade-api/v2";
  }

  /**
   * Get probability for the configured event
   * Returns probability in e6 format (0-1_000_000) or null if unavailable
   */
  async getProbability(): Promise<number | null> {
    if (!this.eventSlug) return null;

    try {
      const response = await axios.get(
        `${this.apiBaseUrl}/markets/${this.eventSlug}`,
        { timeout: 10_000 }
      );

      const market = response.data?.market;
      if (!market) return null;

      // Kalshi returns yes_price in cents (0-100)
      // Convert to e6: cents * 10_000
      const yesPrice = market.yes_price || market.last_price || 50;
      return yesPrice * 10_000;
    } catch (err) {
      console.warn(`Kalshi adapter error: ${err}`);
      return null;
    }
  }
}
