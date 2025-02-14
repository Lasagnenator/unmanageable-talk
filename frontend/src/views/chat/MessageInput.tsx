import {
	Button,
	Center,
	Divider,
	Grid,
	GridItem,
	HStack,
	Icon,
	IconButton,
	Input,
	InputGroup,
	InputRightElement,
	Modal,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalOverlay,
	Popover,
	PopoverArrow,
	PopoverBody,
	PopoverCloseButton,
	PopoverContent,
	PopoverHeader,
	PopoverTrigger,
	Spinner,
	Text,
	VStack,
	useDisclosure,
} from "@chakra-ui/react";
import { IconHelpCircle, IconSend, IconTimelineEventExclamation } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { encrypt, signature } from "../../crypto";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useSharedKey } from "../../hooks/useKeyStorage";
import { useSocket } from "../../hooks/useSocket";
import { textToHex } from "../../utils";
import { SpecialSendView } from "./SpecialSendView";

export const MessageInput = ({ id }: { id: number }) => {
	const socket = useSocket();
	const sharedKey = useSharedKey(id);
	const { privateKey } = useCurrentUser();
	const [message, setMessage] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	const sendMessageMutation = useMutation({
		mutationFn: async ({
			message,
			schedule_time,
			delete_time,
		}: {
			message: string;
			schedule_time: number;
			delete_time: number;
		}) => {
			const hex = textToHex(message);
			const encrypted = await encrypt(sharedKey, hex);
			const sig = signature(privateKey, encrypted);
			return await socket.emitWithAck("send_message", {
				id,
				message: encrypted,
				signature: sig,
				schedule: schedule_time,
				delete: delete_time,
			});
		},
	});

	const typingMutation = useMutation({
		mutationFn: () => socket.emitWithAck("ping_typing", { id }),
	});

	// Add this useEffect hook
	// useEffect(() => {
	// 	if (inputRef.current) {
	// 		inputRef.current.focus();
	// 	}
	// }, [id]);

	const clearMessage = () => {
		setMessage("");
	};

	return (
		<InputGroup
			size="md"
			as="form"
			onSubmit={(event) => {
				event.preventDefault();
				if (message) {
					sendMessageMutation.mutate({ message: message, schedule_time: 0, delete_time: 0 });
					setMessage("");
					// inputRef.current?.focus();
				}
			}}
		>
			<Input
				placeholder="Message..."
				value={message}
				ref={inputRef}
				onChange={(event) => {
					typingMutation.mutate();
					setMessage(event.target.value);
				}}
			/>
			<HStack ml={1} spacing={2}>
				<IconButton size="sm" icon={<Icon as={IconSend} boxSize={5} />} aria-label="Send message" type="submit" />
				<SpecialSendView dm_id={id} message={message} setMessage={clearMessage} />
			</HStack>
		</InputGroup>
	);
};
