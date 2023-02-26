import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Program, BN } from '@project-serum/anchor';
import { OWNER, provider, USER, USER_TOKEN } from './provider';
import { UpOrDown, IDL } from '../idl/up_or_down';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const AUTHORITY_SEED = 'lamas_finance';
const PROGRAM_STATE_PDA_SEED = 'state';
const ROUND_PDA_SEED = 'round';

const PROGRAM_ID = 'BbCEshx6obrBjzWPXBRxq99GcFVPB8ioe48pUYr711zy';

const STAGE = {
	WAIT_START_ROUND: 0,
	PREDICTION: 1,
	LIVE: 2,
	ENDED: 3,
	CANCELED: 4,
};

const CONFIG = {
	MIN_BET_AMOUNT: 5 * LAMPORTS_PER_SOL,
	TAX_PERCENTAGE: 2,
	BURN_PERCENTAGE: 50,
	// Keys
	CHAINLINK_FEED: 'HgTtcbcmp5BeThax5AU8vg4VwK79qAvAKKFMs8txMLW6',
	CHAINLINK_PROGRAM: 'HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny',
	// Token
	MINT: '9a7TwLHkA2AaJd9E7qsdhaTPhQL5wQ9VXYo7J2pXHixV',
	TREASURY: '3gBfaqxVBh5ZYKv3RE544JZMq3yTogR1jZsRyYguWHMQ',
};

const program = new Program(IDL, PROGRAM_ID) as Program<UpOrDown>;

const PDA_AUTHORITY = PublicKey.findProgramAddressSync([Buffer.from(AUTHORITY_SEED, 'utf-8')], program.programId)[0];

const PROGRAM_STATE = PublicKey.findProgramAddressSync([Buffer.from(PROGRAM_STATE_PDA_SEED, 'utf-8')], program.programId)[0];

const getRoundResult = (round: number | BN) =>
	PublicKey.findProgramAddressSync(
		[Buffer.from(ROUND_PDA_SEED, 'utf-8'), new BN(round).toBuffer('be', 8)],
		program.programId
	)[0];

