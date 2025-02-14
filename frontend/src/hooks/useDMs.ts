import { useQuery } from "@tanstack/react-query";
import { useSocket } from "./useSocket";
import { DM, KeyStorage } from "../types";
import { decryptMessageContent } from "./useMessageHistory";
import { useKeyStorage } from "./useKeyStorage";
import { unwrapServerResult } from "../utils";

// The list of DMs (decrypted) depends on the data returned by the key storage query,
// so this data needs to be included in the query key. Rather than copy this code to the places that use it
// (notably the message_notification handler), this function generates it based on the provided key storage.
export const makeDMsQueryKey = (keyStorage?: KeyStorage) => {
	return ["dmsList", { sharedKeys: [...Object.keys(keyStorage?.sharedKeys ?? {})] }];
};

export const useDMs = () => {
	const socket = useSocket();
	const { keyStorage } = useKeyStorage();

	return useQuery({
		queryKey: makeDMsQueryKey(keyStorage),
		queryFn: async () => {
			const dmIds = await unwrapServerResult(socket.emitWithAck("get_dms", {}));
			const dms = await Promise.all(dmIds.map((id) => unwrapServerResult(socket.emitWithAck("get_dm", { id }))));
			const decrypted = await Promise.all(
				dms
					// We may receive data from the server containing DMs that we cannot decrypt with our current
					// key storage, so filter out DMs for which we are missing keys.
					.filter((dm) => keyStorage.sharedKeys[dm.id] !== undefined)
					.map(async (dm) => ({
						...dm,
						latest_message:
							(dm.latest_message && (await decryptMessageContent(dm.latest_message, keyStorage.sharedKeys[dm.id]))) ||
							null,
					}))
			);
			return decrypted;
		},
		select: (data: DM[]) =>
			data.sort((a, b) =>
				(a.latest_message?.timestamp ?? a.created_at) < (b.latest_message?.timestamp ?? b.created_at) ? 1 : -1
			),
		keepPreviousData: true,
	});
};
