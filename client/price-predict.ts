import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { Program, BN, EventParser } from '@project-serum/anchor';
import { OWNER, provider, USER, USER_TOKEN } from './provider';
import { PricePredict, IDL } from '../idl/price_predict';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const PROGRAM_STATE_PDA_SEED = 'program_state';
const PROGRAM_ID = 'FaeFfvd41M31wmg5cMH3eo9q8DHVNhnf3zW6ityG4ija';

const DIVISOR = 1000; // use in percentage
const DECIMAL = new BN('1000000000000', 10); // use when handling coin price

const CONFIG = {
	TAX_PERCENTAGE: 0.01 * DIVISOR,
	BURN_PERCENTAGE: 0.5 * DIVISOR,
	MIN_BET_AMOUNT: 1 * LAMPORTS_PER_SOL,
	// Keys
	CHAINLINK_FEED: new PublicKey('HgTtcbcmp5BeThax5AU8vg4VwK79qAvAKKFMs8txMLW6'),
	CHAINLINK_PROGRAM: new PublicKey('HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny'),
	// Token
	MINT: '9a7TwLHkA2AaJd9E7qsdhaTPhQL5wQ9VXYo7J2pXHixV',
	POOL: '57ibTWgJJ7vRdQejVYWXTRYY7uPyo9zz6pE1LhjW42Kf',
	TREASURY: '3gBfaqxVBh5ZYKv3RE544JZMq3yTogR1jZsRyYguWHMQ',
};

const program = new Program(IDL, PROGRAM_ID) as Program<PricePredict>;

const [PROGRAM_STATE, PROGRAM_STATE_BUMP] = PublicKey.findProgramAddressSync([Buffer.from(PROGRAM_STATE_PDA_SEED, 'utf-8')], program.programId);

async function init() {
	console.log('Executing...');
	const tx = await program.methods
		.init(
			CONFIG.CHAINLINK_PROGRAM,
			CONFIG.CHAINLINK_FEED,
			CONFIG.TAX_PERCENTAGE,
			CONFIG.BURN_PERCENTAGE,
			new BN(CONFIG.MIN_BET_AMOUNT),
			[
				[7 * 24 * 60 * 60, 100],
				[6 * 24 * 60 * 60, 60],
				[5 * 24 * 60 * 60, 30],
			]
		)
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
	const state = await program.account.programState.fetch(PROGRAM_STATE, 'confirmed');
	const round = await program.account.roundResult.fetch(state.roundResult, 'confirmed');

	const prediction = Keypair.generate();
	const price = Math.round(Math.random() * 10) + 40;
	console.log('Prediction: ', prediction.publicKey.toBase58(), 'price', price);

	console.log('Executing...');
	const tx = await program.methods
		.predict(
			new BN(5 * LAMPORTS_PER_SOL),
			new BN(price).mul(DECIMAL)
		)
		.accounts({
			user: USER.publicKey,
			userToken: USER_TOKEN,
			programState: PROGRAM_STATE,
			roundResult: state.roundResult,
			prediction: prediction.publicKey,
			pool: round.pool,
			tokenProgram: TOKEN_PROGRAM_ID,
			systemProgram: SystemProgram.programId,
		})
		.signers([USER, prediction])
		.rpc({ commitment: 'confirmed' });

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

	const eventParser = new EventParser(program.programId, program.coder);
	console.log('Event', eventParser.parseLogs(logs));
	console.log(logs);
}

async function claim() {
	const state = await program.account.programState.fetch(PROGRAM_STATE, 'confirmed');
	const round = await program.account.roundResult.fetch(state.roundResult, 'confirmed');

	const predictions = await program.account.prediction.all([
		{
			memcmp: {
				offset: 8,
				bytes: USER.publicKey.toBase58(),
			}
		}
	]);

	console.log(`User make ${predictions.length} prediction`);
	for (const prediction of predictions) {
		console.log(
			`Claiming ${prediction.publicKey.toBase58()}` +
			`\tround=${prediction.account.roundResult.toBase58()}` +
			`\ttime=${new Date(prediction.account.unixTimePredict.toNumber() * 1000)}` +
			`\tstake=${prediction.account.stakeAmount.toString(10)}` +
			`\tvec0=${prediction.account.predictVector0.toString(10)}`
		);

		console.log('Executing...');
		const tx = await program.methods.claimReward(PROGRAM_STATE_BUMP).accounts({
			user: USER.publicKey,
			userToken: USER_TOKEN,
			programState: PROGRAM_STATE,
			roundResult: state.roundResult,
			prediction: prediction.publicKey,
			mint: state.mint,
			pool: round.pool,
			treasury: state.treasury,
			tokenProgram: TOKEN_PROGRAM_ID,
		})
		.signers([USER])
		.rpc({ commitment: 'confirmed' });

		console.log('Fetching transaction logs...');
		const trans = await provider.connection.getTransaction(tx, {
			commitment: 'confirmed',
		});

		const logs = trans?.meta?.logMessages;
		if (!logs)
		{
			console.log('Trans has no log', tx, trans);
			continue;
		}

		const eventParser = new EventParser(program.programId, program.coder);
		console.log('Event', eventParser.parseLogs(logs));
		console.log(logs);
	}
}

