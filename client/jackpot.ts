import { Program, BN, AccountClient } from '@project-serum/anchor';
import { Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createAccount as createTokenAccount } from '@solana/spl-token';
import { OWNER, provider, USER, USER_TOKEN } from './provider';
import { JackpotLottery, IDL } from '../idl/jackpot_lottery';

const AUTHORITY_SEED = 'lamas_finance';
const PROGRAM_ID = 'Bw2HwtYcTro3nzYt2XFqKA3iu4worp5qkgmrNXVZYEAE';

const CONFIG = {
	TICKET_PRICE: 5 * LAMPORTS_PER_SOL,
	TAX_PERCENTAGE: 2,
	BURN_PERCENTAGE: 50,
	LOTTERY_TICKET_MAX_NUM: 36,
	LOTTERY_TICKET_LEN: 4,
	REWARD_DISTRIBUTION_PERCENTAGE: [0, 0, 10, 20, 50, 0, 0],
	// Keys
	JACKPOT_LOTTERY_PROGRAM_STATE: '3moyZ7gYAojuk6jNivETvBbJWu7wPeZDT1R6yAGLEMAT',
	// Token
	MINT: '9a7TwLHkA2AaJd9E7qsdhaTPhQL5wQ9VXYo7J2pXHixV',
	POOL: 'FpSbppXSC3CDN6VTyL6BEVxbps8ffRHNRx2XtefeWcgY',
	TREASURY: '3gBfaqxVBh5ZYKv3RE544JZMq3yTogR1jZsRyYguWHMQ',
};

const program = new Program(IDL, PROGRAM_ID) as Program<JackpotLottery>;

const PDA_AUTHORITY = PublicKey.findProgramAddressSync([Buffer.from(AUTHORITY_SEED, 'utf-8')], program.programId)[0];

const MEM_ALIGN = 8;
function createAccountInstruction(account: AccountClient, signer: Keypair) {
	const size = Math.ceil(account.size / MEM_ALIGN) * MEM_ALIGN;
	return account.createInstruction(signer, size);
}

async function init() {
	const state = Keypair.generate();
	console.log('======================== ATTENTION ========================');
	console.log('GameState account, please update config.ts with this key:');
	console.log(state.publicKey.toBase58());
	console.log('======================== ATTENTION ========================');

	console.log('Executing...');
	const tx = await program.methods
		.init()
		.accounts({
			owner: OWNER.publicKey,
			state: state.publicKey,
			mint: CONFIG.MINT,
			pool: CONFIG.POOL,
			treasury: CONFIG.TREASURY,
			tokenProgram: TOKEN_PROGRAM_ID,
		})
		.preInstructions([await createAccountInstruction(program.account.lotteryState, state)])
		.signers([OWNER, state])
		.rpc({ commitment: 'confirmed' });

	console.log('Fetching transaction logs...');
	const trans = await provider.connection.getTransaction(tx, {
		commitment: 'confirmed',
	});

	console.log(trans?.meta?.logMessages);
}

async function next() {
	const nextRoundResult = Keypair.generate();
	console.log(
		`Starting a new round with ${CONFIG.TAX_PERCENTAGE}% tax and will burn ${CONFIG.BURN_PERCENTAGE}% of the collected tax\n` +
		`Lottery: len=${CONFIG.LOTTERY_TICKET_LEN}, num=1-${CONFIG.LOTTERY_TICKET_MAX_NUM}\n` +
		`Ticket price: ${CONFIG.TICKET_PRICE}`
	);
	console.log('Round result:', nextRoundResult.publicKey.toBase58());

	console.log('Creating a ResultPool token account...');
	const nextRoundPool = await createTokenAccount(
		provider.connection,
		OWNER,
		new PublicKey(CONFIG.MINT),
		OWNER.publicKey,
		Keypair.generate()
	);

	console.log('Executing...');
	const tx = await program.methods
		.nextRound(
			CONFIG.TAX_PERCENTAGE,
			CONFIG.BURN_PERCENTAGE,
			new BN(CONFIG.TICKET_PRICE),
			CONFIG.LOTTERY_TICKET_MAX_NUM,
			CONFIG.LOTTERY_TICKET_LEN,
			CONFIG.REWARD_DISTRIBUTION_PERCENTAGE
		)
		.accounts({
			owner: OWNER.publicKey,
			state: CONFIG.JACKPOT_LOTTERY_PROGRAM_STATE,
			nextRoundResult: nextRoundResult.publicKey,
			nextRoundPool: nextRoundPool,
			tokenProgram: TOKEN_PROGRAM_ID,
		})
		.preInstructions([await createAccountInstruction(program.account.lotteryRoundResult, nextRoundResult)])
		.signers([OWNER, nextRoundResult])
		.rpc({ commitment: 'confirmed' });

	console.log('Fetching transaction logs...');
	const trans = await provider.connection.getTransaction(tx, {
		commitment: 'confirmed',
	});

	console.log(trans?.meta?.logMessages);
}

