use solana_program::program_error::ProgramError;

#[derive(Debug, Clone, Copy)]
pub enum PrivacyMatcherError {
    InvalidSpreadConfig = 0x10,
    UnauthorizedSolver = 0x11,
    OraclePriceNotSet = 0x12,
    ArithmeticOverflow = 0x13,
}

impl From<PrivacyMatcherError> for ProgramError {
    fn from(e: PrivacyMatcherError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
