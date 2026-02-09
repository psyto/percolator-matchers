use solana_program::program_error::ProgramError;

#[derive(Debug, Clone, Copy)]
pub enum EventMatcherError {
    MarketResolved = 0x200,
    InvalidProbability = 0x201,
    ProbabilityNotSet = 0x202,
    OracleStale = 0x203,
    OracleMismatch = 0x204,
    InvalidOutcome = 0x205,
    InvalidSignalSeverity = 0x206,
    ArithmeticOverflow = 0x207,
}

impl From<EventMatcherError> for ProgramError {
    fn from(e: EventMatcherError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
