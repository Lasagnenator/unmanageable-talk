import {
	MutableRefObject,
	PropsWithChildren,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { generateChallengeResponse } from "../crypto";
import { queryClient } from "../queryClient";
import { CurrentUser, ServerResult } from "../types";
import { SocketType, useSocketContext } from "./useSocket";

type ActiveSessionState = { user: CurrentUser; active: true };
type InactiveSessionState = { user: CurrentUser | null; active: false };
type SessionState = ActiveSessionState | InactiveSessionState;

const SessionContext = createContext<
	| ((
			| (ActiveSessionState & { logout: () => void })
			| (InactiveSessionState & { login: (socket: SocketType, user: CurrentUser) => Promise<ServerResult<boolean>> })
	  ) & {
			userRef: MutableRefObject<CurrentUser | null>;
	  })
	| null
>(null);

export const useSession = () => {
	const context = useContext(SessionContext);

	if (context === null) {
		throw new Error("`useSession` has been called outside of a `CurrentUserProvider` component.");
	}

	return context;
};

export const useActiveSession = () => {
	const session = useSession();

	if (!session.active) {
		throw new Error("`useActiveSession` has been called without confirming there is an active session.");
	}

	return session;
};

export const useCurrentUser = () => {
	const session = useActiveSession();
	return session.user;
};

export const SessionProvider = ({ children }: PropsWithChildren<{}>) => {
	const socketContext = useSocketContext();
	const [session, setSession] = useState<SessionState>(() => ({
		active: false,
		user: JSON.parse(localStorage.getItem("user") ?? "null"),
	}));
	const userRef = useRef(session.user);

	useEffect(() => {
		console.log("Updating local storage and user ref:", session.user?.username ?? null);
		if (session.user) {
			localStorage.setItem("user", JSON.stringify(session.user));
		} else {
			localStorage.removeItem("user");
		}
		userRef.current = session.user;
	}, [session.user]);

	const login = useCallback(async (socket: SocketType, user: CurrentUser) => {
		const challenge = await socket.emitWithAck("login", { username: user.username });
		if (!challenge.success) {
			console.log("Login failed:", challenge.result);
			setSession({ active: false, user: null });
			return challenge;
		}

		const login = await socket.emitWithAck("login_challenge_response", {
			response: generateChallengeResponse(user.privateKey, challenge.result),
		});
		if (!login.success) {
			console.log("Login (challenge response) failed:", login.result);
		} else {
			console.log("Login succeeded:", user.username);
		}

		setSession(login.success ? { user, active: true } : { user: null, active: false });
		return login;
	}, []);

	const markSessionInactive = useCallback(() => setSession((p) => ({ ...p, active: false })), []);
	const logout = useCallback(() => {
		console.log("Logging out.");
		setSession({ active: false, user: null });
		socketContext?.reconnect();
		queryClient.removeQueries();
	}, [socketContext]);

	useEffect(() => {
		markSessionInactive();
		if (socketContext) {
			const socket = socketContext.socket;

			socket.on("connect", async () => {
				if (userRef.current) {
					console.log("Attempting re-login from stored credentials.");
					await login(socket, userRef.current);
				}
			});

			socket.on("disconnect", (reason) => {
				markSessionInactive();
			});

			return () => {
				markSessionInactive();
			};
		}
	}, [socketContext, login, userRef]);

	return (
		<SessionContext.Provider value={session.active ? { ...session, userRef, logout } : { ...session, userRef, login }}>
			{children}
		</SessionContext.Provider>
	);
};
