import { useQueries } from "@tanstack/react-query";
import { useCallback } from "react";
import { useSocket } from "./useSocket";
import { makeUserQuery } from "./useUser";

export const useUsers = (usernames: string[]) => {
	const socket = useSocket();
	const makeQuery = useCallback((username: string) => makeUserQuery(socket, username), [socket]);

	return useQueries({
		queries: usernames.map(makeQuery),
	});
};
