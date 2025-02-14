import { useInfiniteQuery } from "@tanstack/react-query";
import { decrypt } from "../crypto";
import { Message, Reaction } from "../types";
import { hexToText, unwrapServerResult } from "../utils";
import { useKeyStorage, useSharedKey } from "./useKeyStorage";
import { useSocket } from "./useSocket";

const MESSAGE_HISTORY_PAGE_SIZE = 50;

export const decryptMessageContent = async (m: Message, key: string) => {
	const [message, reactions] = await Promise.all([
		decrypt(key, m.message),
		Promise.all(
			m.reactions.map(async (r) => {
				const decrypted = await decrypt(key, r.reaction);
				return decrypted ? { ...r, reaction: hexToText(decrypted) } : false;
			})
		),
	]);
	if (!message) return false;
	return { ...m, message: hexToText(message), reactions: reactions.filter((r): r is Reaction => r !== false) };
};

export const useMessageHistory = (id: number) => {
	const socket = useSocket();
	const sharedKey = useSharedKey(id);

	return useInfiniteQuery({
		queryKey: ["messages", { id }] as const,
		queryFn: async ({ pageParam }) => {
			const messages = await unwrapServerResult(
				socket.emitWithAck("get_message_history", {
					id,
					cursor: pageParam ?? new Date().toISOString(),
					limit: MESSAGE_HISTORY_PAGE_SIZE,
				})
			);

			return (await Promise.all(messages.map((m) => decryptMessageContent(m, sharedKey)))).filter(
				(m): m is Message => m !== false
			);
		},
		getNextPageParam: (lastPage) => lastPage.at(MESSAGE_HISTORY_PAGE_SIZE - 1)?.timestamp,
		enabled: sharedKey !== null,
	});
};
