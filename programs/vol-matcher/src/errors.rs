use solana_program::program_error::ProgramError;

#[derive(Debug, Clone, Copy)]
pub enum VolMatcherError {
    OracleNotSynced = 0x20,
    OracleStale = 0x21,
    OracleAccountMismatch = 0x22,
    InvalidRegime = 0x23,
    ArithmeticOverflow = 0x24,
}

impl From<VolMatcherError> for ProgramError {
    fn from(e: VolMatcherError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
