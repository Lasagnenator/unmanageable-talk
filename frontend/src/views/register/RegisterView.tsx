import { useToast } from "@chakra-ui/react";
import { useState } from "react";
import { useLocation } from "wouter";
import { generatePrivateKey, getPublicKey, signature } from "../../crypto";
import { encryptKeyStorage } from "../../hooks/useKeyStorage";
import { useSocket } from "../../hooks/useSocket";
import { CurrentUser, ServerResult } from "../../types";
import { AuthView } from "../AuthView";
import { RecoveryKeyConfirmation } from "./RecoveryKeyConfirmation";
import { UsernameSelection } from "./UsernameSelection";

export const RegisterView = ({ login }: { login: (user: CurrentUser) => Promise<ServerResult<boolean>> }) => {
	const [user, setUser] = useState<CurrentUser | null>(null);

	const [location, setLocation] = useLocation();
	const toast = useToast();
	const socket = useSocket();

	const onRegister = async (username: string) => {
		const user = { username, privateKey: generatePrivateKey() };

		const privSPK = generatePrivateKey();
		const spk = getPublicKey(privSPK);
		const sig = signature(user.privateKey, spk);

		const own_storage = await encryptKeyStorage({ privSPK, sharedKeys: {} }, user.privateKey);

		const result = await socket.emitWithAck("register", {
			username,
			public_key: getPublicKey(user.privateKey),
			spk,
			sig,
			own_storage,
		});
		console.log("Registration successful:", result.success);

		if (result.success) {
			setUser(user);
		} else {
			toast({
				title: "Registration failed.",
				description: result.result,
				status: "error",
				duration: 9000,
				isClosable: true,
			});
		}

		return result.success;
	};

	if (user) {
		const onConfirm = async () => {
			await login(user);
			setLocation("/chat");
		};

		return (
			<AuthView>
				<RecoveryKeyConfirmation user={user} onConfirm={onConfirm} />
			</AuthView>
		);
	} else {
		return (
			<AuthView back={{ href: "/welcome", label: "Back to Homepage" }}>
				<UsernameSelection onRegister={onRegister} />
			</AuthView>
		);
	}
};
