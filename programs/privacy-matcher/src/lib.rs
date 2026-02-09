use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, msg,
    program_error::ProgramError, pubkey::Pubkey,
};

mod errors;
mod instructions;
mod match_engine;
mod state;

use match_engine::{process_init, process_match, process_oracle_update};

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
            msg!("PRIVACY-MATCHER: Match instruction");
            process_match(program_id, accounts, instruction_data)
        }
        0x02 => {
            msg!("PRIVACY-MATCHER: Init instruction");
            process_init(program_id, accounts, instruction_data)
        }
        0x03 => {
            msg!("PRIVACY-MATCHER: Oracle update instruction");
            process_oracle_update(program_id, accounts, instruction_data)
        }
        _ => {
            msg!("PRIVACY-MATCHER: Unknown instruction tag {}", instruction_data[0]);
            Err(ProgramError::InvalidInstructionData)
        }
    }
}
