use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, msg,
    program_error::ProgramError, pubkey::Pubkey,
};

mod errors;
mod instructions;
mod state;
mod pricing;

use pricing::{process_init, process_match, process_index_sync, process_regime_update};

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
            msg!("MACRO-MATCHER: Match instruction");
            process_match(program_id, accounts, instruction_data)
        }
        0x02 => {
            msg!("MACRO-MATCHER: Init instruction");
            process_init(program_id, accounts, instruction_data)
        }
        0x03 => {
            msg!("MACRO-MATCHER: Index sync instruction");
            process_index_sync(program_id, accounts, instruction_data)
        }
        0x04 => {
            msg!("MACRO-MATCHER: Regime update instruction");
            process_regime_update(program_id, accounts, instruction_data)
        }
        _ => {
            msg!("MACRO-MATCHER: Unknown instruction tag {}", instruction_data[0]);
            Err(ProgramError::InvalidInstructionData)
        }
    }
}
