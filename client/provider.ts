import { AnchorProvider, setProvider } from '@project-serum/anchor';
import { Keypair, Connection } from '@solana/web3.js';
import NodeWallet from '@project-serum/anchor/dist/cjs/nodewallet';

const URL = 'https://api.devnet.solana.com';
export const OWNER = Keypair.fromSecretKey(
	new Uint8Array([
		111, 118, 107, 173, 240, 168, 69, 73, 10, 9, 142, 105, 124, 62, 45, 115, 251, 251, 178, 118, 181, 234, 217,
		39, 216, 132, 91, 232, 83, 32, 181, 192, 99, 160, 13, 45, 231, 79, 179, 214, 183, 114, 85, 42, 30, 241, 135,
		24, 20, 224, 106, 75, 227, 156, 241, 10, 60, 211, 131, 200, 123, 9, 190, 37,
	])
);

export const USER = Keypair.fromSecretKey(
	new Uint8Array([
		110, 128, 57, 164, 181, 133, 232, 44, 46, 235, 125, 109, 243, 64, 183, 72, 149, 34, 172, 38, 117, 157, 28,
		204, 68, 174, 52, 224, 169, 60, 128, 144, 61, 106, 10, 143, 74, 13, 105, 232, 66, 196, 2, 178, 232, 158,
		184, 66, 83, 195, 27, 17, 182, 180, 255, 136, 217, 112, 95, 160, 181, 201, 115, 198,
	])
);
export const USER_TOKEN = 'FFVcqDZ9AQHwabV9ope7Jq3EaoPcZXJgsJLJWUUNTrk6';

const opts = AnchorProvider.defaultOptions();
export const provider = new AnchorProvider(
	new Connection(URL, opts.preflightCommitment),
	new NodeWallet(OWNER),
	opts
);

setProvider(provider);
