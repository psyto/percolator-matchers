import axios from "axios";

const FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations";

/**
 * FRED API adapter for macroeconomic data.
 * Fetches SOFR (nominal rate) and 5-Year Breakeven Inflation.
 */
export class FredDataSource {
  constructor(private apiKey: string) {}

  /**
   * Fetch the latest SOFR (Secured Overnight Financing Rate) in bps.
   * FRED series: SOFR
   */
  async fetchSOFR(): Promise<number> {
    if (!this.apiKey) {
      console.warn("No FRED API key — using fallback SOFR: 530 bps (5.30%)");
      return 530;
    }

    try {
      const resp = await axios.get(FRED_BASE_URL, {
        params: {
          series_id: "SOFR",
          api_key: this.apiKey,
          file_type: "json",
          sort_order: "desc",
          limit: 1,
        },
      });

      const obs = resp.data.observations;
      if (!obs || obs.length === 0 || obs[0].value === ".") {
        console.warn("No SOFR data — using fallback 530 bps");
        return 530;
      }

      // FRED returns percentage (e.g., 5.30 for 5.30%)
      const pct = parseFloat(obs[0].value);
      return Math.round(pct * 100); // Convert to bps
    } catch (err) {
      console.error("FRED SOFR fetch error:", err);
      return 530; // fallback
    }
  }

  /**
   * Fetch the latest 5-Year Breakeven Inflation Rate in bps.
   * FRED series: T5YIE
   */
  async fetchBreakevenInflation(): Promise<number> {
    if (!this.apiKey) {
      console.warn("No FRED API key — using fallback inflation: 230 bps (2.30%)");
      return 230;
    }

    try {
      const resp = await axios.get(FRED_BASE_URL, {
        params: {
          series_id: "T5YIE",
          api_key: this.apiKey,
          file_type: "json",
          sort_order: "desc",
          limit: 1,
        },
      });

      const obs = resp.data.observations;
      if (!obs || obs.length === 0 || obs[0].value === ".") {
        console.warn("No breakeven data — using fallback 230 bps");
        return 230;
      }

      const pct = parseFloat(obs[0].value);
      return Math.round(pct * 100); // Convert to bps
    } catch (err) {
      console.error("FRED breakeven fetch error:", err);
      return 230; // fallback
    }
  }

  /**
   * Compute real rate = nominal - inflation expectations.
   * Returns { nominalBps, inflationBps, realRateBps }
   */
  async fetchRealRate(): Promise<{
    nominalBps: number;
    inflationBps: number;
    realRateBps: number;
  }> {
    const [nominalBps, inflationBps] = await Promise.all([
      this.fetchSOFR(),
      this.fetchBreakevenInflation(),
    ]);

    const realRateBps = nominalBps - inflationBps;

    console.log(
      `FRED data: SOFR=${nominalBps}bps (${nominalBps / 100}%) ` +
      `inflation=${inflationBps}bps (${inflationBps / 100}%) ` +
      `real=${realRateBps}bps (${realRateBps / 100}%)`
    );

    return { nominalBps, inflationBps, realRateBps };
  }
}
