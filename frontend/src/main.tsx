import { ChakraProvider, ColorModeScript, extendTheme } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "react-error-boundary";
import { App } from "./App";
import { ErrorPage } from "./ErrorPage";
import { NotificationHandlers } from "./NotificationHandlers";
import { SessionProvider } from "./hooks/useCurrentUser";
import { KeyStorageProvider } from "./hooks/useKeyStorage";
import { SocketProvider } from "./hooks/useSocket";
import { queryClient } from "./queryClient";
import { ToastContainer } from "./utils";

const config = {
	initialColorMode: "system",
	useSystemColorMode: true,
};

const theme = extendTheme({ config });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<ChakraProvider theme={theme}>
			<ColorModeScript initialColorMode={theme.config.initialColorMode} />
			<QueryClientProvider client={queryClient}>
				<ErrorBoundary fallbackRender={ErrorPage}>
					<SocketProvider url={import.meta.env.VITE_SOCKET_URL ?? "http://localhost:5000"}>
						<SessionProvider>
							<KeyStorageProvider>
								<NotificationHandlers>
									<App />
								</NotificationHandlers>
							</KeyStorageProvider>
						</SessionProvider>
					</SocketProvider>
				</ErrorBoundary>
				<ToastContainer />
			</QueryClientProvider>
		</ChakraProvider>
	</React.StrictMode>
);
