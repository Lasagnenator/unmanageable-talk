import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "./useCurrentUser";
import { useSocket } from "./useSocket";
import { unwrapServerResult } from "../utils";

export const useUserSearch = (search: string, enabled?: boolean) => {
	const socket = useSocket();
	const currentUser = useCurrentUser();

	return useQuery({
		queryKey: ["userSearch"],
		queryFn: async () => {
			const users = await unwrapServerResult(socket.emitWithAck("get_user_list", {}));
			return users.filter((user) => currentUser.username !== user.username);
		},
		enabled,
		select: (users) => users.filter(({ username }) => username.toLowerCase().includes(search.toLowerCase())),
		staleTime: 2000,
	});
};
