import { Center, Spinner } from "@chakra-ui/react";
import { Redirect, Route, Switch } from "wouter";
import { useSession } from "./hooks/useCurrentUser";
import { useKeyStorageContext } from "./hooks/useKeyStorage";
import { useSocketContext } from "./hooks/useSocket";
import { CallView } from "./views/chat/CallView";
import { ChatView } from "./views/chat/ChatView";
import { EditProfileView } from "./views/chat/EditProfileView";
import { LoginView } from "./views/login/LoginView";
import { WelcomeView } from "./views/login/WelcomeView";
import { RegisterView } from "./views/register/RegisterView";
import { useEffect } from "react";
import { CallProvider } from "./hooks/useCall";

export const App = () => {
	const socketContext = useSocketContext();
	const session = useSession();
	const { keyStorage } = useKeyStorageContext();

	useEffect(() => {
		socketContext?.socket.connect();
	}, [socketContext]);

	if (!socketContext || (!session.active && session.user) || (session.active && !keyStorage)) {
		return (
			<Center h="full" overflow="hidden">
				<Spinner size="xl" />
			</Center>
		);
	}

	if (session.active) {
		return (
			<CallProvider peerjsServer={""}>
				<Switch>
					<Route path="/chat/:rest*" component={ChatView} />
					<Route path="/call" component={CallView} />
					<Route path="/profile" component={EditProfileView} />
					<Route>
						<Redirect to="/chat" />
					</Route>
				</Switch>
			</CallProvider>
		);
	} else {
		console.log("app", session);

		return (
			<Switch>
				<Route path="/" component={WelcomeView} />
				<Route
					path="/login"
					component={() => <LoginView login={(user) => session.login(socketContext.socket, user)} />}
				/>
				<Route
					path="/register"
					component={() => <RegisterView login={(user) => session.login(socketContext.socket, user)} />}
				/>
				<Route>
					<Redirect to="/" />
				</Route>
			</Switch>
		);
	}
};
