use shank::ShankInstruction;

#[derive(ShankInstruction)]
#[allow(dead_code)]
pub enum JpyMatcherInstruction {
    /// Execute match with KYC/compliance verification
    #[account(0, signer, name = "lp_pda", desc = "LP PDA (must be signer)")]
    #[account(1, writable, name = "matcher_context", desc = "Matcher context account (320 bytes)")]
    #[account(2, optional, name = "user_whitelist", desc = "User WhitelistEntry PDA")]
    #[account(3, optional, name = "lp_whitelist", desc = "LP owner WhitelistEntry PDA")]
    Match,

    /// Initialize JPY matcher context
    #[account(0, name = "lp_pda", desc = "LP PDA to store")]
    #[account(1, writable, name = "matcher_context", desc = "Matcher context account (320 bytes, writable)")]
    Init,

    /// Update oracle price
    #[account(0, signer, name = "authority", desc = "Oracle update authority")]
    #[account(1, writable, name = "matcher_context", desc = "Matcher context account")]
    OracleUpdate,
}
