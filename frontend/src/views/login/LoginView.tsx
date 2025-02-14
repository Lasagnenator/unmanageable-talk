import {
	Alert,
	AlertDescription,
	AlertIcon,
	AlertTitle,
	Button,
	FormControl,
	FormErrorMessage,
	Heading,
	Input,
	Link,
	VStack,
} from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { recoveryToKey } from "../../crypto";
import { CurrentUser, ServerResult } from "../../types";
import { AuthView } from "../AuthView";

export const LoginView = ({ login }: { login: (user: CurrentUser) => Promise<ServerResult<boolean>> }) => {
	const [username, setUsername] = useState("");
	const [recoveryKey, setRecoveryKey] = useState("");
	const privateKey = useMemo(() => recoveryToKey(recoveryKey), [recoveryKey]);

	const [location, setLocation] = useLocation();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleClick = async () => {
		if (!privateKey) throw new Error("cannot attempt login if the private key is invalid.");

		setLoading(true);
		setError(null);

		const { success, result } = await login({ username, privateKey });
		if (success) {
			setLocation("/chat");
		} else {
			setError(result);
			setLoading(false);
		}
	};

	return (
		<AuthView back={{ href: "/welcome", label: "Back to Homepage" }}>
			<VStack spacing={4} align="stretch">
				<Heading textAlign="center" size="lg" mb={2}>
					Login!
				</Heading>

				<Input
					placeholder="Enter Username"
					value={username}
					variant="filled"
					size="lg"
					isRequired
					isDisabled={loading}
					onChange={(event) => setUsername(event.target.value)}
				/>
				<FormControl isInvalid={!!recoveryKey && !privateKey}>
					<Input
						placeholder="Paste Recovery Key"
						value={recoveryKey}
						variant="filled"
						size="lg"
						isRequired
						isDisabled={loading}
						type="password"
						onChange={(event) => setRecoveryKey(event.target.value)}
					/>
					<FormErrorMessage>Invalid recovery key!</FormErrorMessage>
				</FormControl>
				{error && (
					<Alert status="error">
						<AlertIcon />
						<AlertTitle>Incorrect Username or Recovery Key!</AlertTitle>
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<Link onClick={() => setLocation("/register")} size="sm" color="teal.500" as="ins">
					Don't have an account? Register Now!
				</Link>
				<Button onClick={handleClick} isDisabled={!privateKey || loading}>
					Login
				</Button>
			</VStack>
		</AuthView>
	);
};
