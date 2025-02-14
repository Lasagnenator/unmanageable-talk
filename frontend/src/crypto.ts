/**
 * Cryptography primitives for the whole project.
 * Written by Matthew Richards.
 */

import { Hex, bytesToHex, hexToBytes } from "@noble/curves/abstract/utils";
import { ed25519, edwardsToMontgomeryPriv, edwardsToMontgomeryPub, x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha512 } from "@noble/hashes/sha512";
import { KeyBundle } from "./types";

export { bytesToHex, hexToBytes };

/**
 * Concatenate multiple Uint8Arrays in order.
 * @param arrays
 * @returns The new array.
 */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
	if (arrays.length === 1) return arrays[0];
	const length = arrays.reduce((prev, arr) => prev + arr.length, 0);
	const result = new Uint8Array(length);
	let offset = 0;
	for (let i = 0; i < arrays.length; i++) {
		const arr = arrays[i];
		result.set(arr, offset);
		offset += arr.length;
	}
	return result;
}

// Elliptic Curve Functions

/**
 * Generate a random private key.
 */
export function generatePrivateKey(): string {
	return bytesToHex(ed25519.utils.randomPrivateKey());
}

/**
 * Derive a public key from a given private key.
 */
export function getPublicKey(privateKey: string): string {
	return bytesToHex(ed25519.getPublicKey(privateKey));
}

/**
 * Produce a signature for a given message. In general, signing arbitrary messages is
 * not a good idea.
 * @param privateKey Your private key to sign with.
 * @param message The message to sign. Can be a hex string or Uint8Array.
 * @returns
 */
export function signature(privateKey: string, message: Hex): string {
	return bytesToHex(ed25519.sign(message, privateKey));
}

/**
 * Verify a signature for a givern message
 * @param publicKey The public key associated to the private key used for signing.
 * @param message The message to verify. Can be a hex string or Uint8Array.
 * @param sig The signature as output by `signature`.
 * @returns `true` when signature matches. `false` otherwise.
 */
export function verify(publicKey: string, message: Hex, sig: string): boolean {
	return ed25519.verify(sig, message, publicKey);
}

/**
 * Compute the challenge response from the server.
 * @param privateKey Your private key.
 * @param challenge The challenge from the server.
 */
export function generateChallengeResponse(privateKey: string, challenge: string): string {
	// This uses arcane magic to interoperate with pycryptodome's Ed25519.
	const d = ed25519.utils.getExtendedPublicKey(privateKey).scalar;
	return ed25519.ExtendedPoint.fromHex(challenge).multiply(d).toHex();
}

/**
 * Compute a shared secret using a private key and public key.
 */
function ECDH(privateKey: string, publicKey: string): string {
	const priv = edwardsToMontgomeryPriv(hexToBytes(privateKey));
	const pub = edwardsToMontgomeryPub(publicKey);
	return bytesToHex(x25519.getSharedSecret(priv, pub));
}

/**
 * Create a secret key for personal use.
 * @param privateKey Your private key to derive from.
 * @returns 'Shared' secret where only you know it.
 */
export function generatePersonalKey(privateKey: string): string {
	return ECDH(privateKey, getPublicKey(privateKey));
}

/**
 * KDF function for X3DH protocol.
 * @param keyMaterial Secret key material to generate output.
 */
function kdf(keyMaterial: Uint8Array): Uint8Array {
	// F is used for cryptographic domain separation.
	// For X25519 it is mandated to be 32 0xFF bytes.
	const F = new Uint8Array(32).fill(0xff);
	// Salt for this protocol is mandated to be zeros.
	const salt = new Uint8Array(64).fill(0);
	// Info should be some identifier for this application.
	const info = new TextEncoder().encode("Unmanageable");

	const dk = hkdf(sha512, concatBytes(F, keyMaterial), salt, info, 32);
	return new Uint8Array(dk);
}

/**
 * First half of the X3DH protocol to create a shared secret with someone.
 * @param ika Your private key.
 * @param IKb The other person's public key.
 * @param SPKb The other person's signed prekey.
 * @param sig Signature of the other person's prekey.
 * @returns The shared secret and components to send to the other person.
 * False when SPK fails to verify.
 */
function X3DH_send(ika: string, IKb: string, SPKb: string, sig: string) {
	// First verify the SPK from the other person
	if (!verify(IKb, SPKb, sig)) {
		return false;
	}
	const eka = generatePrivateKey();
	const DH1 = hexToBytes(ECDH(ika, SPKb));
	const DH2 = hexToBytes(ECDH(eka, IKb));
	const DH3 = hexToBytes(ECDH(eka, SPKb));
	const DH4 = hexToBytes(ECDH(ika, IKb));
	const dk = kdf(concatBytes(DH1, DH2, DH3, DH4));

	return {
		sharedKey: bytesToHex(dk),
		message: {
			ek: getPublicKey(eka),
			spk: SPKb,
		},
	};
}

/**
 * Second half of the X3DH protocol when someone wants to create a shared key with you.
 * @param ika Your private key.
 * @param IKb The other person's public key.
 * @param spka The private key associated with SPK used on the other side.
 * You MUST verify that the public key used was valid.
 * @param EKb The other person's EK that they sent as well.
 * @returns The shared key.
 */
function X3DH_recv(ika: string, IKb: string, spka: string, EKb: string): string {
	const DH1 = hexToBytes(ECDH(spka, IKb));
	const DH2 = hexToBytes(ECDH(ika, EKb));
	const DH3 = hexToBytes(ECDH(spka, EKb));
	const DH4 = hexToBytes(ECDH(ika, IKb));
	const dk = kdf(concatBytes(DH1, DH2, DH3, DH4));
	return bytesToHex(dk);
}

/**
 * Collection of functions to handle offline key agreement.
 */
export const X3DH = {
	send: X3DH_send,
	recv: X3DH_recv,
};

/**
 * Round up a number to a power of 2 if it isn't one already.
 */
function roundUp2(n: number) {
	let result = 1;
	while (result < n) {
		result <<= 1;
	}
	return result;
}

/**
 * Multiply a point by a scalar. The goal is that point*scalar = scalar*point.
 * The order of the two arguments does not matter.
 * @param key1 Hex string.
 * @param key2 Hex string.
 */
function multiply(key1: string, key2: string) {
	// Both are private keys internally. Get the public key of one and multiply.
	const d = ed25519.utils.getExtendedPublicKey(key2).scalar;
	return ed25519.utils.getExtendedPublicKey(key1).point.multiply(d).toHex();
}

/**
 * Multiply a point by a scalar. This time the goal is to combine a public key
 * with a secret.
 * @param privateKey Hex string.
 * @param publicKey Hex string.
 */
function multiply_public(privateKey: string, publicKey: string) {
	const d = ed25519.utils.getExtendedPublicKey(privateKey).scalar;
	return ed25519.ExtendedPoint.fromHex(publicKey).multiply(d).toHex();
}

/**
 * Find the index of the copath for the current index.
 * @param x Current index.
 */
