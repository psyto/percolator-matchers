use shank::ShankInstruction;

#[derive(ShankInstruction)]
#[allow(dead_code)]
pub enum VolMatcherInstruction {
    /// Execute match - compute vol-adjusted execution price
    #[account(0, signer, name = "lp_pda", desc = "LP PDA (must be signer)")]
    #[account(1, writable, name = "matcher_context", desc = "Matcher context account (320 bytes)")]
    Match,

    /// Initialize vol matcher context
    #[account(0, name = "lp_pda", desc = "LP PDA to store")]
    #[account(1, writable, name = "matcher_context", desc = "Matcher context account (320 bytes, writable)")]
    Init,

    /// Sync oracle - keeper updates vol data from Sigma oracle
    #[account(0, writable, name = "matcher_context", desc = "Matcher context account")]
    #[account(1, name = "variance_tracker", desc = "Sigma VarianceTracker account")]
    #[account(2, name = "vol_index", desc = "Sigma VolatilityIndex account")]
    OracleSync,
}
