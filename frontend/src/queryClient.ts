import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "./utils";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// By default, we consider all data to be valid for 5 minutes, being incrementally updated by the socket connection.
			// After 5 minutes, we consider the data stale and RQ will refetch the data.
			staleTime: 5 * 60 * 1000,
			useErrorBoundary: true,
		},
	},
	mutationCache: new MutationCache({
		onError: (error) => {
			if (error instanceof Error) {
				console.error(error);
				toast({ title: "Something went wrong!", description: error.message, status: "error" });
			}
		},
	}),
	queryCache: new QueryCache({
		onError: (error, query) => {
			if (query.state.data !== undefined && error instanceof Error) {
				console.error(error);
				toast({ title: "Something went wrong!", description: error.message, status: "error" });
			}
		},
	}),
});