function copath(x: number) {
	if (x % 2 == 0) {
		return x + 1;
	} else {
		return x - 1;
	}
}

/**
 * Create the keys needed for a group dm. Takes in the array of bundles
 * (order is important) and gives the shared secret along with the key tree
 * and array of intial messages. This can return false when any bundle fails
 * to verify.
 * @param ika Your private key.
 * @param bundles Array of key bundles (not including self).
 */
export function createGroupDM(ika: string, bundles: KeyBundle[]) {
	// Generate lambdas
	let messages: { ek: string; spk: string }[] = [];
	let tree: string[] = [generatePrivateKey()];
	for (const bundle of bundles) {
		const v = X3DH_send(ika, bundle.ik, bundle.spk, bundle.sig);
		// Any X3DH failure aborts the dm creation.
		if (!v) return false;
		messages = messages.concat([v.message]);
		tree = tree.concat(v.sharedKey);
	}

	// Pad the tree to a power of 2. This allows for non-powers of 2 length inputs.
	const fill = Array.from({ length: roundUp2(tree.length) - tree.length }, (x, i) => generatePrivateKey());
	tree = tree.concat(fill);

	// Generate rest of tree.
	let limit = tree.length >> 1;
	while (limit > 1) {
		let layer: string[] = [];
		for (let i = 0; i < limit; i++) {
			const s = multiply(tree[i * 2], tree[i * 2 + 1]);
			layer = layer.concat([s]);
		}
		// Prepend the layer to the tree.
		tree = layer.concat(tree);
		limit >>= 1;
	}
	// Generate the root (the group secret).
	const s1 = multiply(tree[0], tree[1]);

	// Currently the tree only contains private keys.
	// Convert them all to public keys.
	tree = tree.map(getPublicKey);

	return {
		sharedKey: s1,
		keyTree: tree,
		messages,
	};
}

/**
 * Construct a group dm from an initial message, key tree and position in the tree.
 * Returns the group secret. The group creator does not need to call this function.
 * @param ika Your private key.
 * @param IKb The other person's public key.
 * @param spka The private key associated with SPK used on the other side.
 * You MUST verify that the public key used was valid.
 * @param EKb The other person's EK that they sent as well.
 * @param tree The key tree. This should be length >= 2*N - 2 where N is the number
 * of people in this dm. It's exact length should be of the form 2^x-2.
 * @param position Your position in the tree. This should not be zero.
 */
export function recvGroupDM(ika: string, IKb: string, spka: string, EKb: string, tree: string[], position: number) {
	// Pad out the tree to start: zeroth position and empty s1.
	tree = ["", ""].concat(tree);
	let s = X3DH_recv(ika, IKb, spka, EKb); // s_(n + pos)
	const N = tree.length >> 1; // Number of people represented in the tree.
	let curr = position + N;
	while (curr > 1) {
		s = multiply_public(s, tree[copath(curr)]);
		curr >>= 1;
	}
	return s;
}

/**
 * Collection of functions to handle public / private keys.
 */
export const ECC = {
	generatePrivateKey,
	getPublicKey,
	signature,
	verify,
	generateChallengeResponse,
	generatePersonalKey,
	X3DH,
	createGroupDM,
	recvGroupDM,
};

// Symmetric Cipher Functions

const AESDEFS = { crypt: "AES-GCM", import: { name: "AES-GCM", length: 256 } };

/**
 * Encrypt some plaintext with a key.
 * @param sharedKey Must be 32 bytes (64 hex characters).
 * @param plaintext Hex string of plaintext to encrypt.
 * @returns Hex string of the encrypted message.
 */
export async function encrypt(sharedKey: string, plaintext: string) {
	const sKey = hexToBytes(sharedKey);
	const message = hexToBytes(plaintext);
	// NIST says IVs need to be 96 bits.
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const key = await crypto.subtle.importKey("raw", sKey, AESDEFS.import, false, ["encrypt"]);
	const ciphertext = await crypto.subtle.encrypt({ name: AESDEFS.crypt, iv }, key, message);
	return bytesToHex(concatBytes(iv, new Uint8Array(ciphertext)));
}

/**
 * Decrypt some encrypted message.
 * @param sharedKey Must be 32 bytes (64 hex characters).
 * @param encrypted The entire encrypted output as a hex string.
 * @returns Hex string of the decrypted message.
 */
export async function decrypt(sharedKey: string, encrypted: string) {
	const sKey = hexToBytes(sharedKey);
	const message = hexToBytes(encrypted);
	const iv = message.slice(0, 12);
	const ciphertext = message.slice(12);
	const key = await crypto.subtle.importKey("raw", sKey, AESDEFS.import, false, ["decrypt"]);
	try {
		const plaintext = await crypto.subtle.decrypt({ name: AESDEFS.crypt, iv }, key, ciphertext);
		return bytesToHex(new Uint8Array(plaintext));
	} catch (DOMException) {
		return false;
	}
}

/**
 * Functions for encryption and decryption.
 */
export const AES = {
	encrypt,
	decrypt,
};

// RFC1751 human readable key functions
// The original wordlist is quite inappropriate now so it has been replaced
// with the wordlist from BIP-0039. Only the wordlist has been changed,
// everything else is still compliant with RFC1751.

/**
 * Generate a human readable key based on the given private key.
 * Technically it operates on any multiple of 8 bytes. This algorithm will
 * fail when the input length is not a multiple of 8.
 * @param privateKey Should be the output from generatePrivateKey().
 */
export function keyToRecovery(privateKey: string): string {
	const key = hexToBytes(privateKey);
	let words: bigint[] = [];
	// Operate on each 8 byte (64 bit) group.
	for (let i = 0; i < key.length; i += 8) {
		const group = concatBytes(key.slice(i, i + 8), new Uint8Array(2));
		// Parity calculation
		let parity = 0n;
		for (let j = 0n; j < 64n; j += 2n) {
			parity += extract(group, j, 2n);
		}
		parity <<= 6n;
		group[8] = Number(parity);

		// Make word index array.
		for (let j = 0n; j < 66n; j += 11n) {
			words = words.concat(extract(group, j, 11n));
		}
	}

	// Join by spaces.
	return words.map((v) => wordlist[Number(v)]).join(" ");
}

/**
 * Use the recovery key to get a private key. This is OK to call
 * directly on user input however, the output should be checked for failure.
 * @param recovery Should be the ouput from generateRecovery(key).
 * @returns The private key when everything is valid. `false` otherwise.
 * Possible failure cases:
 * - Incorrect length of input.
 * - Unknown word in recovery key.
 * - Self-check fails.
 *
 * In the case of failure, the user should be notified about an incorrect key.
 */
