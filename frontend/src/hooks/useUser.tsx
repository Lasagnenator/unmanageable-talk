import { useQuery } from "@tanstack/react-query";
import { unwrapServerResult } from "../utils";
import { SocketType, useSocket } from "./useSocket";

export const makeUserQuery = (socket: SocketType, username: string) => ({
	queryKey: ["user", { username }],
	queryFn: async () =>
		unwrapServerResult(
			socket.emitWithAck("get_user", {
				username,
			})
		),
});

export const useUser = (username: string) => {
	const socket = useSocket();
	return useQuery(makeUserQuery(socket, username));
};
