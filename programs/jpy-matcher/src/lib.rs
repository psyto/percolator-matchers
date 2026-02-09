use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, msg,
    program_error::ProgramError, pubkey::Pubkey,
};

mod compliance;
mod errors;
mod instructions;
mod pricing;
mod state;

use compliance::process_match_with_compliance;
use pricing::process_init;

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    if instruction_data.is_empty() {
        return Err(ProgramError::InvalidInstructionData);
    }

    match instruction_data[0] {
        0x00 => {
            msg!("JPY-MATCHER: Match instruction");
            process_match_with_compliance(program_id, accounts, instruction_data)
        }
        0x02 => {
            msg!("JPY-MATCHER: Init instruction");
            process_init(program_id, accounts, instruction_data)
        }
        0x03 => {
            msg!("JPY-MATCHER: Oracle update instruction");
            pricing::process_oracle_update(program_id, accounts, instruction_data)
        }
        _ => {
            msg!("JPY-MATCHER: Unknown instruction tag {}", instruction_data[0]);
            Err(ProgramError::InvalidInstructionData)
        }
    }
}
