use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, msg,
    program_error::ProgramError, pubkey::Pubkey,
};

mod errors;
mod instructions;
mod state;
mod vol_pricing;

use vol_pricing::{process_init, process_match, process_oracle_sync};

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
            msg!("VOL-MATCHER: Match instruction");
            process_match(program_id, accounts, instruction_data)
        }
        0x02 => {
            msg!("VOL-MATCHER: Init instruction");
            process_init(program_id, accounts, instruction_data)
        }
        0x03 => {
            msg!("VOL-MATCHER: Oracle sync instruction");
            process_oracle_sync(program_id, accounts, instruction_data)
        }
        _ => {
            msg!("VOL-MATCHER: Unknown instruction tag {}", instruction_data[0]);
            Err(ProgramError::InvalidInstructionData)
        }
    }
}
