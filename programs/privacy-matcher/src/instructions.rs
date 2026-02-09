use shank::ShankInstruction;

#[derive(ShankInstruction)]
#[allow(dead_code)]
pub enum PrivacyMatcherInstruction {
    /// Execute match - compute execution price from solver-verified trade
    #[account(0, signer, name = "lp_pda", desc = "LP PDA (must be signer)")]
    #[account(1, writable, name = "matcher_context", desc = "Matcher context account (320 bytes)")]
    Match,

    /// Initialize privacy matcher context
    #[account(0, name = "lp_pda", desc = "LP PDA to store")]
    #[account(1, writable, name = "matcher_context", desc = "Matcher context account (320 bytes, writable)")]
    #[account(2, name = "solver", desc = "Authorized solver wallet")]
    Init,

    /// Update oracle price (solver-only)
    #[account(0, signer, name = "solver", desc = "Authorized solver (must be signer)")]
    #[account(1, writable, name = "matcher_context", desc = "Matcher context account")]
    OracleUpdate,
}
