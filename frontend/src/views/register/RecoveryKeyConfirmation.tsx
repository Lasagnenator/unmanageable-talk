import {
	Button,
	FormControl,
	FormErrorMessage,
	Heading,
	Icon,
	IconButton,
	Input,
	InputGroup,
	InputRightElement,
	Text,
	VStack,
	useClipboard,
} from "@chakra-ui/react";
import { IconCopy } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { keyToRecovery } from "../../crypto";
import { CurrentUser } from "../../types";

export const RecoveryKeyConfirmation = ({ user, onConfirm }: { user: CurrentUser; onConfirm: () => Promise<void> }) => {
	const [confirm, setConfirm] = useState("");
	const [loading, setLoading] = useState(false);

	const recoveryKey = useMemo(() => keyToRecovery(user.privateKey), [user.privateKey]);
	const { onCopy, value, hasCopied } = useClipboard(recoveryKey);
	const [error, setError] = useState<string | null>(null);

	const handleConfirm = async () => {
		setLoading(true);
		setError("");
		if (confirm === recoveryKey) {
			await onConfirm();
		} else {
			setLoading(false);
			setError("This does not match your recovery key!");
		}
	};

	return (
		<VStack gap={4}>
			<Heading textAlign="center" size="lg">
				Recovery Key
			</Heading>
			<Text textAlign="center" fontSize="sm">
				Your unique recovery key is the sole key to your account. Securely store it, as losing it means losing access to
				your account forever. We cannot recover lost keys - they're your responsibility.
			</Text>

			<InputGroup size="lg">
				<Input value={recoveryKey} readOnly={true} size="lg"></Input>
				<InputRightElement>
					<IconButton onClick={onCopy} icon={<Icon as={IconCopy} boxSize={5} />} aria-label="Copy key to clipboard" />
				</InputRightElement>
			</InputGroup>

			<FormControl isInvalid={!!confirm && confirm !== recoveryKey}>
				<Input
					placeholder="Re-enter Recovery Key"
					value={confirm}
					variant="filled"
					size="lg"
					isRequired
					onChange={(event) => setConfirm(event.target.value)}
					isDisabled={loading}
				/>
				{confirm !== recoveryKey && <FormErrorMessage>The recovery keys do not match!</FormErrorMessage>}
			</FormControl>

			<Button variant="outline" colorScheme="teal" size="lg" onClick={handleConfirm} isLoading={loading}>
				Continue
			</Button>
		</VStack>
	);
};
