import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useSocket } from "./useSocket";
import { DM, KeyStorage, ScheduledMessage } from "../types";
import { decryptMessageContent } from "./useMessageHistory";
import { useKeyStorage, useSharedKey } from "./useKeyStorage";
import { hexToText, unwrapServerResult } from "../utils";
import { makeDMsQueryKey } from "./useDMs";
import { decrypt } from "../crypto";

export const useScheduledMessages = (id: number) => {
	const socket = useSocket();
	const sharedKey = useSharedKey(id);

	return useQuery({
		queryKey: ["scheduled_messages", { id }],
		queryFn: async () => {
			const dm = await unwrapServerResult(socket.emitWithAck("get_dm", { id }));

			return (
				await Promise.all(
					Object.values(dm.scheduled_messages).map(async (m) => ({
						...m,
						message: await decrypt(sharedKey, m.message),
					}))
				)
			)
				.filter((m): m is ScheduledMessage => m.message !== false)
				.map((m) => ({
					...m,
					message: hexToText(m.message),
				}));
		},
		staleTime: 250,
	});
};
