# Percolator x Existing Repos: Cross-Breed Analysis

*Generated: 2026-02-07*

---

## What is Percolator?

Percolator is a small Open Source formally verified library for managing risk that devs can use to build their own markets. It's designed to let users bring their own matching programs to provide offers. All the innovation is in the matching program piece; all the pain is in making sure the risk engine is safe.

| Component | Description |
|-----------|-------------|
| **percolator** | Risk engine library. The nuts and bolts of managing risk on chain. |
| **percolator-prog** | Main Solana program. Wraps the risk engine and implements different ways the engine can be used for different markets. |
| **percolator-match** | A demo matching program. You can do way better than this. |
| **percolator-cli** | TypeScript wrapper for everything. Point your clawd at it to start. |

**Author**: Anatoly Yakovenko (Solana co-founder)
**Status**: Feature complete, HAS NOT been audited by humans. If you find an attack vector, submit a PR.
**Key Insight**: Point clawd at percolator-prog and ask it to build a new market using the engine that does XYZ — it will one-shot it and basically get it right. (DO NOT TRUST, VERIFY)

---

## Architecture: How It Fits Together

Percolator is the center. Existing repos plug into it via custom matching programs.

```
Existing Repos               Percolator              Output
──────────────               ──────────              ──────

Sovereign (reputation)  →  ┌─────────────────┐
                           │                 │
Veil (privacy/encrypt) →   │  Risk Engine    │  →  Novel market types
                           │  (percolator)   │     that nobody else
Sigma (vol oracles)    →   │                 │     has built
                           │  + YOUR custom  │
Meridian (compliance)  →   │    matching     │
                           │    programs     │
Kalshify (signals)     →   │                 │
                           └─────────────────┘
Stratum (state optim)  →        ↑
                                │
                         percolator-prog
                         (wraps the engine)
```

You don't rewrite risk engines. You write **custom matching programs** — and that's where existing repos come in:

- **Sovereign** → matcher reads PDA on-chain, adjusts leverage/spread per tier
- **Veil** → matcher accepts encrypted intents, decrypts and matches privately
- **Sigma** → vol oracle feeds a new market type (vol perp) into Percolator's engine
- **Meridian** → Token-2022 transfer hooks wrap around Percolator markets for KYC
- **Kalshify** → signal intelligence feeds a smarter matcher pricing algorithm
- **Stratum** → optimizes Percolator's slab storage architecture

---

## Cross-Breed Directions

### 1. Privacy Perps / Dark Pool Matcher
**Repos**: Veil + Sigma + Percolator

Build a custom matching program that accepts encrypted order intents (NaCl box from Veil) and executes via a solver, preventing MEV/frontrunning. Sigma's private intents layer already has the encryption patterns. This would be the first dark pool for on-chain perps on Solana.

### 2. Reputation-Gated Dynamic Leverage
**Repos**: Sovereign + Percolator

A matching program that reads a trader's SOVEREIGN tier on-chain and adjusts leverage limits, margin requirements, and fee rates dynamically. Diamond tier = 20x, Bronze = 2x. Sovereign already has the PDA structure and scoring dimensions (Trading: win rate, drawdown, consistency).

### 3. Volatility Perps
**Repos**: Sigma + Percolator

Use Sigma's on-chain volatility index (SVI) and CEX funding rate aggregator as the oracle for a new perp market — a perpetual contract on realized volatility itself. Pure vol exposure without delta, using Percolator's risk engine to manage margin.

### 4. JPY-Collateralized Regulated Perps
**Repos**: Meridian + Continuum + Percolator

Percolator markets with JPY stablecoin as collateral, Token-2022 transfer hooks for KYC/jurisdiction enforcement from Meridian, and Continuum's treasury management for institutional margin. First regulated perp exchange for the Japanese market.

### 5. Event Perps
**Repos**: Kalshify + Velo + Komon + Percolator

Instead of binary YES/NO prediction markets, create leveraged perpetual contracts on event probabilities. Kalshify's signal intelligence (smart money detection, volume spikes) feeds a custom matcher. Velo's real-time oracle pattern shows how to pipe real-world data into mark price.

### 6. State-Optimized Mega-Slab
**Repos**: Stratum + Percolator

Use Stratum's bitfield tracking (2,048 flags per chunk) and merkle commitments to scale Percolator's slab architecture. Archive historical positions off-chain with merkle proofs, use bitfields for liquidation eligibility scanning, and events-over-storage to cut on-chain costs by ~90%.

---