export function recoveryToKey(recovery: string): string | false {
	const words = recovery.toUpperCase().split(" ");
	if (words.length != 24) {
		// Only allow inputs of required length.
		return false;
	}
	const decoded = words.map((v) => BigInt(wordlist.indexOf(v)));
	if (decoded.includes(-1n)) {
		// Words must be present in the wordlist.
		return false;
	}

	let result: Uint8Array[] = [];
	// Operate on each 66 bit group
	for (let i = 0; i < decoded.length; i += 6) {
		const group = decoded.slice(i, i + 6);
		let result_slice = new Uint8Array(11);
		for (let j = 0; j < 6; j += 1) {
			result_slice = insert(result_slice, BigInt(j * 11), 11n, group[j]);
		}

		// Check parity
		let parity = 0n;
		for (let j = 0n; j < 64n; j += 2n) {
			parity += extract(result_slice, j, 2n);
		}
		if ((parity & 3n) != extract(result_slice, 64n, 2n)) {
			// Parity check failed.
			return false;
		}

		result = result.concat(result_slice.slice(0, 8));
	}

	return bytesToHex(concatBytes(...result));
}

/**
 * Internal function for extracting bits from a Uint8Array. Based off code from
 * the original RFC1751 implementation.
 * @param s The array to extract from.
 * @param start Start bit.
 * @param length How many bits to extract. Maximum 11.
 */
function extract(s: Uint8Array, start: bigint, length: bigint): bigint {
	let cl = BigInt(s[Number(start / 8n)]);
	let cc = BigInt(s[Number(start / 8n + 1n)]);
	let cr = BigInt(s[Number(start / 8n + 2n)]);
	let x = (((cl << 8n) | cc) << 8n) | cr;
	x >>= 24n - (length + (start % 8n));
	x &= 0xffffn >> (16n - length);
	return x;
}

/**
 * Internal function for insert bits into a Uint8Array. Based off code from
 * the original RFC1751 implementation.
 * @param s The array to insert into.
 * @param start Start bit.
 * @param length How many bits to insert. Always 11 for our use.
 * @param value The value to insert.
 * @returns The new array.
 */
function insert(s: Uint8Array, start: bigint, length: bigint, value: bigint) {
	const shift = (8n - ((start + length) % 8n)) % 8n;
	const y = value << shift;
	const cl = (y >> 16n) & 0xffn;
	const cc = (y >> 8n) & 0xffn;
	const cr = y & 0xffn;
	if (shift + length > 16) {
		s[Number(start / 8n)] |= Number(cl);
		s[Number(start / 8n + 1n)] |= Number(cc);
		s[Number(start / 8n + 2n)] |= Number(cr);
	} else if (shift + length > 8) {
		s[Number(start / 8n)] |= Number(cc);
		s[Number(start / 8n + 1n)] |= Number(cr);
	} else {
		s[Number(start / 8n)] |= Number(cr);
	}
	return s;
}

