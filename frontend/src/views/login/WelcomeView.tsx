import { Button, HStack, Heading, Image, Text, VStack } from "@chakra-ui/react";
import { useLocation } from "wouter";
import logo from "../../assets/logo.png";
import { AuthView } from "../AuthView";

export const WelcomeView = () => {
	const [location, setLocation] = useLocation();

	return (
		<AuthView>
			<VStack gap={4}>
				<Heading>Unmanageable</Heading>
				<Image borderRadius="full" boxSize="70" src={logo} />
				<Text fontSize="sm">We keep your data secure!</Text>
				<HStack gap={8}>
					<Button onClick={() => setLocation("/login")}>Login</Button>
					<Button onClick={() => setLocation("/register")}>Register</Button>
				</HStack>
			</VStack>
		</AuthView>
	);
};
