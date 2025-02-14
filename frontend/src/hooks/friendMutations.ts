import { useMutation } from "@tanstack/react-query";
import { queryClient } from "../queryClient";
import { unwrapServerResult } from "../utils";
import { useSocket } from "./useSocket";

export const useSendFriendRequestMutation = (onSuccess?: () => void) => {
	const socket = useSocket();
	return useMutation({
		mutationFn: async (username: string) => unwrapServerResult(socket.emitWithAck("send_friend_request", { username })),
		onSuccess: (_, username) => {
			queryClient.setQueryData<string[]>(["outgoingFriendRequests"], (prev) => [...(prev ?? []), username]);
			onSuccess?.();
		},
	});
};

export const useUnfriendMutation = (onSuccess?: () => void) => {
	const socket = useSocket();
	return useMutation({
		mutationFn: (username: string) => unwrapServerResult(socket.emitWithAck("unfriend", { username })),
		onSuccess: (_, username) => {
			queryClient.setQueryData<string[]>(["friendsList"], (prev) => prev?.filter((u) => u !== username) ?? []);
			onSuccess?.();
		},
	});
};

export const useAckFriendRequestMutation = (onSuccess?: () => void) => {
	const socket = useSocket();
	return useMutation({
		mutationFn: async (vars: { username: string; accept: boolean }) =>
			unwrapServerResult(socket.emitWithAck("ack_friend_request", vars)),
		onSuccess: (_, { username, accept }) => {
			queryClient.setQueryData<string[]>(["friendsList"], (prev) =>
				accept ? [...(prev ?? []), username] : prev?.filter((u) => u !== username) ?? []
			);
			queryClient.setQueryData<string[]>(["friendRequests"], (prev) => prev?.filter((u) => u !== username) ?? []);
			onSuccess?.();
		},
	});
};
