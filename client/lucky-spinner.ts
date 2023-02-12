import { Program, BN } from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { bs58 } from '@project-serum/anchor/dist/cjs/utils/bytes';
import { LuckySpinner, IDL } from '../idl/lucky_spinner';
import { OWNER, provider } from './provider'

const POOL_OWNER_PDA_SEED = 'lamas_finance';
const PROGRAM_STATE_PDA_SEED = 'lamas_program_state';
const PROGRAM_ID = 'DEoxdV1CCWvbeGp8PpwkUifmm3pV5AgtFwFaS4P7qZeZ';
const DECIMAL = 1000000;

const CONFIG = {
	TAX_PERCENTAGE: 0.01 * DECIMAL,
	BURN_PERCENTAGE: 0.5 * DECIMAL,
	MIN_BET_AMOUNT: 1 * LAMPORTS_PER_SOL,
	// User
	USER: Keypair.fromSecretKey(
		new Uint8Array([
			110, 128, 57, 164, 181, 133, 232, 44, 46, 235, 125, 109, 243, 64, 183, 72, 149, 34, 172, 38, 117, 157, 28,
			204, 68, 174, 52, 224, 169, 60, 128, 144, 61, 106, 10, 143, 74, 13, 105, 232, 66, 196, 2, 178, 232, 158,
			184, 66, 83, 195, 27, 17, 182, 180, 255, 136, 217, 112, 95, 160, 181, 201, 115, 198,
		])
	),
	USER_TOKEN: 'FFVcqDZ9AQHwabV9ope7Jq3EaoPcZXJgsJLJWUUNTrk6',
	// Token
	MINT: '9a7TwLHkA2AaJd9E7qsdhaTPhQL5wQ9VXYo7J2pXHixV',
	POOL: '8i1eYwbYZyxJ7TjEnhzF6iAYaSxn5j3oWcoUeHnwoGvm',
	TREASURY: '3gBfaqxVBh5ZYKv3RE544JZMq3yTogR1jZsRyYguWHMQ',
};

const program = new Program(IDL, PROGRAM_ID) as Program<LuckySpinner>;

const PDA_AUTHORITY = PublicKey.findProgramAddressSync([Buffer.from(POOL_OWNER_PDA_SEED, 'utf-8')], program.programId)[0];
const PROGRAM_STATE = PublicKey.findProgramAddressSync([Buffer.from(PROGRAM_STATE_PDA_SEED, 'utf-8')], program.programId)[0];

async function init() {
	console.log('Executing init()...');

	const tx = await program.methods
		.init(
			new BN(CONFIG.TAX_PERCENTAGE),
			new BN(CONFIG.BURN_PERCENTAGE),
			new BN(CONFIG.MIN_BET_AMOUNT),
			[
				[new BN(15), new BN(35 * DECIMAL)],
				[new BN(40), new BN(20 * DECIMAL)],
				[new BN(100), new BN(7 * DECIMAL)],
				[new BN(220), new BN(5 * DECIMAL)],
				[new BN(440), new BN(3 * DECIMAL)],
				[new BN(600), new BN(2 * DECIMAL)],
				[new BN(2485), new BN(1 * DECIMAL)],
				[new BN(3000), new BN(0.5 * DECIMAL)],
				[new BN(3000), new BN(0 * DECIMAL)],
			]
		)
		.accounts({
			owner: OWNER.publicKey,
			programState: PROGRAM_STATE,
			mint: CONFIG.MINT,
			pool: CONFIG.POOL,
			treasury: CONFIG.TREASURY,
			tokenProgram: TOKEN_PROGRAM_ID,
		})
		.signers([ OWNER ])
		.rpc({ commitment: 'confirmed' });

	console.log('Fetching transaction logs...');
	const trans = await provider.connection.getTransaction(tx, {
		commitment: 'confirmed',
	});

	console.log(trans?.meta?.logMessages);
}

async function spin() {
	const [vrfLock] = await PublicKey.findProgramAddress([Buffer.from('vrf-lock', 'utf-8'), CONFIG.USER.publicKey.toBuffer()], program.programId);

	console.log('Executing spin()...');
	const tx = await program.methods
		.spin(
			new BN(2 * LAMPORTS_PER_SOL),
		)
		.accounts({
			user: CONFIG.USER.publicKey,
			userToken: CONFIG.USER_TOKEN,
			programState: PROGRAM_STATE,
			mint: CONFIG.MINT,
			pool: CONFIG.POOL,
			treasury: CONFIG.TREASURY,
			tokenProgram: TOKEN_PROGRAM_ID,
			pdaAuthority: PDA_AUTHORITY,
			vrfLock,
		})
		.signers([CONFIG.USER])
		.rpc({ commitment: 'confirmed' });


	const bnTrans = new BN(bs58.decode(tx));
	const cancel = program.addEventListener('SpinResult', (event) =>{
		console.log(event);
		const eventTrans = new BN(event.requestTrans);

		console.log('eventTrans', eventTrans);
		if (bnTrans.eq(eventTrans)) {
			console.log('Got result');
			program.removeEventListener(cancel);
		}
	});

	console.log('Fetching transaction logs...');
	const trans = await provider.connection.getTransaction(tx, {
		commitment: 'confirmed',
	});

	const logs = trans?.meta?.logMessages;
	if (!logs)
	{
		console.log('Trans has no log', tx, trans);
		return;
	}

	console.log(logs);
}

if (require.main === module) {
	switch (process.argv[2]) {
		case 'init': {
			init();
			break;
		}
		case 'spin': {
			spin();
			break;
		}
	}
}
