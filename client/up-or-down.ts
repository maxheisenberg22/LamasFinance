import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { Program } from '@project-serum/anchor';
import { provider } from './provider';
import { UpOrDown, IDL } from '../target/types/up_or_down.ts';

const CHAINLINK_PROGRAM_ID = "HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny";
const DIVISOR = 100000000;

// Data feed account address
// Default is SOL / USD
const CHAINLINK_FEED = "HgTtcbcmp5BeThax5AU8vg4VwK79qAvAKKFMs8txMLW6";
const PROGRAM_ID = "JC5q9ywJmhvGiBTSG2hmfqeu4Ucp3f9hHtC1CNVZfSkm";

(async function() {
	// Address of the deployed program.
	const programId = new PublicKey(PROGRAM_ID);

	// Generate the program client from IDL.
	const program = new Program(IDL, programId) as Program<UpOrDown>;

	//create an account to store the price data
	const priceFeedAccount = Keypair.generate();

	console.log('priceFeedAccount public key: ' + priceFeedAccount.publicKey);
	console.log('user public key: ' + provider.wallet.publicKey);

	// Execute the RPC.
	const tx = await program.methods
		.execute()
		.accounts({
			decimal: priceFeedAccount.publicKey,
			user: provider.wallet.publicKey,
			chainlinkFeed: CHAINLINK_FEED,
			chainlinkProgram: CHAINLINK_PROGRAM_ID,
			systemProgram: SystemProgram.programId
		})
		.signers([priceFeedAccount])
		.rpc({ commitment: 'confirmed' });

	console.log('Fetching transaction logs...');
	const trans = await provider.connection.getTransaction(tx, {
		commitment: 'confirmed',
	});

	console.log(trans?.meta?.logMessages);

	// Fetch the account details of the account containing the price data
	const latestPrice = await program.account.decimal.fetch(priceFeedAccount.publicKey);
	console.log('Price Is: ' + latestPrice.value / DIVISOR)
})();