async function next() {
	const roundResult = Keypair.generate();
	const pool = Keypair.generate();

	console.log('Executing...');
	const tx = await program.methods
		.nextRound()
		.accounts({
			owner: OWNER.publicKey,
			programState: PROGRAM_STATE,
			roundResult: roundResult.publicKey,
			mint: CONFIG.MINT,
			pool: pool.publicKey,
			chainlinkFeed: CONFIG.CHAINLINK_FEED,
			chainlinkProgram: CONFIG.CHAINLINK_PROGRAM,
			tokenProgram: TOKEN_PROGRAM_ID,
			systemProgram: SystemProgram.programId,
			rent: SYSVAR_RENT_PUBKEY,
		})
		.signers([OWNER, roundResult, pool])
		.rpc({ commitment: 'confirmed' });

	console.log('Fetching transaction logs...');
	const trans = await provider.connection.getTransaction(tx, {
		commitment: 'confirmed',
	});

	console.log(trans?.meta?.logMessages);
}

async function computeStart() {
	const state = await program.account.programState.fetch(PROGRAM_STATE, 'confirmed');

	console.log('Executing...');
	const tx = await program.methods
		.computeRoundResultStart()
		.accounts({
			owner: OWNER.publicKey,
			programState: PROGRAM_STATE,
			roundResult: state.roundResult,
			chainlinkFeed: state.chainlinkFeed,
			chainlinkProgram: state.chainlinkProgram,
		})
		.signers([OWNER])
		.rpc({ commitment: 'confirmed' });

	console.log('Fetching transaction logs...');
	const trans = await provider.connection.getTransaction(tx, {
		commitment: 'confirmed',
	});

	console.log(trans?.meta?.logMessages);
}

async function computeEnd() {
	const state = await program.account.programState.fetch(PROGRAM_STATE, 'confirmed');
	const round = await program.account.roundResult.fetch(state.roundResult, 'confirmed');

	const predictions = await program.account.prediction.all([
		{
			memcmp: {
				offset: 8 + 32,
				bytes: state.roundResult.toBase58(),
			}
		}
	]);

	console.log(`Found ${predictions.length} prediction`);

	const sumStake = new BN(0);
	const sumStakeXScore = new BN(0);
	for (const prediction of predictions) {
		let score = computeScore(prediction.account.predictVector0, round.resultVec0);

		const timeBeforeFinalized = round.unixTimeEndRound.sub(prediction.account.unixTimePredict).toNumber();
		for (const [time, bonusPoint] of (state.bonusPoints as Array<[number, number]>)) {
			if (timeBeforeFinalized >= time) {
				score += bonusPoint;
				break;
			}
		}

		console.log(`Prediction: ${prediction.publicKey.toBase58()}, score=${score}`);

		sumStake.iadd(prediction.account.stakeAmount);
		sumStakeXScore.iadd(prediction.account.stakeAmount.muln(score));
	}

	console.log(`Sum stake = ${sumStake.toString(10)}\nSum stake X score = ${sumStakeXScore.toString(10)}`);

	console.log('Executing...');
	const tx = await program.methods
		.computeRoundResultEnd(
			sumStake,
			sumStakeXScore
		)
		.accounts({
			owner: OWNER.publicKey,
			programState: PROGRAM_STATE,
			roundResult: state.roundResult,
		})
		.signers([OWNER])
		.rpc({ commitment: 'confirmed' });

	console.log('Fetching transaction logs...');
	const trans = await provider.connection.getTransaction(tx, {
		commitment: 'confirmed',
	});

	console.log(trans?.meta?.logMessages);
}

function computeVec0(priceStart: BN, priceEnd: BN): number {
	return priceEnd.muln(1_000_000).div(priceEnd.add(priceStart)).toNumber() / 10_000;
}

function computeScore(predictVec0: number, actualVec0: number): number {
	const predict = { x: predictVec0, y: 100 - predictVec0 };
	const actual = { x: actualVec0, y: 100 - actualVec0 };

	const dotProduct = predict.x * actual.x + predict.y * actual.y;
	const vecLength = Math.sqrt(predict.x * predict.x + predict.y * predict.y) * Math.sqrt(actual.x * actual.x + actual.y * actual.y);
	const angle = Math.acos(dotProduct / vecLength);

	return angle <= Math.PI / 1000 ? 1000 : Math.round(Math.PI / angle);
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
		case 'next': {
			next();
			break;
		}
		case 'computeStart': {
			computeStart();
			break;
		}
		case 'computeEnd': {
			computeEnd();
			break;
		}
	}
}
