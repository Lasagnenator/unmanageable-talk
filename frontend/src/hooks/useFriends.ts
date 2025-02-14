import { useQuery } from "@tanstack/react-query";
import { unwrapServerResult } from "../utils";
import { useSocket } from "./useSocket";

export const useFriends = () => {
	const socket = useSocket();

	return useQuery({
		queryKey: ["friendsList"],
		queryFn: () => unwrapServerResult(socket.emitWithAck("get_friends", {})),
		staleTime: 2000,
	});
};
