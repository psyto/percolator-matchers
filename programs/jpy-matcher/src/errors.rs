use solana_program::program_error::ProgramError;

#[derive(Debug, Clone, Copy)]
pub enum JpyMatcherError {
    InsufficientKycLevel = 0x100,
    KycExpired = 0x101,
    JurisdictionBlocked = 0x102,
    JurisdictionMismatch = 0x103,
    DailyVolumeLimitExceeded = 0x104,
    OraclePriceNotSet = 0x105,
    ArithmeticOverflow = 0x106,
    InvalidComplianceData = 0x107,
}

impl From<JpyMatcherError> for ProgramError {
    fn from(e: JpyMatcherError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