## Deep Multi-Dimensional Analysis

### 1. Privacy Perps / Dark Pool Matcher

#### Business
- Market: $1.2T+/month perp volume globally. HumidiFi proved Solana wants dark pool execution ($100B cumulative in 5 months). But HumidiFi is "dark" in the marketing sense (opaque pricing), not cryptographically private. Renegade (Arbitrum) does true MPC/ZK privacy but only for spot.
- Revenue model: Fees on matched volume. Dark pools command premium spreads in TradFi because participants willingly pay more for non-information-leaking execution.
- TAM: Institutional/whale traders. CZ publicly called for dark pool perps in June 2025 — the demand signal is explicit.
- Go-to-market: Target Solana whales tired of getting frontrun. Even a small slice of Jupiter Perps' $17B/month is massive.

#### Technical
- Feasibility: **Hard but achievable.** NaCl box encryption in Veil, private intents in Sigma, Percolator provides the risk engine. The custom matcher would accept encrypted orders, a solver decrypts and matches, then submits atomic settlement transactions.
- Key challenge: Latency. MPC/ZK adds computational overhead. On Solana's 400ms slots, the privacy layer must be fast enough. NaCl box encryption is fast (microseconds); full ZK proofs are not. The pragmatic path is solver-based (like Veil intents) rather than full MPC.
- Code reuse: ~60% from existing repos.
- Time to MVP: 6-8 weeks for encrypted-intent matcher on devnet.

#### Innovation
- Novelty: **First in the world.** No protocol combines cryptographic privacy with perpetual futures. Renegade is spot-only. HumidiFi is marketing-dark, not crypto-dark.
- Defensibility: High. The matching program is the moat — anyone can fork Percolator's risk engine, but the privacy solver is where the IP lives.
- First-mover advantage: Strong. Once whales route through the dark pool, switching costs are real.

#### Philosophical
- Financial privacy is a human right. In TradFi, dark pools exist because large orders shouldn't be taxed by frontrunners for the crime of being large. On-chain, this is worse — MEV bots extract billions annually.
- Counter-argument: Dark pools can enable manipulation (Barclays, Credit Suisse fines). The tension is real: privacy vs. transparency.
- Resolution: Selective disclosure. ZK proofs that prove regulatory compliance without revealing order details. Veil's architecture already contemplates this.

#### Risk
- Regulatory scrutiny of dark pools is intensifying globally.
- Solver centralization: If one entity decrypts and matches, you've recreated a centralized exchange with extra steps.
- If MEV protection becomes a default Solana feature, the moat erodes.

---

### 2. Reputation-Gated Dynamic Leverage

#### Business
- Market: Tokenized private credit market grew 930% to $9.68B in 2025. But **zero perp DEXs** adjust leverage based on reputation today. Every trader gets the same margin requirements.
- Revenue model: Tiered fees (lower fees for higher reputation = more volume from power users) + premium for higher leverage tiers. Essentially selling credit — the most profitable business in finance.
- TAM: Every perp trader. This isn't a niche — it changes how all perp markets work.
- Go-to-market: "The perp DEX that rewards good traders." Immediate viral hook.

#### Technical
- Feasibility: **Most achievable of all six.** Sovereign already has PDA-based tier scoring with Trading dimension. The Percolator matcher just reads the Sovereign PDA and adjusts spread/margin accordingly.
- Key challenge: Sybil resistance. Sophisticated attacker farms reputation on a "clean" wallet, earns Diamond tier, then exploits higher leverage. Sovereign addresses this partially with multi-dimensional scoring, but it's an arms race.
- Code reuse: ~80%. Sovereign is essentially ready.
- Time to MVP: 3-4 weeks. Fastest to ship of all options.

#### Innovation
- Novelty: **High but not unprecedented in concept.** Spectral (MACRO score) and Credora exist for lending, but nobody has applied credit scoring to perp leverage.
- Defensibility: Medium. The scoring algorithm is copyable. Real defensibility is in the data — Sovereign's cross-protocol reputation becomes more valuable as more protocols write to it.
- Network effects: Strong. As more traders build Sovereign reputation, they're locked into the ecosystem. Credit history as golden handcuffs.

