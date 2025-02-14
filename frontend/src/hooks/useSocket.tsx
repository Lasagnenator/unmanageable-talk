import React, { PropsWithChildren, useCallback, useContext, useEffect, useState } from "react";
import { Socket, io } from "socket.io-client";
import { DM, Message, ServerResult, TypingNotification, User, UserWithOwnStorage, X3DHNotification } from "../types";
import { Simplify } from "../utils";

// Some fancy TypeScript to convert a terser format (see below for examples) to the format that SIO wants.
// I was fed up with writing out the full format.
type TerseToSIOFormat<T extends Record<string, [any, any] | [any]>> = {
	[K in keyof T]: T[K] extends [infer Input, infer Output]
		? (data: Input, callback: (result: ServerResult<Output>) => void) => void
		: T[K] extends [infer Input]
		? (data: Input) => void
		: never;
};

type ServerToClientEvents = Simplify<
	TerseToSIOFormat<{
		profile_notification: [User];
		dm_notification: [DM];
		typing_notification: [TypingNotification];
		message_notification: [Message];
		message_change_notification: [Message];
		message_delete_notification: [number];
		x3dh_notification: [X3DHNotification];
		scheduled_soon_notification: [{ dm_id: number; schedule_id: number }];
		friend_request_notification: [{ username: string }];
		friend_request_accept_notification: [{ username: string; accept: boolean }];
	}>
>;

type ClientToServerEvents = Simplify<
	TerseToSIOFormat<{
		// <name>: [<input_type>, <output_type>];

		login: [{ username: string }, string];
		login_challenge_response: [{ response: string }, true];
		register: [{ username: string; public_key: string; spk: string; sig: string; own_storage: string }, true];
		username_exists: [{ username: string }, boolean];

		get_user: [{ username: string }, User];
		get_full_user: [{}, UserWithOwnStorage];
		get_user_list: [{}, User[]];
		set_user: [Partial<Omit<UserWithOwnStorage, "username" | "public_key">>, true];

		create_dm: [{ usernames: string[]; messages: { ek: string; spk: string }[]; key_tree: string[] }, number];
		get_dms: [{}, number[]];
		get_dm: [{ id: number }, DM];
		set_dm: [Pick<DM, "id"> & Partial<Pick<DM, "name">>, true];
		leave_dm: [{ id: number }, true];

		send_message: [{ id: number; message: string; signature: string; schedule: number; delete: number }, true];
		get_message: [{ id: number }, Message];
		get_message_history: [{ id: number; cursor: string; limit: number }, Message[]];
		get_pinned: [{ id: number }, Message[]];
		set_message: [Pick<Message, "id"> & Partial<Pick<Message, "message" | "signature" | "pinned">>, true];

		add_reaction: [{ id: number; reaction: string; signature: string }, number];
		remove_reaction: [{ id: number }, true];

		ping_typing: [{ id: number }, true];

		get_friends: [{}, string[]];
		send_friend_request: [{ username: string }, true];
		get_friend_requests: [{}, string[]];
		get_outgoing_requests: [{}, string[]];
		ack_friend_request: [{ username: string; accept: boolean }, true];
		unfriend: [{ username: string }, true];

		get_blocked: [{}, string[]];
		block_user: [{ username: string }, true];
		unblock: [{ username: string }, true];

		join_call: [{ id: number; uuid: string }, Record<string, string>];
		leave_call: [{ id: number }, true];
	}>
>;

// this is where we can add typesafe events later without having to change type definitions everywhere else.
export type SocketType = Socket<ServerToClientEvents, ClientToServerEvents>;

const SocketContext = React.createContext<{ socket: SocketType; reconnect: () => void } | null>(null);

export const useSocket = () => {
	const context = useContext(SocketContext);

	if (context === null) {
		throw new Error("`useSocket` has been called outside of a `SocketProvider` component.");
	}

	return context.socket;
};

export const useSocketContext = () => {
	return useContext(SocketContext);
};

export const useReconnect = () => {
	const context = useContext(SocketContext);

	if (context === null) {
		throw new Error("`useReconnect` has been called outside of a `SocketProvider` component.");
	}

	return context.socket;
};

export type SocketEffect = (socket: SocketType) => () => void;

export const SocketProvider = ({
	url,
	effects,
	children,
}: PropsWithChildren<{ effects?: SocketEffect[]; url: string }>) => {
	const [socket, setSocket] = useState<SocketType | null>(null);
	const [reset, setReset] = useState(0);
	const reconnect = useCallback(() => setReset((p) => p + 1), []);

	useEffect(() => {
		console.log("Creating socket client.");

		const socket = io(url, { autoConnect: false });
		setSocket(socket);

		socket.on("connect", async () => {
			console.log("Socket connected.");
		});

		socket.on("disconnect", (reason) => {
			console.log("Socket disconnect:", reason);
		});

		const cleanupFunctions = (effects ?? []).map((e) => e(socket));

		return () => {
			console.log("Disconnecting socket client.");
			socket.disconnect();
			setSocket(null);
			cleanupFunctions.forEach((cf) => cf());
		};
	}, [reset, effects]);

	return <SocketContext.Provider value={socket ? { socket, reconnect } : null}>{children}</SocketContext.Provider>;
};
