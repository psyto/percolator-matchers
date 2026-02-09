use shank::ShankInstruction;

#[derive(ShankInstruction)]
#[allow(dead_code)]
pub enum EventMatcherInstruction {
    /// Execute match - probability-based pricing with edge spread
    #[account(0, signer, name = "lp_pda", desc = "LP PDA (must be signer)")]
    #[account(1, writable, name = "matcher_context", desc = "Matcher context account (320 bytes)")]
    Match,

    /// Initialize event matcher context
    #[account(0, name = "lp_pda", desc = "LP PDA to store")]
    #[account(1, writable, name = "matcher_context", desc = "Matcher context account (320 bytes, writable)")]
    Init,

    /// Sync probability from oracle
    #[account(0, writable, name = "matcher_context", desc = "Matcher context account")]
    #[account(1, name = "event_oracle", desc = "Event oracle account")]
    ProbabilitySync,

    /// Resolve event - set final probability
    #[account(0, writable, name = "matcher_context", desc = "Matcher context account")]
    #[account(1, signer, name = "event_oracle", desc = "Event oracle (must be signer)")]
    Resolve,
}
