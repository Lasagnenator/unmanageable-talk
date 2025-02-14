import { createStandaloneToast } from "@chakra-ui/react";
import { Options } from "@tauri-apps/api/notification";
import { bytesToHex, hexToBytes } from "./crypto";
import { DM, ServerResult } from "./types";

// Use `useToast` to create toasts in React components.
const { ToastContainer, toast } = createStandaloneToast();
export { ToastContainer, toast };

export type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {};

export const unwrapServerResult = async <T>(promise: Promise<ServerResult<T, string>>) => {
	const response = await promise;

	if (!response.success) {
		throw new Error(response.result);
	}

	return response.result;
};

export const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Console logs all parameters, then returns the final one. Useful to debug arrow functions.
export const dbg = (...objects: any[]) => {
	console.log(...objects);
	return objects.at(-1);
};

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export const textToHex = (t: string) => bytesToHex(TEXT_ENCODER.encode(t));
export const hexToText = (h: string) => TEXT_DECODER.decode(hexToBytes(h));

export const notify = async (options: Options) => {
	console.log("notification", options);

	toast({
		title: options.title,
		description: options.body,
		icon: options.icon,
		position: "top-right",
		isClosable: true,
		duration: 3000,
	});
};

export const isIndividualDM = (dm: DM) => {
	return dm.users.length === 2;
};

export const getOtherUser = (dm: DM, currentUser: string) => {
	if (!isIndividualDM(dm)) throw new Error("must be an individual DM to get other user's username");
	return dm.users.filter((u) => u !== currentUser)[0];
};

export const getDMName = (dm: DM, currentUser?: string) => {
	let users = dm.users;
	if (currentUser) {
		users = users.filter((u) => u !== currentUser);
	}
	return dm.name ?? users.join(", ");
};

export const SERVERS: RTCIceServer[] = [
	{ urls: "turn:3900.hamishwhc.com:3478", username: "turnuser", credential: "turn456" },
];

const LOCALE = "en-AU";
const TIMEZONE = "Australia/Sydney";

export const toDateTimeString = (date: string) => {
	// This is cursed, but I'm not adding a date handling library at this point.
	const TODAY = new Date().toLocaleDateString(LOCALE, {
		timeZone: TIMEZONE,
	});
	const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString(LOCALE, {
		timeZone: TIMEZONE,
	});

	const dateObj = new Date(`${date}Z`);
	let dateString = dateObj.toLocaleDateString(LOCALE, {
		timeZone: TIMEZONE,
	});

	if (dateString === TODAY) {
		dateString = "Today";
	} else if (dateString === YESTERDAY) {
		dateString = "Yesterday";
	}

	return (
		dateString +
		", " +
		dateObj.toLocaleTimeString(LOCALE, {
			timeZone: TIMEZONE,
		})
	);
};
