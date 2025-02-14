import { useQuery } from "@tanstack/react-query";
import { unwrapServerResult } from "../utils";
import { useSocket } from "./useSocket";

export const useFriendRequests = () => {
	const socket = useSocket();

	return useQuery({
		queryKey: ["friendRequests"],
		queryFn: () => unwrapServerResult(socket.emitWithAck("get_friend_requests", {})),
		staleTime: 2000,
	});
};
