use solana_program::program_error::ProgramError;

#[derive(Debug, Clone, Copy)]
pub enum MacroMatcherError {
    IndexNotSynced = 0x300,
    OracleStale = 0x301,
    OracleMismatch = 0x302,
    InvalidRegime = 0x303,
    InvalidSignalSeverity = 0x304,
    ArithmeticOverflow = 0x305,
    InvalidIndexValue = 0x306,
}

impl From<MacroMatcherError> for ProgramError {
    fn from(e: MacroMatcherError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