async function init() {
	const tx = await program.methods
		.init()
		.accounts({
			owner: OWNER.publicKey,
			programState: PROGRAM_STATE,
			mint: CONFIG.MINT,
			treasury: CONFIG.TREASURY,
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

async function predict() {
	console.log('Fetching ProgramState...');
	const state = await program.account.programState.fetch(PROGRAM_STATE);
	const numRound = state.roundCounter.toNumber();

	console.log('Searching for playable round...');
	let roundIdx = -1;
	let roundPubkey;
	let roundResult;
	for (roundIdx = numRound - 5; roundIdx <= numRound; roundIdx++) {
		if (roundIdx < 0)
			continue;

		try {
			roundPubkey = await getRoundResult(roundIdx);
			roundResult = await program.account.roundResult.fetch(roundPubkey);
			if (roundResult.stage === STAGE.PREDICTION) {
				break;
			}
		} catch (ex) {
			// Most likely account not found, ignore
		}
	}

	if (roundIdx < 0) {
		console.log('No round found');
		return;
	}

	const isUp = Math.round(Math.random()) % 2 == 0;
	console.log(`Predicting the price will go ${isUp ? 'UP' : 'DOWN'} for round ${roundIdx}`);

	const predict = Keypair.generate();
	console.log('Storing prediction in:', predict.publicKey.toBase58());

	console.log('Executing...');
	const tx = await program.methods
		.predict(isUp, new BN(5 * LAMPORTS_PER_SOL))
		.accounts({
			user: USER.publicKey,
			userToken: USER_TOKEN,
			programState: PROGRAM_STATE,
			round: roundPubkey,
			pool: roundResult.pool,
			prediction: predict.publicKey,
			tokenProgram: TOKEN_PROGRAM_ID,
			systemProgram: SystemProgram.programId,
		})
		.signers([USER, predict])
		.rpc({ commitment: 'confirmed' });

	console.log('Fetching transaction logs...');
	const trans = await provider.connection.getTransaction(tx, {
		commitment: 'confirmed',
	});
	console.log(trans?.meta?.logMessages);
}

const decimal = ({ value, decimals }: { value: BN; decimals: number }) => {
	const v = value.toString(10);
	const pos = v.length - decimals;
	return v.substring(0, pos) + '.' + v.substring(pos);
};

async function claim() {
	console.log('Fetching current user predictions...');
	const predictions = await program.account.prediction.all([
		{
			memcmp: {
				offset: 8,
				bytes: USER.publicKey.toBase58(),
			},
		},
	]);

	console.log(`User has make ${predictions.length} prediction`);
	if (predictions.length === 0) return;

	for (const prediction of predictions) {
		console.log(
			`> Claiming prediction isUp=${prediction.account.isUp},amount=${prediction.account.amount}:`,
			prediction.publicKey.toBase58()
		);

		console.log('Fetching result of round:', prediction.account.result.toBase58());
		const roundResult = await program.account.roundResult.fetch(prediction.account.result, 'confirmed');

		console.log(
			`Price that round ${decimal(roundResult.priceEndPredictStage)} => ${decimal(roundResult.priceEndLiveStage)}`
		);

		console.log('Executing...');
		const tx = await program.methods
			.claimReward()
			.accounts({
				user: USER.publicKey,
				userToken: USER_TOKEN,
				programState: PROGRAM_STATE,
				mint: CONFIG.MINT,
				round: prediction.account.result,
				pool: roundResult.pool,
				treasury: CONFIG.TREASURY,
				pdaAuthority: PDA_AUTHORITY,
				prediction: prediction.publicKey,
				tokenProgram: TOKEN_PROGRAM_ID,
			})
			.signers([USER])
			.rpc({ commitment: 'confirmed' });

		console.log('Fetching transaction logs...');
		const trans = await provider.connection.getTransaction(tx, {
			commitment: 'confirmed',
		});
		console.log(trans?.meta?.logMessages);
	}
}

async function createRound() {
	console.log('Fetching ProgramState...');
	const state = await program.account.programState.fetch(PROGRAM_STATE);
	const numRound = state.roundCounter.toNumber();

	console.log(
		`Starting a new round with ${CONFIG.TAX_PERCENTAGE}% tax and will burn ${CONFIG.BURN_PERCENTAGE}% of the collected tax`
	);

	const nextRoundResult = await getRoundResult(numRound)
	console.log('Round result:', numRound, nextRoundResult.toBase58());

	const nextRoundPool = Keypair.generate();
	console.log('Round pool:', nextRoundPool.publicKey.toBase58());
	const timeStart = Math.ceil(Date.now() / (30 * 60 * 1000)) * 30 * 60;

	console.log('Executing...');
	const tx = await program.methods
		.createRound(
			new BN(CONFIG.MIN_BET_AMOUNT),
			new BN(CONFIG.TAX_PERCENTAGE),
			new BN(CONFIG.BURN_PERCENTAGE),
			new BN(timeStart),
			new BN(timeStart + 15 * 60),
			new BN(timeStart * 30 * 60),
		)
		.accounts({
			owner: OWNER.publicKey,
			programState: PROGRAM_STATE,
			round: nextRoundResult,
			pool: nextRoundPool.publicKey,
			poolAuthority: PDA_AUTHORITY,
			mint: CONFIG.MINT,
			tokenProgram: TOKEN_PROGRAM_ID,
			systemProgram: SystemProgram.programId
		})
		.signers([OWNER, nextRoundPool])
		.rpc({ commitment: 'confirmed' });

	console.log('Fetching transaction logs...');
	const trans = await provider.connection.getTransaction(tx, {
		commitment: 'confirmed',
	});
	console.log(trans?.meta?.logMessages);
}

async function startRound() {
	console.log('Fetching ProgramState...');
	const state = await program.account.programState.fetch(PROGRAM_STATE);
	const numRound = state.roundCounter.toNumber();

	console.log('Searching for WaitStartRound round...');
	let roundIdx = -1;
	let roundPubkey;
	let roundResult;
	for (roundIdx = numRound - 5; roundIdx <= numRound; roundIdx++) {
		if (roundIdx < 0)
			continue;

		try {
			roundPubkey = await getRoundResult(roundIdx);
			roundResult = await program.account.roundResult.fetch(roundPubkey);
			if (roundResult.stage === STAGE.WAIT_START_ROUND) {
				break;
			}
		} catch (ex) {
			// Most likely account not found, ignore
		}
	}

	console.log('Starting round', roundIdx, roundPubkey.toBase58());

	console.log('Executing...');
	const tx = await program.methods
		.startRound(new BN(20 * LAMPORTS_PER_SOL))
		.accounts({
			owner: OWNER.publicKey,
			programState: PROGRAM_STATE,
			round: roundPubkey,
			pool: roundResult.pool,
			treasury: CONFIG.TREASURY,
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

async function liveStageBegin() {
	console.log('Fetching ProgramState...');
	const state = await program.account.programState.fetch(PROGRAM_STATE);
	const numRound = state.roundCounter.toNumber();

	console.log('Searching for playable round...');
	let roundIdx = -1;
	let roundPubkey;
	let roundResult;
	for (roundIdx = numRound - 5; roundIdx <= numRound; roundIdx++) {
		if (roundIdx < 0)
			continue;

		try {
			roundPubkey = await getRoundResult(roundIdx);
			roundResult = await program.account.roundResult.fetch(roundPubkey);
			if (roundResult.stage === STAGE.PREDICTION) {
				break;
			}
		} catch (ex) {
			// Most likely account not found, ignore
		}
	}


	console.log('Ending prediction state of round', roundIdx, roundPubkey.toBase58());

	console.log('Executing...');
	const tx = await program.methods
		.finalizePredictionStage()
		.accounts({
			owner: OWNER.publicKey,
			programState: PROGRAM_STATE,
			round: roundPubkey,
			chainlinkFeed: CONFIG.CHAINLINK_FEED,
			chainlinkProgram: CONFIG.CHAINLINK_PROGRAM,
		})
		.signers([OWNER])
		.rpc({ commitment: 'confirmed' });

	console.log('Fetching transaction logs...');
	const trans = await provider.connection.getTransaction(tx, {
		commitment: 'confirmed',
	});
	console.log(trans?.meta?.logMessages);
}

async function liveStageEnd() {
	console.log('Fetching ProgramState...');
	const state = await program.account.programState.fetch(PROGRAM_STATE);
	const numRound = state.roundCounter.toNumber();

	console.log('Searching for playable round...');
	let roundIdx = -1;
	let roundPubkey;
	let roundResult;
	for (roundIdx = numRound - 5; roundIdx <= numRound; roundIdx++) {
		if (roundIdx < 0)
			continue;

		try {
			roundPubkey = await getRoundResult(roundIdx);
			roundResult = await program.account.roundResult.fetch(roundPubkey);
			if (roundResult.stage === STAGE.LIVE) {
				break;
			}
		} catch (ex) {
			// Most likely account not found, ignore
		}
	}

	console.log('Ending live state of round', roundIdx, roundPubkey.toBase58());

	console.log('Executing...');
	const tx = await program.methods
		.finalizeLiveStage()
		.accounts({
			owner: OWNER.publicKey,
			programState: PROGRAM_STATE,
			round: roundPubkey,
			chainlinkFeed: CONFIG.CHAINLINK_FEED,
			chainlinkProgram: CONFIG.CHAINLINK_PROGRAM,
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
		case 'predict': {
			predict();
			break;
		}
		case 'claim': {
			claim();
			break;
		}
		case 'createRound': {
			createRound();
			break;
		}
		case 'startRound': {
			startRound();
			break;
		}
		case 'liveStageBegin': {
			liveStageBegin();
			break;
		}
		case 'liveStageEnd': {
			liveStageEnd();
			break;
		}
	}
}