// Exactly 2048 words = 11 bit words.
// 256 bit key encoded as 24 words.
// Each 64 bit group has 2 parity bits added when encoding into 6 words.
// prettier-ignore
const wordlist = ['ABANDON', 'ABILITY', 'ABLE', 'ABOUT', 'ABOVE', 'ABSENT',
    'ABSORB', 'ABSTRACT', 'ABSURD', 'ABUSE', 'ACCESS', 'ACCIDENT',
    'ACCOUNT', 'ACCUSE', 'ACHIEVE', 'ACID', 'ACOUSTIC', 'ACQUIRE', 'ACROSS',
    'ACT', 'ACTION', 'ACTOR', 'ACTRESS', 'ACTUAL', 'ADAPT', 'ADD', 'ADDICT',
    'ADDRESS', 'ADJUST', 'ADMIT', 'ADULT', 'ADVANCE', 'ADVICE', 'AEROBIC',
    'AFFAIR', 'AFFORD', 'AFRAID', 'AGAIN', 'AGE', 'AGENT', 'AGREE', 'AHEAD',
    'AIM', 'AIR', 'AIRPORT', 'AISLE', 'ALARM', 'ALBUM', 'ALCOHOL', 'ALERT',
    'ALIEN', 'ALL', 'ALLEY', 'ALLOW', 'ALMOST', 'ALONE', 'ALPHA', 'ALREADY',
    'ALSO', 'ALTER', 'ALWAYS', 'AMATEUR', 'AMAZING', 'AMONG', 'AMOUNT',
    'AMUSED', 'ANALYST', 'ANCHOR', 'ANCIENT', 'ANGER', 'ANGLE', 'ANGRY',
    'ANIMAL', 'ANKLE', 'ANNOUNCE', 'ANNUAL', 'ANOTHER', 'ANSWER', 'ANTENNA',
    'ANTIQUE', 'ANXIETY', 'ANY', 'APART', 'APOLOGY', 'APPEAR', 'APPLE',
    'APPROVE', 'APRIL', 'ARCH', 'ARCTIC', 'AREA', 'ARENA', 'ARGUE', 'ARM',
    'ARMED', 'ARMOR', 'ARMY', 'AROUND', 'ARRANGE', 'ARREST', 'ARRIVE',
    'ARROW', 'ART', 'ARTEFACT', 'ARTIST', 'ARTWORK', 'ASK', 'ASPECT',
    'ASSAULT', 'ASSET', 'ASSIST', 'ASSUME', 'ASTHMA', 'ATHLETE', 'ATOM',
    'ATTACK', 'ATTEND', 'ATTITUDE', 'ATTRACT', 'AUCTION', 'AUDIT', 'AUGUST',
    'AUNT', 'AUTHOR', 'AUTO', 'AUTUMN', 'AVERAGE', 'AVOCADO', 'AVOID',
    'AWAKE', 'AWARE', 'AWAY', 'AWESOME', 'AWFUL', 'AWKWARD', 'AXIS', 'BABY',
    'BACHELOR', 'BACON', 'BADGE', 'BAG', 'BALANCE', 'BALCONY', 'BALL',
    'BAMBOO', 'BANANA', 'BANNER', 'BAR', 'BARELY', 'BARGAIN', 'BARREL',
    'BASE', 'BASIC', 'BASKET', 'BATTLE', 'BEACH', 'BEAN', 'BEAUTY',
    'BECAUSE', 'BECOME', 'BEEF', 'BEFORE', 'BEGIN', 'BEHAVE', 'BEHIND',
    'BELIEVE', 'BELOW', 'BELT', 'BENCH', 'BENEFIT', 'BEST', 'BETRAY',
    'BETTER', 'BETWEEN', 'BEYOND', 'BICYCLE', 'BID', 'BIKE', 'BIND',
    'BIOLOGY', 'BIRD', 'BIRTH', 'BITTER', 'BLACK', 'BLADE', 'BLAME',
    'BLANKET', 'BLAST', 'BLEAK', 'BLESS', 'BLIND', 'BLOOD', 'BLOSSOM',
    'BLOUSE', 'BLUE', 'BLUR', 'BLUSH', 'BOARD', 'BOAT', 'BODY', 'BOIL',
    'BOMB', 'BONE', 'BONUS', 'BOOK', 'BOOST', 'BORDER', 'BORING', 'BORROW',
    'BOSS', 'BOTTOM', 'BOUNCE', 'BOX', 'BOY', 'BRACKET', 'BRAIN', 'BRAND',
    'BRASS', 'BRAVE', 'BREAD', 'BREEZE', 'BRICK', 'BRIDGE', 'BRIEF',
    'BRIGHT', 'BRING', 'BRISK', 'BROCCOLI', 'BROKEN', 'BRONZE', 'BROOM',
    'BROTHER', 'BROWN', 'BRUSH', 'BUBBLE', 'BUDDY', 'BUDGET', 'BUFFALO',
    'BUILD', 'BULB', 'BULK', 'BULLET', 'BUNDLE', 'BUNKER', 'BURDEN',
    'BURGER', 'BURST', 'BUS', 'BUSINESS', 'BUSY', 'BUTTER', 'BUYER', 'BUZZ',
    'CABBAGE', 'CABIN', 'CABLE', 'CACTUS', 'CAGE', 'CAKE', 'CALL', 'CALM',
    'CAMERA', 'CAMP', 'CAN', 'CANAL', 'CANCEL', 'CANDY', 'CANNON', 'CANOE',
    'CANVAS', 'CANYON', 'CAPABLE', 'CAPITAL', 'CAPTAIN', 'CAR', 'CARBON',
    'CARD', 'CARGO', 'CARPET', 'CARRY', 'CART', 'CASE', 'CASH', 'CASINO',
    'CASTLE', 'CASUAL', 'CAT', 'CATALOG', 'CATCH', 'CATEGORY', 'CATTLE',
    'CAUGHT', 'CAUSE', 'CAUTION', 'CAVE', 'CEILING', 'CELERY', 'CEMENT',
    'CENSUS', 'CENTURY', 'CEREAL', 'CERTAIN', 'CHAIR', 'CHALK', 'CHAMPION',
    'CHANGE', 'CHAOS', 'CHAPTER', 'CHARGE', 'CHASE', 'CHAT', 'CHEAP',
    'CHECK', 'CHEESE', 'CHEF', 'CHERRY', 'CHEST', 'CHICKEN', 'CHIEF',
    'CHILD', 'CHIMNEY', 'CHOICE', 'CHOOSE', 'CHRONIC', 'CHUCKLE', 'CHUNK',
    'CHURN', 'CIGAR', 'CINNAMON', 'CIRCLE', 'CITIZEN', 'CITY', 'CIVIL',
    'CLAIM', 'CLAP', 'CLARIFY', 'CLAW', 'CLAY', 'CLEAN', 'CLERK', 'CLEVER',
    'CLICK', 'CLIENT', 'CLIFF', 'CLIMB', 'CLINIC', 'CLIP', 'CLOCK', 'CLOG',
    'CLOSE', 'CLOTH', 'CLOUD', 'CLOWN', 'CLUB', 'CLUMP', 'CLUSTER',
    'CLUTCH', 'COACH', 'COAST', 'COCONUT', 'CODE', 'COFFEE', 'COIL', 'COIN',
    'COLLECT', 'COLOR', 'COLUMN', 'COMBINE', 'COME', 'COMFORT', 'COMIC',
    'COMMON', 'COMPANY', 'CONCERT', 'CONDUCT', 'CONFIRM', 'CONGRESS',
    'CONNECT', 'CONSIDER', 'CONTROL', 'CONVINCE', 'COOK', 'COOL', 'COPPER',
    'COPY', 'CORAL', 'CORE', 'CORN', 'CORRECT', 'COST', 'COTTON', 'COUCH',
    'COUNTRY', 'COUPLE', 'COURSE', 'COUSIN', 'COVER', 'COYOTE', 'CRACK',
    'CRADLE', 'CRAFT', 'CRAM', 'CRANE', 'CRASH', 'CRATER', 'CRAWL', 'CRAZY',
    'CREAM', 'CREDIT', 'CREEK', 'CREW', 'CRICKET', 'CRIME', 'CRISP',
    'CRITIC', 'CROP', 'CROSS', 'CROUCH', 'CROWD', 'CRUCIAL', 'CRUEL',
    'CRUISE', 'CRUMBLE', 'CRUNCH', 'CRUSH', 'CRY', 'CRYSTAL', 'CUBE',
    'CULTURE', 'CUP', 'CUPBOARD', 'CURIOUS', 'CURRENT', 'CURTAIN', 'CURVE',
    'CUSHION', 'CUSTOM', 'CUTE', 'CYCLE', 'DAD', 'DAMAGE', 'DAMP', 'DANCE',
    'DANGER', 'DARING', 'DASH', 'DAUGHTER', 'DAWN', 'DAY', 'DEAL', 'DEBATE',
    'DEBRIS', 'DECADE', 'DECEMBER', 'DECIDE', 'DECLINE', 'DECORATE',
    'DECREASE', 'DEER', 'DEFENSE', 'DEFINE', 'DEFY', 'DEGREE', 'DELAY',
    'DELIVER', 'DEMAND', 'DEMISE', 'DENIAL', 'DENTIST', 'DENY', 'DEPART',
    'DEPEND', 'DEPOSIT', 'DEPTH', 'DEPUTY', 'DERIVE', 'DESCRIBE', 'DESERT',
    'DESIGN', 'DESK', 'DESPAIR', 'DESTROY', 'DETAIL', 'DETECT', 'DEVELOP',
    'DEVICE', 'DEVOTE', 'DIAGRAM', 'DIAL', 'DIAMOND', 'DIARY', 'DICE',
    'DIESEL', 'DIET', 'DIFFER', 'DIGITAL', 'DIGNITY', 'DILEMMA', 'DINNER',
    'DINOSAUR', 'DIRECT', 'DIRT', 'DISAGREE', 'DISCOVER', 'DISEASE', 'DISH',
    'DISMISS', 'DISORDER', 'DISPLAY', 'DISTANCE', 'DIVERT', 'DIVIDE',
    'DIVORCE', 'DIZZY', 'DOCTOR', 'DOCUMENT', 'DOG', 'DOLL', 'DOLPHIN',
    'DOMAIN', 'DONATE', 'DONKEY', 'DONOR', 'DOOR', 'DOSE', 'DOUBLE', 'DOVE',
    'DRAFT', 'DRAGON', 'DRAMA', 'DRASTIC', 'DRAW', 'DREAM', 'DRESS',
    'DRIFT', 'DRILL', 'DRINK', 'DRIP', 'DRIVE', 'DROP', 'DRUM', 'DRY',
    'DUCK', 'DUMB', 'DUNE', 'DURING', 'DUST', 'DUTCH', 'DUTY', 'DWARF',
    'DYNAMIC', 'EAGER', 'EAGLE', 'EARLY', 'EARN', 'EARTH', 'EASILY', 'EAST',
    'EASY', 'ECHO', 'ECOLOGY', 'ECONOMY', 'EDGE', 'EDIT', 'EDUCATE',
    'EFFORT', 'EGG', 'EIGHT', 'EITHER', 'ELBOW', 'ELDER', 'ELECTRIC',
    'ELEGANT', 'ELEMENT', 'ELEPHANT', 'ELEVATOR', 'ELITE', 'ELSE', 'EMBARK',
    'EMBODY', 'EMBRACE', 'EMERGE', 'EMOTION', 'EMPLOY', 'EMPOWER', 'EMPTY',
    'ENABLE', 'ENACT', 'END', 'ENDLESS', 'ENDORSE', 'ENEMY', 'ENERGY',
    'ENFORCE', 'ENGAGE', 'ENGINE', 'ENHANCE', 'ENJOY', 'ENLIST', 'ENOUGH',
    'ENRICH', 'ENROLL', 'ENSURE', 'ENTER', 'ENTIRE', 'ENTRY', 'ENVELOPE',
    'EPISODE', 'EQUAL', 'EQUIP', 'ERA', 'ERASE', 'ERODE', 'EROSION',
    'ERROR', 'ERUPT', 'ESCAPE', 'ESSAY', 'ESSENCE', 'ESTATE', 'ETERNAL',
    'ETHICS', 'EVIDENCE', 'EVIL', 'EVOKE', 'EVOLVE', 'EXACT', 'EXAMPLE',
    'EXCESS', 'EXCHANGE', 'EXCITE', 'EXCLUDE', 'EXCUSE', 'EXECUTE',
    'EXERCISE', 'EXHAUST', 'EXHIBIT', 'EXILE', 'EXIST', 'EXIT', 'EXOTIC',
    'EXPAND', 'EXPECT', 'EXPIRE', 'EXPLAIN', 'EXPOSE', 'EXPRESS', 'EXTEND',
    'EXTRA', 'EYE', 'EYEBROW', 'FABRIC', 'FACE', 'FACULTY', 'FADE', 'FAINT',
    'FAITH', 'FALL', 'FALSE', 'FAME', 'FAMILY', 'FAMOUS', 'FAN', 'FANCY',
    'FANTASY', 'FARM', 'FASHION', 'FAT', 'FATAL', 'FATHER', 'FATIGUE',
    'FAULT', 'FAVORITE', 'FEATURE', 'FEBRUARY', 'FEDERAL', 'FEE', 'FEED',
    'FEEL', 'FEMALE', 'FENCE', 'FESTIVAL', 'FETCH', 'FEVER', 'FEW', 'FIBER',
    'FICTION', 'FIELD', 'FIGURE', 'FILE', 'FILM', 'FILTER', 'FINAL', 'FIND',
    'FINE', 'FINGER', 'FINISH', 'FIRE', 'FIRM', 'FIRST', 'FISCAL', 'FISH',
    'FIT', 'FITNESS', 'FIX', 'FLAG', 'FLAME', 'FLASH', 'FLAT', 'FLAVOR',
    'FLEE', 'FLIGHT', 'FLIP', 'FLOAT', 'FLOCK', 'FLOOR', 'FLOWER', 'FLUID',
    'FLUSH', 'FLY', 'FOAM', 'FOCUS', 'FOG', 'FOIL', 'FOLD', 'FOLLOW',
    'FOOD', 'FOOT', 'FORCE', 'FOREST', 'FORGET', 'FORK', 'FORTUNE', 'FORUM',
    'FORWARD', 'FOSSIL', 'FOSTER', 'FOUND', 'FOX', 'FRAGILE', 'FRAME',
    'FREQUENT', 'FRESH', 'FRIEND', 'FRINGE', 'FROG', 'FRONT', 'FROST',
    'FROWN', 'FROZEN', 'FRUIT', 'FUEL', 'FUN', 'FUNNY', 'FURNACE', 'FURY',
    'FUTURE', 'GADGET', 'GAIN', 'GALAXY', 'GALLERY', 'GAME', 'GAP',
    'GARAGE', 'GARBAGE', 'GARDEN', 'GARLIC', 'GARMENT', 'GAS', 'GASP',
    'GATE', 'GATHER', 'GAUGE', 'GAZE', 'GENERAL', 'GENIUS', 'GENRE',
    'GENTLE', 'GENUINE', 'GESTURE', 'GHOST', 'GIANT', 'GIFT', 'GIGGLE',
    'GINGER', 'GIRAFFE', 'GIRL', 'GIVE', 'GLAD', 'GLANCE', 'GLARE', 'GLASS',
    'GLIDE', 'GLIMPSE', 'GLOBE', 'GLOOM', 'GLORY', 'GLOVE', 'GLOW', 'GLUE',
    'GOAT', 'GODDESS', 'GOLD', 'GOOD', 'GOOSE', 'GORILLA', 'GOSPEL',
    'GOSSIP', 'GOVERN', 'GOWN', 'GRAB', 'GRACE', 'GRAIN', 'GRANT', 'GRAPE',
    'GRASS', 'GRAVITY', 'GREAT', 'GREEN', 'GRID', 'GRIEF', 'GRIT',
    'GROCERY', 'GROUP', 'GROW', 'GRUNT', 'GUARD', 'GUESS', 'GUIDE', 'GUILT',
    'GUITAR', 'GUN', 'GYM', 'HABIT', 'HAIR', 'HALF', 'HAMMER', 'HAMSTER',
    'HAND', 'HAPPY', 'HARBOR', 'HARD', 'HARSH', 'HARVEST', 'HAT', 'HAVE',
    'HAWK', 'HAZARD', 'HEAD', 'HEALTH', 'HEART', 'HEAVY', 'HEDGEHOG',
    'HEIGHT', 'HELLO', 'HELMET', 'HELP', 'HEN', 'HERO', 'HIDDEN', 'HIGH',
    'HILL', 'HINT', 'HIP', 'HIRE', 'HISTORY', 'HOBBY', 'HOCKEY', 'HOLD',
    'HOLE', 'HOLIDAY', 'HOLLOW', 'HOME', 'HONEY', 'HOOD', 'HOPE', 'HORN',
    'HORROR', 'HORSE', 'HOSPITAL', 'HOST', 'HOTEL', 'HOUR', 'HOVER', 'HUB',
    'HUGE', 'HUMAN', 'HUMBLE', 'HUMOR', 'HUNDRED', 'HUNGRY', 'HUNT',
    'HURDLE', 'HURRY', 'HURT', 'HUSBAND', 'HYBRID', 'ICE', 'ICON', 'IDEA',
    'IDENTIFY', 'IDLE', 'IGNORE', 'ILL', 'ILLEGAL', 'ILLNESS', 'IMAGE',
    'IMITATE', 'IMMENSE', 'IMMUNE', 'IMPACT', 'IMPOSE', 'IMPROVE',
    'IMPULSE', 'INCH', 'INCLUDE', 'INCOME', 'INCREASE', 'INDEX', 'INDICATE',
    'INDOOR', 'INDUSTRY', 'INFANT', 'INFLICT', 'INFORM', 'INHALE',
    'INHERIT', 'INITIAL', 'INJECT', 'INJURY', 'INMATE', 'INNER', 'INNOCENT',
    'INPUT', 'INQUIRY', 'INSANE', 'INSECT', 'INSIDE', 'INSPIRE', 'INSTALL',
    'INTACT', 'INTEREST', 'INTO', 'INVEST', 'INVITE', 'INVOLVE', 'IRON',
    'ISLAND', 'ISOLATE', 'ISSUE', 'ITEM', 'IVORY', 'JACKET', 'JAGUAR',
    'JAR', 'JAZZ', 'JEALOUS', 'JEANS', 'JELLY', 'JEWEL', 'JOB', 'JOIN',
    'JOKE', 'JOURNEY', 'JOY', 'JUDGE', 'JUICE', 'JUMP', 'JUNGLE', 'JUNIOR',
    'JUNK', 'JUST', 'KANGAROO', 'KEEN', 'KEEP', 'KETCHUP', 'KEY', 'KICK',
    'KID', 'KIDNEY', 'KIND', 'KINGDOM', 'KISS', 'KIT', 'KITCHEN', 'KITE',
    'KITTEN', 'KIWI', 'KNEE', 'KNIFE', 'KNOCK', 'KNOW', 'LAB', 'LABEL',
    'LABOR', 'LADDER', 'LADY', 'LAKE', 'LAMP', 'LANGUAGE', 'LAPTOP',
    'LARGE', 'LATER', 'LATIN', 'LAUGH', 'LAUNDRY', 'LAVA', 'LAW', 'LAWN',
    'LAWSUIT', 'LAYER', 'LAZY', 'LEADER', 'LEAF', 'LEARN', 'LEAVE',
    'LECTURE', 'LEFT', 'LEG', 'LEGAL', 'LEGEND', 'LEISURE', 'LEMON', 'LEND',
    'LENGTH', 'LENS', 'LEOPARD', 'LESSON', 'LETTER', 'LEVEL', 'LIAR',
    'LIBERTY', 'LIBRARY', 'LICENSE', 'LIFE', 'LIFT', 'LIGHT', 'LIKE',
    'LIMB', 'LIMIT', 'LINK', 'LION', 'LIQUID', 'LIST', 'LITTLE', 'LIVE',
    'LIZARD', 'LOAD', 'LOAN', 'LOBSTER', 'LOCAL', 'LOCK', 'LOGIC', 'LONELY',
    'LONG', 'LOOP', 'LOTTERY', 'LOUD', 'LOUNGE', 'LOVE', 'LOYAL', 'LUCKY',
    'LUGGAGE', 'LUMBER', 'LUNAR', 'LUNCH', 'LUXURY', 'LYRICS', 'MACHINE',
    'MAD', 'MAGIC', 'MAGNET', 'MAID', 'MAIL', 'MAIN', 'MAJOR', 'MAKE',
    'MAMMAL', 'MAN', 'MANAGE', 'MANDATE', 'MANGO', 'MANSION', 'MANUAL',
    'MAPLE', 'MARBLE', 'MARCH', 'MARGIN', 'MARINE', 'MARKET', 'MARRIAGE',
    'MASK', 'MASS', 'MASTER', 'MATCH', 'MATERIAL', 'MATH', 'MATRIX',
    'MATTER', 'MAXIMUM', 'MAZE', 'MEADOW', 'MEAN', 'MEASURE', 'MEAT',
    'MECHANIC', 'MEDAL', 'MEDIA', 'MELODY', 'MELT', 'MEMBER', 'MEMORY',
    'MENTION', 'MENU', 'MERCY', 'MERGE', 'MERIT', 'MERRY', 'MESH',
    'MESSAGE', 'METAL', 'METHOD', 'MIDDLE', 'MIDNIGHT', 'MILK', 'MILLION',
    'MIMIC', 'MIND', 'MINIMUM', 'MINOR', 'MINUTE', 'MIRACLE', 'MIRROR',
    'MISERY', 'MISS', 'MISTAKE', 'MIX', 'MIXED', 'MIXTURE', 'MOBILE',
    'MODEL', 'MODIFY', 'MOM', 'MOMENT', 'MONITOR', 'MONKEY', 'MONSTER',
    'MONTH', 'MOON', 'MORAL', 'MORE', 'MORNING', 'MOSQUITO', 'MOTHER',
    'MOTION', 'MOTOR', 'MOUNTAIN', 'MOUSE', 'MOVE', 'MOVIE', 'MUCH',
    'MUFFIN', 'MULE', 'MULTIPLY', 'MUSCLE', 'MUSEUM', 'MUSHROOM', 'MUSIC',
    'MUST', 'MUTUAL', 'MYSELF', 'MYSTERY', 'MYTH', 'NAIVE', 'NAME',
    'NAPKIN', 'NARROW', 'NASTY', 'NATION', 'NATURE', 'NEAR', 'NECK', 'NEED',
    'NEGATIVE', 'NEGLECT', 'NEITHER', 'NEPHEW', 'NERVE', 'NEST', 'NET',
    'NETWORK', 'NEUTRAL', 'NEVER', 'NEWS', 'NEXT', 'NICE', 'NIGHT', 'NOBLE',
    'NOISE', 'NOMINEE', 'NOODLE', 'NORMAL', 'NORTH', 'NOSE', 'NOTABLE',
    'NOTE', 'NOTHING', 'NOTICE', 'NOVEL', 'NOW', 'NUCLEAR', 'NUMBER',
    'NURSE', 'NUT', 'OAK', 'OBEY', 'OBJECT', 'OBLIGE', 'OBSCURE', 'OBSERVE',
    'OBTAIN', 'OBVIOUS', 'OCCUR', 'OCEAN', 'OCTOBER', 'ODOR', 'OFF',
    'OFFER', 'OFFICE', 'OFTEN', 'OIL', 'OKAY', 'OLD', 'OLIVE', 'OLYMPIC',
    'OMIT', 'ONCE', 'ONE', 'ONION', 'ONLINE', 'ONLY', 'OPEN', 'OPERA',
    'OPINION', 'OPPOSE', 'OPTION', 'ORANGE', 'ORBIT', 'ORCHARD', 'ORDER',
    'ORDINARY', 'ORGAN', 'ORIENT', 'ORIGINAL', 'ORPHAN', 'OSTRICH', 'OTHER',
    'OUTDOOR', 'OUTER', 'OUTPUT', 'OUTSIDE', 'OVAL', 'OVEN', 'OVER', 'OWN',
    'OWNER', 'OXYGEN', 'OYSTER', 'OZONE', 'PACT', 'PADDLE', 'PAGE', 'PAIR',
    'PALACE', 'PALM', 'PANDA', 'PANEL', 'PANIC', 'PANTHER', 'PAPER',
    'PARADE', 'PARENT', 'PARK', 'PARROT', 'PARTY', 'PASS', 'PATCH', 'PATH',
    'PATIENT', 'PATROL', 'PATTERN', 'PAUSE', 'PAVE', 'PAYMENT', 'PEACE',
    'PEANUT', 'PEAR', 'PEASANT', 'PELICAN', 'PEN', 'PENALTY', 'PENCIL',
    'PEOPLE', 'PEPPER', 'PERFECT', 'PERMIT', 'PERSON', 'PET', 'PHONE',
    'PHOTO', 'PHRASE', 'PHYSICAL', 'PIANO', 'PICNIC', 'PICTURE', 'PIECE',
    'PIG', 'PIGEON', 'PILL', 'PILOT', 'PINK', 'PIONEER', 'PIPE', 'PISTOL',
    'PITCH', 'PIZZA', 'PLACE', 'PLANET', 'PLASTIC', 'PLATE', 'PLAY',
    'PLEASE', 'PLEDGE', 'PLUCK', 'PLUG', 'PLUNGE', 'POEM', 'POET', 'POINT',
    'POLAR', 'POLE', 'POLICE', 'POND', 'PONY', 'POOL', 'POPULAR', 'PORTION',
    'POSITION', 'POSSIBLE', 'POST', 'POTATO', 'POTTERY', 'POVERTY',
    'POWDER', 'POWER', 'PRACTICE', 'PRAISE', 'PREDICT', 'PREFER', 'PREPARE',
    'PRESENT', 'PRETTY', 'PREVENT', 'PRICE', 'PRIDE', 'PRIMARY', 'PRINT',
    'PRIORITY', 'PRISON', 'PRIVATE', 'PRIZE', 'PROBLEM', 'PROCESS',
    'PRODUCE', 'PROFIT', 'PROGRAM', 'PROJECT', 'PROMOTE', 'PROOF',
    'PROPERTY', 'PROSPER', 'PROTECT', 'PROUD', 'PROVIDE', 'PUBLIC',
    'PUDDING', 'PULL', 'PULP', 'PULSE', 'PUMPKIN', 'PUNCH', 'PUPIL',
    'PUPPY', 'PURCHASE', 'PURITY', 'PURPOSE', 'PURSE', 'PUSH', 'PUT',
    'PUZZLE', 'PYRAMID', 'QUALITY', 'QUANTUM', 'QUARTER', 'QUESTION',
    'QUICK', 'QUIT', 'QUIZ', 'QUOTE', 'RABBIT', 'RACCOON', 'RACE', 'RACK',
    'RADAR', 'RADIO', 'RAIL', 'RAIN', 'RAISE', 'RALLY', 'RAMP', 'RANCH',
    'RANDOM', 'RANGE', 'RAPID', 'RARE', 'RATE', 'RATHER', 'RAVEN', 'RAW',
    'RAZOR', 'READY', 'REAL', 'REASON', 'REBEL', 'REBUILD', 'RECALL',
    'RECEIVE', 'RECIPE', 'RECORD', 'RECYCLE', 'REDUCE', 'REFLECT', 'REFORM',
    'REFUSE', 'REGION', 'REGRET', 'REGULAR', 'REJECT', 'RELAX', 'RELEASE',
    'RELIEF', 'RELY', 'REMAIN', 'REMEMBER', 'REMIND', 'REMOVE', 'RENDER',
    'RENEW', 'RENT', 'REOPEN', 'REPAIR', 'REPEAT', 'REPLACE', 'REPORT',
    'REQUIRE', 'RESCUE', 'RESEMBLE', 'RESIST', 'RESOURCE', 'RESPONSE',
    'RESULT', 'RETIRE', 'RETREAT', 'RETURN', 'REUNION', 'REVEAL', 'REVIEW',
    'REWARD', 'RHYTHM', 'RIB', 'RIBBON', 'RICE', 'RICH', 'RIDE', 'RIDGE',
    'RIFLE', 'RIGHT', 'RIGID', 'RING', 'RIOT', 'RIPPLE', 'RISK', 'RITUAL',
    'RIVAL', 'RIVER', 'ROAD', 'ROAST', 'ROBOT', 'ROBUST', 'ROCKET',
    'ROMANCE', 'ROOF', 'ROOKIE', 'ROOM', 'ROSE', 'ROTATE', 'ROUGH', 'ROUND',
    'ROUTE', 'ROYAL', 'RUBBER', 'RUDE', 'RUG', 'RULE', 'RUN', 'RUNWAY',
    'RURAL', 'SAD', 'SADDLE', 'SADNESS', 'SAFE', 'SAIL', 'SALAD', 'SALMON',
    'SALON', 'SALT', 'SALUTE', 'SAME', 'SAMPLE', 'SAND', 'SATISFY',
    'SATOSHI', 'SAUCE', 'SAUSAGE', 'SAVE', 'SAY', 'SCALE', 'SCAN', 'SCARE',
    'SCATTER', 'SCENE', 'SCHEME', 'SCHOOL', 'SCIENCE', 'SCISSORS',
    'SCORPION', 'SCOUT', 'SCRAP', 'SCREEN', 'SCRIPT', 'SCRUB', 'SEA',
    'SEARCH', 'SEASON', 'SEAT', 'SECOND', 'SECRET', 'SECTION', 'SECURITY',
    'SEED', 'SEEK', 'SEGMENT', 'SELECT', 'SELL', 'SEMINAR', 'SENIOR',
    'SENSE', 'SENTENCE', 'SERIES', 'SERVICE', 'SESSION', 'SETTLE', 'SETUP',
    'SEVEN', 'SHADOW', 'SHAFT', 'SHALLOW', 'SHARE', 'SHED', 'SHELL',
    'SHERIFF', 'SHIELD', 'SHIFT', 'SHINE', 'SHIP', 'SHIVER', 'SHOCK',
    'SHOE', 'SHOOT', 'SHOP', 'SHORT', 'SHOULDER', 'SHOVE', 'SHRIMP',
    'SHRUG', 'SHUFFLE', 'SHY', 'SIBLING', 'SICK', 'SIDE', 'SIEGE', 'SIGHT',
    'SIGN', 'SILENT', 'SILK', 'SILLY', 'SILVER', 'SIMILAR', 'SIMPLE',
    'SINCE', 'SING', 'SIREN', 'SISTER', 'SITUATE', 'SIX', 'SIZE', 'SKATE',
    'SKETCH', 'SKI', 'SKILL', 'SKIN', 'SKIRT', 'SKULL', 'SLAB', 'SLAM',
    'SLEEP', 'SLENDER', 'SLICE', 'SLIDE', 'SLIGHT', 'SLIM', 'SLOGAN',
    'SLOT', 'SLOW', 'SLUSH', 'SMALL', 'SMART', 'SMILE', 'SMOKE', 'SMOOTH',
    'SNACK', 'SNAKE', 'SNAP', 'SNIFF', 'SNOW', 'SOAP', 'SOCCER', 'SOCIAL',
    'SOCK', 'SODA', 'SOFT', 'SOLAR', 'SOLDIER', 'SOLID', 'SOLUTION',
    'SOLVE', 'SOMEONE', 'SONG', 'SOON', 'SORRY', 'SORT', 'SOUL', 'SOUND',
    'SOUP', 'SOURCE', 'SOUTH', 'SPACE', 'SPARE', 'SPATIAL', 'SPAWN',
    'SPEAK', 'SPECIAL', 'SPEED', 'SPELL', 'SPEND', 'SPHERE', 'SPICE',
    'SPIDER', 'SPIKE', 'SPIN', 'SPIRIT', 'SPLIT', 'SPOIL', 'SPONSOR',
    'SPOON', 'SPORT', 'SPOT', 'SPRAY', 'SPREAD', 'SPRING', 'SPY', 'SQUARE',
    'SQUEEZE', 'SQUIRREL', 'STABLE', 'STADIUM', 'STAFF', 'STAGE', 'STAIRS',
    'STAMP', 'STAND', 'START', 'STATE', 'STAY', 'STEAK', 'STEEL', 'STEM',
    'STEP', 'STEREO', 'STICK', 'STILL', 'STING', 'STOCK', 'STOMACH',
    'STONE', 'STOOL', 'STORY', 'STOVE', 'STRATEGY', 'STREET', 'STRIKE',
    'STRONG', 'STRUGGLE', 'STUDENT', 'STUFF', 'STUMBLE', 'STYLE', 'SUBJECT',
    'SUBMIT', 'SUBWAY', 'SUCCESS', 'SUCH', 'SUDDEN', 'SUFFER', 'SUGAR',
    'SUGGEST', 'SUIT', 'SUMMER', 'SUN', 'SUNNY', 'SUNSET', 'SUPER',
    'SUPPLY', 'SUPREME', 'SURE', 'SURFACE', 'SURGE', 'SURPRISE', 'SURROUND',
    'SURVEY', 'SUSPECT', 'SUSTAIN', 'SWALLOW', 'SWAMP', 'SWAP', 'SWARM',
    'SWEAR', 'SWEET', 'SWIFT', 'SWIM', 'SWING', 'SWITCH', 'SWORD', 'SYMBOL',
    'SYMPTOM', 'SYRUP', 'SYSTEM', 'TABLE', 'TACKLE', 'TAG', 'TAIL',
    'TALENT', 'TALK', 'TANK', 'TAPE', 'TARGET', 'TASK', 'TASTE', 'TATTOO',
    'TAXI', 'TEACH', 'TEAM', 'TELL', 'TEN', 'TENANT', 'TENNIS', 'TENT',
    'TERM', 'TEST', 'TEXT', 'THANK', 'THAT', 'THEME', 'THEN', 'THEORY',
    'THERE', 'THEY', 'THING', 'THIS', 'THOUGHT', 'THREE', 'THRIVE', 'THROW',
    'THUMB', 'THUNDER', 'TICKET', 'TIDE', 'TIGER', 'TILT', 'TIMBER', 'TIME',
    'TINY', 'TIP', 'TIRED', 'TISSUE', 'TITLE', 'TOAST', 'TOBACCO', 'TODAY',
    'TODDLER', 'TOE', 'TOGETHER', 'TOILET', 'TOKEN', 'TOMATO', 'TOMORROW',
    'TONE', 'TONGUE', 'TONIGHT', 'TOOL', 'TOOTH', 'TOP', 'TOPIC', 'TOPPLE',
    'TORCH', 'TORNADO', 'TORTOISE', 'TOSS', 'TOTAL', 'TOURIST', 'TOWARD',
    'TOWER', 'TOWN', 'TOY', 'TRACK', 'TRADE', 'TRAFFIC', 'TRAGIC', 'TRAIN',
    'TRANSFER', 'TRAP', 'TRASH', 'TRAVEL', 'TRAY', 'TREAT', 'TREE', 'TREND',
    'TRIAL', 'TRIBE', 'TRICK', 'TRIGGER', 'TRIM', 'TRIP', 'TROPHY',
    'TROUBLE', 'TRUCK', 'TRUE', 'TRULY', 'TRUMPET', 'TRUST', 'TRUTH', 'TRY',
    'TUBE', 'TUITION', 'TUMBLE', 'TUNA', 'TUNNEL', 'TURKEY', 'TURN',
    'TURTLE', 'TWELVE', 'TWENTY', 'TWICE', 'TWIN', 'TWIST', 'TWO', 'TYPE',
    'TYPICAL', 'UGLY', 'UMBRELLA', 'UNABLE', 'UNAWARE', 'UNCLE', 'UNCOVER',
    'UNDER', 'UNDO', 'UNFAIR', 'UNFOLD', 'UNHAPPY', 'UNIFORM', 'UNIQUE',
    'UNIT', 'UNIVERSE', 'UNKNOWN', 'UNLOCK', 'UNTIL', 'UNUSUAL', 'UNVEIL',
    'UPDATE', 'UPGRADE', 'UPHOLD', 'UPON', 'UPPER', 'UPSET', 'URBAN',
    'URGE', 'USAGE', 'USE', 'USED', 'USEFUL', 'USELESS', 'USUAL', 'UTILITY',
    'VACANT', 'VACUUM', 'VAGUE', 'VALID', 'VALLEY', 'VALVE', 'VAN',
    'VANISH', 'VAPOR', 'VARIOUS', 'VAST', 'VAULT', 'VEHICLE', 'VELVET',
    'VENDOR', 'VENTURE', 'VENUE', 'VERB', 'VERIFY', 'VERSION', 'VERY',
    'VESSEL', 'VETERAN', 'VIABLE', 'VIBRANT', 'VICIOUS', 'VICTORY', 'VIDEO',
    'VIEW', 'VILLAGE', 'VINTAGE', 'VIOLIN', 'VIRTUAL', 'VIRUS', 'VISA',
    'VISIT', 'VISUAL', 'VITAL', 'VIVID', 'VOCAL', 'VOICE', 'VOID',
    'VOLCANO', 'VOLUME', 'VOTE', 'VOYAGE', 'WAGE', 'WAGON', 'WAIT', 'WALK',
    'WALL', 'WALNUT', 'WANT', 'WARFARE', 'WARM', 'WARRIOR', 'WASH', 'WASP',
    'WASTE', 'WATER', 'WAVE', 'WAY', 'WEALTH', 'WEAPON', 'WEAR', 'WEASEL',
    'WEATHER', 'WEB', 'WEDDING', 'WEEKEND', 'WEIRD', 'WELCOME', 'WEST',
    'WET', 'WHALE', 'WHAT', 'WHEAT', 'WHEEL', 'WHEN', 'WHERE', 'WHIP',
    'WHISPER', 'WIDE', 'WIDTH', 'WIFE', 'WILD', 'WILL', 'WIN', 'WINDOW',
    'WINE', 'WING', 'WINK', 'WINNER', 'WINTER', 'WIRE', 'WISDOM', 'WISE',
    'WISH', 'WITNESS', 'WOLF', 'WOMAN', 'WONDER', 'WOOD', 'WOOL', 'WORD',
    'WORK', 'WORLD', 'WORRY', 'WORTH', 'WRAP', 'WRECK', 'WRESTLE', 'WRIST',
    'WRITE', 'WRONG', 'YARD', 'YEAR', 'YELLOW', 'YOU', 'YOUNG', 'YOUTH',
    'ZEBRA', 'ZERO', 'ZONE', 'ZOO'
];

/**
 * Functions to convert between recovery key format and raw keys.
 */
export const recovery = {
	keyToRecovery,
	recoveryToKey,
};