#### Philosophical
- This is **meritocracy in finance**. A whale with a fresh wallet and a consistent trader with 1,000 profitable trades shouldn't get the same leverage. Reputation-gated leverage aligns risk with demonstrated competence.
- Deeper: The crypto-native answer to "why should I trust you?" In TradFi, trust is mediated by institutions. Here, trust is mediated by math — on-chain history speaks for itself.
- Counter-argument: Creates a two-tier system. New traders are disadvantaged. "The rich get richer" dynamic. Need a thoughtful onboarding ramp.
- Also: Who controls the scoring algorithm controls who gets leverage. Governance of Sovereign's weights matters enormously.

#### Risk
- Reputation gaming / Sybil attacks are the existential risk.
- Regulatory: Offering different leverage based on algorithmic scoring could be considered discriminatory in some jurisdictions.
- Cold start: The system is useless until enough traders have scores.

---

### 3. Volatility Perps

#### Business
- Market: In TradFi, volatility derivatives are ~$50B+ annual notional (variance swaps alone). VIX futures trade ~$1B/day on CBOE. On-chain? **Literally zero.** Squeeth (ETH²) was adjacent but declining. Volmex provides indices but no trading venue.
- Revenue model: Trading fees + funding rate spread. Vol markets are structurally wide-spread, so the protocol captures more per trade than directional perps.
- TAM: Professional traders, market makers, funds running delta-neutral strategies. Smaller audience but higher value per user.
- Go-to-market: Partner with Volmex for the index feed. Target crypto-native quant funds who currently trade Deribit DVOL off-chain.

