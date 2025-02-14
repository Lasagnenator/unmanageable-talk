import { useQuery } from "@tanstack/react-query";
import { useSocket } from "./useSocket";
import { unwrapServerResult } from "../utils";

export const useUsernameTaken = (username: string) => {
	const socket = useSocket();
	return useQuery({
		queryKey: ["usernameTaken", { username }] as const,
		queryFn: () => unwrapServerResult(socket.emitWithAck("username_exists", { username })),
		staleTime: 20000,
	});
};
