import { Button, FormControl, FormErrorMessage, FormHelperText, Heading, Input, Link, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { useLocation } from "wouter";
import { useUsernameTaken } from "../../hooks/useUsernameTaken";

export const UsernameSelection = ({ onRegister }: { onRegister: (username: string) => Promise<boolean> }) => {
	const [location, setLocation] = useLocation();

	const [username, setUsername] = useState("");
	const usernameTakenQuery = useUsernameTaken(username);
	const usernameInvalid = usernameTakenQuery.data || username.length < 3;

	const [loading, setLoading] = useState(false);
	const handleRegister = async () => {
		setLoading(true);
		const success = await onRegister(username);
		if (!success) {
			setLoading(false);
		}
	};

	return (
		<VStack spacing={4} align="stretch">
			<Heading textAlign="center" size="lg" mb={2}>
				Register!
			</Heading>

			<FormControl isInvalid={!!username && usernameInvalid}>
				<Input
					placeholder="Enter Username"
					value={username}
					variant="filled"
					size="lg"
					isRequired
					isDisabled={loading}
					onChange={(event) => setUsername(event.target.value)}
				/>
				{!usernameInvalid ? (
					<FormHelperText>That username is available!</FormHelperText>
				) : (
					<FormErrorMessage>{username.length < 3 ? "Too short!" : "That username has been taken!"}</FormErrorMessage>
				)}
			</FormControl>
			<Link onClick={() => setLocation("/login")} size="sm" color="teal.500" as="ins">
				Already got an account? Click here to login.
			</Link>
			<Button
				colorScheme="teal"
				size="lg"
				variant="outline"
				width="full"
				isLoading={loading || usernameTakenQuery.isFetching}
				isDisabled={usernameInvalid}
				onClick={handleRegister}
			>
				Register
			</Button>
		</VStack>
	);
};
