import { useQuery } from "@tanstack/react-query";
import { Message } from "../types";
import { useKeyStorage, useSharedKey } from "./useKeyStorage";
import { decryptMessageContent } from "./useMessageHistory";
import { useSocket } from "./useSocket";
import { unwrapServerResult } from "../utils";

export const usePinnedMessages = (id: number) => {
	const socket = useSocket();
	const sharedKey = useSharedKey(id);

	return useQuery({
		queryKey: ["pinnedMessages", { id }] as const,
		queryFn: async () => {
			const messages = await unwrapServerResult(socket.emitWithAck("get_pinned", { id }));

			return (await Promise.all(messages.map((m) => decryptMessageContent(m, sharedKey)))).filter(
				(m): m is Message => m !== false
			);
		},
		enabled: sharedKey !== null,
	});
};
