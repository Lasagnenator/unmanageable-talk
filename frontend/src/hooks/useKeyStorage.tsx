import { useQuery } from "@tanstack/react-query";
import { decrypt, encrypt, generateChallengeResponse, generatePersonalKey, getPublicKey, signature } from "../crypto";
import { queryClient } from "../queryClient";
import { CurrentUser, KeyStorage, ServerResult } from "../types";
import { delay, hexToText, textToHex, unwrapServerResult } from "../utils";
import { useCurrentUser, useSession } from "./useCurrentUser";
import { SocketEffect, SocketType, useSocket, useSocketContext } from "./useSocket";
import { SessionState } from "http2";
import {
	createContext,
	MutableRefObject,
	useContext,
	ReactNode,
	useState,
	useRef,
	useEffect,
	useCallback,
	RefObject,
	PropsWithChildren,
} from "react";

export const decryptKeyStorage = async (own_storage: string, privateKey: string) => {
	const key = generatePersonalKey(privateKey);
	if (own_storage === "") {
		debugger;
		throw new Error("own storage is invalid: empty");
	}
	const jsonHex = await decrypt(key, own_storage);
	if (!jsonHex) {
		debugger;
		throw new Error(`own storage is invalid: cannot decrypt`);
	}

	let keyStorage;
	try {
		keyStorage = JSON.parse(hexToText(jsonHex));
	} catch {
		throw new Error(`own storage is invalid: ${jsonHex}`);
	}

	return keyStorage as KeyStorage;
};

export const encryptKeyStorage = async (keyStorage: KeyStorage, privateKey: string) => {
	const key = generatePersonalKey(privateKey);
	const own_storage = await encrypt(key, textToHex(JSON.stringify(keyStorage)));
	return own_storage;
};

const KeyStorageContext = createContext<{
	keyStorage: KeyStorage | null;
	addSharedKey: (dm_id: number, key: string) => Promise<void>;
	addSharedKeyRef: RefObject<(dm_id: number, key: string) => Promise<void>>;
	keyStorageRef: RefObject<KeyStorage>;
} | null>(null);

export const useKeyStorageContext = () => {
	const context = useContext(KeyStorageContext);

	if (context === null) {
		throw new Error("`useKeyStorageContext` has been called outside of a `KeyStorageProvider` component.");
	}

	return context;
};

export const useKeyStorage = () => {
	const context = useKeyStorageContext();

	// IDK why this is necessary but TS is insisting.
	const keyStorage = context.keyStorage;
	if (keyStorage === null) {
		throw new Error("`useKeyStorage` has been called when there is no key storage.");
	}

	return { ...context, keyStorage };
};

export const useSharedKey = (dm_id: number) => {
	const storage = useKeyStorage();
	return storage.keyStorage.sharedKeys[dm_id] ?? null;
};

const LOCK_DELAY_MS = 100;

const useLock = () => {
	const ref = useRef(false);

	const acquire = useCallback(async () => {
		console.log("Attempting to acquire key storage lock...");
		while (ref.current) await delay(LOCK_DELAY_MS);
		ref.current = true;
		console.log("Key storage lock acquired.");
		return () => {
			console.log("Key storage lock released.");
			ref.current = false;
		};
	}, []);

	return acquire;
};

export const KeyStorageProvider = ({ children }: PropsWithChildren<{}>) => {
	const socket = useSocketContext();
	const session = useSession();
	const [keyStorage, setKeyStorage] = useState<KeyStorage | null>(null);
	const keyStorageRef = useRef(keyStorage);
	const acquire = useLock();

	useEffect(() => {
		console.log("Updating key storage ref.");
		keyStorageRef.current = keyStorage;
	}, [keyStorage]);

	useEffect(() => {
		console.log(
			`Updating own_storage due to change in session (active: ${session.active}, user: ${
				session.user?.username ?? null
			}).`
		);

		if (socket && session.active) {
			const update = async () => {
				const release = await acquire();

				console.log("Initialising key storage cache with remote.");
				const { own_storage } = await unwrapServerResult(socket.socket.emitWithAck("get_full_user", {}));
				const keyStorage = await decryptKeyStorage(own_storage, session.user.privateKey);

				setKeyStorage(keyStorage);

				release();
			};

			update();
		} else {
			setKeyStorage(null);
		}
	}, [socket, session.active, session.user]);

	const addSharedKey = useCallback(
		async (dm_id: number, key: string) => {
			if (!socket || !session.active)
				throw new Error("Cannot add shared key without a connected socket and an active session.");
			const release = await acquire();

			console.log(`Adding shared key for DM ${dm_id}.`);
			const { own_storage } = await unwrapServerResult(socket.socket.emitWithAck("get_full_user", {}));
			const keyStorage = await decryptKeyStorage(own_storage, session.user.privateKey);

			keyStorage.sharedKeys[dm_id] = key;

			const encrypted = await encryptKeyStorage(keyStorage, session.user.privateKey);
			await unwrapServerResult(socket.socket.emitWithAck("set_user", { own_storage: encrypted }));

			setKeyStorage(keyStorage);

			release();
		},
		[socket, session]
	);

	const addSharedKeyRef = useRef(addSharedKey);

	useEffect(() => {
		addSharedKeyRef.current = addSharedKey;
	}, [addSharedKey]);

	return (
		<KeyStorageContext.Provider
			value={{ keyStorage: socket && session.active ? keyStorage : null, keyStorageRef, addSharedKey, addSharedKeyRef }}
		>
			{children}
		</KeyStorageContext.Provider>
	);
};
