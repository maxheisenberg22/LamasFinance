use anchor_lang::prelude::*;
use chainlink_solana as chainlink;

declare_id!("JC5q9ywJmhvGiBTSG2hmfqeu4Ucp3f9hHtC1CNVZfSkm");

#[program]
pub mod up_or_down {
    use super::*;
    pub fn execute(ctx: Context<Execute>) -> Result<()> {
        let round = chainlink::latest_round_data(
            ctx.accounts.chainlink_program.to_account_info(),
            ctx.accounts.chainlink_feed.to_account_info(),
        )?;

        let description = chainlink::description(
            ctx.accounts.chainlink_program.to_account_info(),
            ctx.accounts.chainlink_feed.to_account_info(),
        )?;

        let decimals = chainlink::decimals(
            ctx.accounts.chainlink_program.to_account_info(),
            ctx.accounts.chainlink_feed.to_account_info(),
        )?;

        let decimal = Decimal::new(round.answer, u32::from(decimals));
        msg!("{} price is {}", description, decimal);
        *ctx.accounts.decimal = decimal;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Execute<'info> {
    #[account(init, payer = user, space = 28)]
    pub decimal: Account<'info, Decimal>,
    #[account(mut)]
    pub user: Signer<'info>,

    pub chainlink_feed: AccountInfo<'info>,
    pub chainlink_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Decimal {
    pub value: i128,
    pub decimals: u32,
}

impl Decimal {
    pub fn new(value: i128, decimals: u32) -> Self {
        Decimal { value, decimals }
    }
}

impl std::fmt::Display for Decimal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut scaled_val = self.value.to_string();
        if scaled_val.len() <= self.decimals as usize {
            scaled_val.insert_str(
                0,
                &vec!["0"; self.decimals as usize - scaled_val.len()].join(""),
            );
            scaled_val.insert_str(0, "0.");
        } else {
            scaled_val.insert(scaled_val.len() - self.decimals as usize, '.');
        }
        f.write_str(&scaled_val)
    }
}
