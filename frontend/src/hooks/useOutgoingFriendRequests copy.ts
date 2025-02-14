import { useQuery } from "@tanstack/react-query";
import { unwrapServerResult } from "../utils";
import { useSocket } from "./useSocket";

export const useOutgoingFriendRequests = () => {
	const socket = useSocket();

	return useQuery({
		queryKey: ["outgoingFriendRequests"],
		queryFn: () => unwrapServerResult(socket.emitWithAck("get_outgoing_requests", {})),
		staleTime: 2000,
	});
};