const TICKET_NUM = new Array(CONFIG.LOTTERY_TICKET_MAX_NUM).fill(0).map((_, i) => i + 1);
function genTicket() {
	const out: number[] = [];
	let idx = 0;
	for (let i = 0; i < CONFIG.LOTTERY_TICKET_LEN; i++) {
		idx += Math.round((Math.random() * TICKET_NUM.length) / (CONFIG.LOTTERY_TICKET_LEN + 1)) + 1;
		out.push(TICKET_NUM[idx]);
	}

	while (out.length < 6) {
		out.push(0);
	}

	return out;
}

async function buy() {
	console.log('Fetching latest round...');
	const state = await program.account.lotteryState.fetch(CONFIG.JACKPOT_LOTTERY_PROGRAM_STATE, 'confirmed');
	console.log('Current round:', state.roundResult.toBase58());

	const tickets = new Array(3).fill(0).map((_) => genTicket());
	console.log('Buying tickets:', tickets);

	const ticketAccounts = tickets.map((_) => Keypair.generate());

	console.log('Executing...');
	const tx = await program.methods
		.buyTicket(tickets)
		.accounts({
			user: USER.publicKey,
			userToken: USER_TOKEN,
			state: CONFIG.JACKPOT_LOTTERY_PROGRAM_STATE,
			pool: CONFIG.POOL,
			roundResult: state.roundResult,
			tokenProgram: TOKEN_PROGRAM_ID,
		})
		.remainingAccounts(
			ticketAccounts.map((keypair) => ({
				pubkey: keypair.publicKey,
				isWritable: true,
				isSigner: false,
			}))
		)
		.preInstructions(
			await Promise.all(
				ticketAccounts.map((keypair) => createAccountInstruction(program.account.lotteryTicket, keypair))
			)
		)
		.signers([USER, ...ticketAccounts])
		.rpc({ commitment: 'confirmed' });

	console.log('Fetching transaction logs...');
	const trans = await provider.connection.getTransaction(tx, {
		commitment: 'confirmed',
	});

	console.log(trans?.meta?.logMessages);
}

async function claim() {
	console.log('Fetching current user tickets...');
	const tickets = await program.account.lotteryTicket.all([
		{
			memcmp: {
				offset: 8,
				bytes: USER.publicKey.toBase58(),
			},
		},
	]);

	console.log(`User has bought ${tickets.length} ticket(s)`);
	if (tickets.length === 0) return;

	const mapRoundResultPool = new Map();
	for (const ticket of tickets) {
		console.log(`> Claiming ticket ${ticket.account.lotteryNumber}:`, ticket.publicKey.toBase58());

		let roundResult = mapRoundResultPool.get(ticket.account.roundResult.toBase58());
		if (roundResult == null) {
			console.log('Fetching round result...');
			roundResult = await program.account.lotteryRoundResult.fetch(ticket.account.roundResult, 'confirmed');

			if (roundResult == null) {
				console.log('Cannot found round result', ticket.account.roundResult.toBase58());
				continue;
			}

			mapRoundResultPool.set(ticket.account.roundResult.toBase58(), roundResult);
		}

		console.log('Executing...');
		try {
			const tx = await program.methods
				.claimReward()
				.accounts({
					user: USER.publicKey,
					userToken: USER_TOKEN,
					state: CONFIG.JACKPOT_LOTTERY_PROGRAM_STATE,
					mint: CONFIG.MINT,
					roundResult: ticket.account.roundResult,
					resultPool: roundResult.pool,
					treasury: CONFIG.TREASURY,
					pdaAuthority: PDA_AUTHORITY,
					lotteryTicket: ticket.publicKey,
					tokenProgram: TOKEN_PROGRAM_ID,
				})
				.signers([USER])
				.rpc({ commitment: 'confirmed' });

			console.log('Fetching transaction logs...');
			const trans = await provider.connection.getTransaction(tx, {
				commitment: 'confirmed',
			});
			console.log(trans?.meta?.logMessages);
		} catch (err) {
			console.log(err);
		}
	}
}