#### Technical
- Feasibility: **Hard.** Core challenge is the oracle — what is the "price" of a vol perp? Need either: (a) implied vol oracle (requires options market data, thin on Solana), or (b) realized vol oracle (computable from price history, which Sigma's SVI already does).
- Sigma's existing infrastructure: TWAP oracle, variance tracking, regime detection, CEX funding rate aggregation. ~70% of what's needed.
- Key challenge: Liquidity bootstrapping. Vol products are reflexive — low liquidity → wide spreads → low volume → low liquidity.
- Code reuse: ~50%. Sigma provides oracle layer. Percolator provides risk engine.
- Time to MVP: 8-12 weeks. Needs careful oracle design and testing.

#### Innovation
- Novelty: **Highest of all six.** On-chain vol perps don't exist anywhere. First-in-crypto, not just first-on-Solana.
- Defensibility: Very high. Vol oracle infrastructure is genuinely hard to build. Sigma's existing work gives a multi-month head start.
- Academic significance: Publishable. Crypto vol derivatives are an active research area.

#### Philosophical
- Volatility is **the most fundamental quantity in finance** — more fundamental than price. Price tells you where an asset is. Vol tells you how uncertain the market is about where it's going. Yet in crypto, there's no way to directly trade this uncertainty on-chain.
- Democratizing vol trading: In TradFi, variance swaps are OTC products available only to institutional investors with ISDA agreements. An on-chain vol perp makes this accessible to anyone with a wallet.
- Meta-philosophical: Creating a **market for uncertainty itself**. The financial equivalent of trading "how much we don't know."

#### Risk
- Liquidity death spiral: Vol markets need market makers. If they leave, the product dies.
- Oracle manipulation: If someone can move the vol oracle, they can extract unlimited profit. Sigma's multi-source aggregation mitigates this.
- Small TAM initially: Most crypto traders don't understand volatility as a tradeable asset.

---

### 4. JPY-Collateralized Regulated Perps

#### Business
- Market: Japan's retail FX market is the largest in the world. The "Mrs. Watanabe" phenomenon moves ~$10T/year in FX. JPYC launched on Ethereum Oct 2025. Big 3 banks (MUFG, SMBC, Mizuho) launching joint JPY stablecoin in 2026.
- Revenue model: Trading fees + lending margin interest + JPY carry trade facilitation on-chain.
- TAM: Massive in theory. Japanese retail FX traders + institutional flows. Regulatory gatekeeping limits practical accessibility.
- Go-to-market: SBI Holdings / Startale Group / 新生信託銀行 partnership already mapped. Percolator is the trading engine, Meridian is the compliance layer.

#### Technical
- Feasibility: **Technically straightforward, regulatorily hard.** Percolator risk engine + Token-2022 transfer hooks for KYC (already in Meridian) + JPY mint. The challenge is FSA approval, banking partnerships, compliance infrastructure.
- Key challenge: Japan's PSA requires licensed Electronic Payment Instrument Operators. Business problem, not technical.
- Code reuse: ~70%. Meridian compliance module, Continuum treasury management, Percolator engine.
- Time to MVP: 4-6 weeks for devnet (technical). 6-12 months for regulatory approval (business).

#### Innovation
- Novelty: **Medium-high.** JPY perps don't exist on-chain anywhere. But the concept isn't architecturally novel — it's application of known patterns to a new jurisdiction.
- Defensibility: **Extremely high.** The regulatory moat is the best moat in business. First FSA-approved JPY perp DEX forces competitors through 12+ month licensing.
- First-mover advantage: Critical. Japan's regulatory window is opening now (2025-2026).

#### Philosophical
- Japan pioneered crypto regulation. Building the first regulated on-chain perp exchange there is a statement: **DeFi can work within regulatory frameworks, not just around them.**
- **Financial sovereignty for Japan.** The crypto derivatives market is dominated by USD. A JPY-native perp exchange gives Japanese traders exposure without USD conversion risk.
- The carry trade angle: Japanese savers have suffered from decades of zero/negative interest rates. On-chain JPY carry trades democratize a strategy previously available only to FX desks.

#### Risk
- Regulatory risk cuts both ways: FSA could tighten rules, change requirements, or take years to approve.
- Dependency on JPY stablecoin partners (SBI, 新生信託銀行). If partnerships stall, the project stalls.
- Japan's crypto market, while large for FX, has been conservative in DeFi adoption.

---

### 5. Event Perps

#### Business
- Market: Prediction markets hit $33B+ in 2025 (Polymarket alone). Kalshi did $43B. But these are all **spot** markets — buy YES at $0.40, max upside $0.60. Nobody offers leveraged perpetual exposure to event probabilities.
- Revenue model: Trading fees + funding rates. The funding rate becomes a real-time consensus measure of event probability drift.
- TAM: Polymarket's user base ($5B/month) + perp traders who want event exposure. Currently separate audiences — this bridges them.
- Go-to-market: "Polymarket with leverage." Instant meme.

#### Technical
- Feasibility: **Novel and tricky.** Core design challenge: what does "mark price" of an event perp mean? Needs to be continuous (0-1 probability) converging to 0 or 1 at resolution. Funding rate must anchor perp price to oracle probability.
- Oracle challenge: Where does "true probability" come from? Options: (a) Polymarket prices via oracle, (b) internal TWAP, (c) custom oracle from Kalshify signals.
- Key challenge: At resolution, the perp must settle. This breaks the "perpetual" nature. Need a mechanism for event expiry.
- Code reuse: ~40%. Kalshify intelligence, Velo oracle patterns, Komon resolution. Core mechanism is genuinely new code.
- Time to MVP: 8-10 weeks. Requires novel mechanism design and extensive simulation.

#### Innovation
- Novelty: **Very high.** Leveraged perpetual exposure to event probabilities is a new financial primitive.
- Defensibility: Medium. Mechanism design is the moat, but once published, it's copyable.
- Academic significance: High. Publishable as a mechanism design paper.

#### Philosophical
- Prediction markets are **the most epistemically honest institution humanity has created** — they reward truth-seeking over narrative. Event perps amplify this: leverage concentrates attention and capital on getting probability right.
- Dark side: Leverage on events creates incentives to **influence outcomes**, not just predict them. "Will politician X resign" with 10x leverage = stronger manipulation incentives.
- The question: Does adding leverage to prediction markets improve information aggregation (attracting sophisticated capital) or corrupt it (attracting manipulation)?
- Resolution: Focus on events that are hard to manipulate (natural phenomena, large-scale economic indicators, crypto market metrics).

#### Risk
- CFTC regulates event contracts in the U.S. Leveraged event contracts would attract immediate scrutiny.
- Manipulation incentives are real and serious.
- Convergence to settlement is a mechanism design challenge — wrong probability near resolution → liquidation cascades.

---

### 6. State-Optimized Mega-Slab

#### Business
- Market: Infrastructure play. Every perp DEX on Solana faces scaling constraints — account size limits, rent costs, state bloat. Solving this creates a platform, not a product.
- Revenue model: License the optimized slab to other Percolator-based projects, or use as foundation for own exchange with dramatically lower operational costs.
- TAM: Every Solana DeFi protocol managing large state.
- Go-to-market: Publish as open source (matching Percolator's Apache 2.0 ethos). Build reputation.

#### Technical
- Feasibility: **High.** Stratum already has working primitives — bitfields, merkle commitments, expiry/cleanup, event emission. Integrating with Percolator's slab is well-defined engineering.
- Key challenge: Percolator stores everything in a single account. Stratum's merkle commitments move historical data off-chain with on-chain verification roots. Requires changes to position verification during trading.
- Code reuse: ~70%. Stratum primitives + Percolator slab structure.
- Time to MVP: 4-6 weeks.

#### Innovation
- Novelty: **Medium.** State optimization is well-understood academically. Innovation is in specific application to perp slab architecture.
- Defensibility: Low as standalone. Anyone can read and reimplement.
- Infrastructure value: High. Makes everything else cheaper and faster.

#### Philosophical
- Scaling is the least romantic but most impactful work. Without it, all other ideas hit ceilings. The "boring infrastructure" play that makes everything else possible.
- Zen quality: **doing less on-chain to enable more.** Merkle commitments are a trust architecture — trusting math instead of storing everything.

#### Risk
- Low standalone risk, but also low standalone reward. Only matters if paired with a product.

---

## Synthesis Matrix

| Dimension | Privacy Perps | Reputation Leverage | Vol Perps | JPY Perps | Event Perps | Mega-Slab |
|---|---|---|---|---|---|---|
| **Time to MVP** | 6-8 wk | 3-4 wk | 8-12 wk | 4-6 wk (tech) | 8-10 wk | 4-6 wk |
| **Code Reuse** | ~60% | ~80% | ~50% | ~70% | ~40% | ~70% |
| **Market Size** | Huge | Huge | Large (niche) | Huge (Japan) | Large | N/A (infra) |
| **Competition** | None (true) | None | None | None (on-chain) | None | Low |
| **Regulatory Risk** | Medium | Low | Low | High | High | None |
| **Technical Risk** | Medium | Low | High | Low | High | Low |
| **Innovation Score** | 9/10 | 7/10 | 10/10 | 6/10 | 9/10 | 4/10 |
| **Revenue Speed** | Medium | Fast | Slow | Slow | Medium | N/A |
| **Defensibility** | High | Medium | Very High | Very High (reg) | Medium | Low |
| **Philosophical Depth** | High | High | Very High | High | Very High | Medium |

---

## Recommended Sequencing

1. **Reputation Leverage first** — fastest to ship, makes everything else better, Sovereign becomes the identity primitive for the entire ecosystem
2. **Privacy Perps second** — reputation-gates who enters the dark pool (natural combo), first-in-world product
3. **Vol Perps or JPY Perps third** — depends on whether to go deep-innovation (vol) or deep-business (JPY)
4. **Mega-Slab in parallel** throughout — it's the enabler
5. **Event Perps later** — needs the most mechanism design research, highest regulatory risk

---

## The Meta-Play

The really cutting-edge move is **combining multiple of these**. For example: a privacy-preserving, reputation-gated JPY perp market with volatility-based dynamic margins — that's Veil + Sovereign + Meridian + Sigma + Percolator, all of which have existing code.

Since Anatoly specifically designed percolator-prog so that Claude can one-shot a new market type, the workflow is:

1. Pick a direction
2. Feed Claude: percolator-prog + relevant existing repo code as context
3. Claude builds the custom matching program
4. Test on devnet
5. Iterate

---

## Market Context (as of Feb 2026)

### Solana Perps Landscape
- Jupiter Perps: $17.4B/month, market leader
- Drift: $24B+ cumulative, 180K+ users
- Hyperliquid (competitor chain): $2.41B TVL, $58B+/week — the target to beat
- Gap: No dominant CLOB perp DEX on Solana. This is what Percolator targets.

### Dark Pools
- HumidiFi: ~$100B cumulative in 5 months on Solana, but "marketing-dark" not crypto-dark
- Renegade: True MPC/ZK privacy but Arbitrum-only and spot-only
- Gap: **No dark pool for perps with true cryptographic privacy anywhere**

### On-Chain Credit Scoring
- Spectral (MACRO Score), Credora (institutional ratings), RociFi exist for lending
- Gap: **No perp DEX adjusts leverage based on on-chain reputation**

### Volatility Derivatives
- Volmex provides indices, Squeeth (ETH²) declining, Deribit DVOL off-chain only
- Gap: **No on-chain vol perps, variance swaps, or vol surface anywhere**

### JPY Stablecoins
- JPYC launched Oct 2025 (Ethereum), Big 3 banks joint stablecoin coming 2026
- Gap: **No JPY-denominated perp market on-chain**

### Prediction Market Perps
- Polymarket $33B+ in 2025, Kalshi $43B, all spot/binary
- Gap: **No leveraged perpetual exposure to event probabilities**

---

*This document is a living analysis. Update as Percolator evolves and matching programs are built.*
