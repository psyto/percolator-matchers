use shank::ShankInstruction;

#[derive(ShankInstruction)]
#[allow(dead_code)]
pub enum MacroMatcherInstruction {
    /// Execute match — compute regime-adjusted execution price for real rate perp
    #[account(0, signer, name = "lp_pda", desc = "LP PDA (must be signer)")]
    #[account(1, writable, name = "matcher_context", desc = "Matcher context account (320 bytes)")]
    Match,

    /// Initialize macro matcher context
    #[account(0, name = "lp_pda", desc = "LP PDA to store")]
    #[account(1, writable, name = "matcher_context", desc = "Matcher context account (320 bytes, writable)")]
    Init,

    /// Sync index — keeper updates real rate index and signal intelligence
    #[account(0, writable, name = "matcher_context", desc = "Matcher context account")]
    #[account(1, name = "macro_oracle", desc = "Authorized macro oracle account")]
    IndexSync,

    /// Update regime — change macro regime (requires oracle signer)
    #[account(0, writable, name = "matcher_context", desc = "Matcher context account")]
    #[account(1, signer, name = "macro_oracle", desc = "Authorized macro oracle account (must be signer)")]
    RegimeUpdate,
}