async function rollLottery() {
	console.log('Fetching latest round...');
	const state = await program.account.lotteryState.fetch(CONFIG.JACKPOT_LOTTERY_PROGRAM_STATE, 'confirmed');
	console.log('Current round:', state.roundResult.toBase58());

	const [vrfLock, bump] = await PublicKey.findProgramAddress([Buffer.from('vrf-lock', 'utf-8'), state.roundResult.toBuffer()], program.programId);

	console.log('Executing...');
	const tx = await program.methods
		.rollLottery()
		.accounts({
			owner: OWNER.publicKey,
			state: CONFIG.JACKPOT_LOTTERY_PROGRAM_STATE,
			roundResult: state.roundResult,
			vrfLock,
			systemProgram: SystemProgram.programId,
		})
		.signers([OWNER])
		.rpc({ commitment: 'confirmed' });

	console.log('Fetching transaction logs...');
	const trans = await provider.connection.getTransaction(tx, {
		commitment: 'confirmed',
	});
	console.log(trans?.meta?.logMessages);
}

async function finalizeRound() {
	function countMatching(a: number[], b: number[]): number {
		let i = 0;
		let j = 0;
		let count = 0;

		while (i < a.length && j < b.length) {
			if (a[i] == b[j]) {
				count++;
				i++;
				j++;
			} else if (a[i] > b[j]) {
				j++;
			} else {
				i++;
			}
		}

		return count;
	}

	console.log('Fetching latest round...');
	const state = await program.account.lotteryState.fetch(CONFIG.JACKPOT_LOTTERY_PROGRAM_STATE, 'confirmed');
	console.log('Current round:', state.roundResult.toBase58());

	console.log('Fetching round result...');
	const round = await program.account.lotteryRoundResult.fetch(state.roundResult, 'confirmed');
	console.log('Lottery result: ', round.lotteryResult);

	console.log('Fetching all ticket of current round...');
	const tickets = await program.account.lotteryTicket.all([
		{
			memcmp: {
				offset: 8 /* discriminate bytes */ + 32 /* owner pubKey */,
				bytes: state.roundResult.toBase58(),
			},
		},
	]);

	const numWinningTicket = new Array(7).fill(0);
	for (let i = 0; i < tickets.length; i++) {
		const ticket = tickets[i].account;
		const numMatch = countMatching(
			ticket.lotteryNumber.slice(0, round.lotteryLen),
			round.lotteryResult.slice(0, round.lotteryLen)
		);
		numWinningTicket[numMatch]++;
	}

	console.log('Num winning tickets', numWinningTicket);

	console.log('Executing...');
	const tx = await program.methods
		.finalizeRound(numWinningTicket.map((v) => new BN(v)))
		.accounts({
			owner: OWNER.publicKey,
			state: CONFIG.JACKPOT_LOTTERY_PROGRAM_STATE,
			pool: CONFIG.POOL,
			roundResult: state.roundResult,
			roundResultPool: round.pool,
			pdaAuthority: PDA_AUTHORITY,
			tokenProgram: TOKEN_PROGRAM_ID,
		})
		.signers([OWNER])
		.rpc({ commitment: 'confirmed' });

	console.log('Fetching transaction logs...');
	const trans = await provider.connection.getTransaction(tx, {
		commitment: 'confirmed',
	});

	console.log(trans?.meta?.logMessages);
}


if (require.main === module) {
	switch (process.argv[2]) {
		case 'init': {
			init();
			break;
		}
		case 'next': {
			next();
			break;
		}
		case 'buy': {
			buy();
			break;
		}
		case 'claim': {
			claim();
			break;
		}
		case 'roll': {
			rollLottery();
			break;
		}
		case 'finalize': {
			finalizeRound();
			break;
		}
	}
}
