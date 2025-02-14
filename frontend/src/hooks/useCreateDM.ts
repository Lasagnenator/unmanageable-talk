import { useMutation } from "@tanstack/react-query";
import { createGroupDM } from "../crypto";
import { queryClient } from "../queryClient";
import { unwrapServerResult } from "../utils";
import { useCurrentUser } from "./useCurrentUser";
import { useKeyStorage } from "./useKeyStorage";
import { useSocket } from "./useSocket";

export const useCreateDM = (onSuccess: () => void) => {
	const socket = useSocket();
	const currentUser = useCurrentUser();
	const { addSharedKey } = useKeyStorage();
	return useMutation({
		mutationFn: async (usernames: string[]) => {
			const keyBundles = await Promise.all(
				usernames.map(async (username) => {
					const { public_key: ik, spk, sig } = await unwrapServerResult(socket.emitWithAck("get_user", { username }));
					if (!spk || !sig) {
						throw new Error(
							`Create group DM error: ${username} has an invalid key bundle: ${JSON.stringify({ ik, spk, sig })}`
						);
					}
					return { ik, spk, sig };
				})
			);

			const result = createGroupDM(currentUser.privateKey, keyBundles);
			if (!result) {
				throw new Error("Create group DM error: Call to createGroupDM failed.");
			}
			const { sharedKey, keyTree: key_tree, messages } = result;

			const dm_id = await unwrapServerResult(socket.emitWithAck("create_dm", { usernames, key_tree, messages }));

			await addSharedKey(dm_id, sharedKey);

			return dm_id;
		},
		onSuccess: () => {
			queryClient.invalidateQueries(["keyStorage"]);
			queryClient.invalidateQueries({ queryKey: ["dmsList"] });
			onSuccess();
		},
	});
};
