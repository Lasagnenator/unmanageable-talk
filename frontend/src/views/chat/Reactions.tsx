import {
	IconButton,
	Popover,
	PopoverArrow,
	PopoverBody,
	PopoverContent,
	PopoverHeader,
	PopoverTrigger,
	VStack,
	Wrap,
	WrapItem,
	useColorModeValue,
	useDisclosure,
} from "@chakra-ui/react";
import { useMutation } from "@tanstack/react-query";
import { FaSmile } from "react-icons/fa";
import { iconNames } from "../../assets/reactionStorage";
import { encrypt, signature } from "../../crypto";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useSharedKey } from "../../hooks/useKeyStorage";
import { useSocket } from "../../hooks/useSocket";
import { Reaction } from "../../types";
import { textToHex, unwrapServerResult } from "../../utils";

export const ReactionPopover = ({
	reacted_message_id,
	reactions_by_user,
	dm_id,
}: {
	reacted_message_id: number;
	reactions_by_user: Reaction[];
	dm_id: number;
}) => {
	const popover = useDisclosure();
	const bg = useColorModeValue("gray.500", "gray.600");
	const color = useColorModeValue("white", "gray.200");
	const hoverBg = useColorModeValue("gray.500", "gray.700");

	return (
		<Popover isLazy placement="auto" isOpen={popover.isOpen} onClose={popover.onClose}>
			<PopoverTrigger>
				<IconButton
					aria-label="Add Reaction"
					icon={<FaSmile />}
					borderRadius="full"
					backgroundColor={bg}
					color={color}
					_hover={{ backgroundColor: hoverBg }}
					onClick={popover.onToggle}
					size="xs"
				/>
			</PopoverTrigger>
			<PopoverContent>
				<PopoverHeader fontWeight="semibold">Add a new reaction</PopoverHeader>
				<PopoverArrow />
				<PopoverBody>
					<ReactionSelection
						onCreated={popover.onClose}
						message_id={reacted_message_id}
						reacted_emotes={reactions_by_user}
						dm_id={dm_id}
					/>
				</PopoverBody>
			</PopoverContent>
		</Popover>
	);
};

export const ReactionSelection = ({
	onCreated,
	message_id,
	reacted_emotes,
	dm_id,
}: {
	onCreated: () => void;
	message_id: number;
	reacted_emotes: Reaction[];
	dm_id: number;
}) => {
	const socket = useSocket();
	const user = useCurrentUser();
	const sharedKey = useSharedKey(dm_id);

	// Dup fucntion from DMView. Maybe can get imported?
	const reactMutation = useMutation({
		mutationFn: async (reaction: string) => {
			const hex = textToHex(reaction);
			const encrypted = await encrypt(sharedKey, hex);

			const sig = signature(user.privateKey, encrypted);
			for (let i = 0; i < reacted_emotes.length; i++) {
				if (reacted_emotes[i].sender === user.username && reacted_emotes[i].reaction === reaction) {
					await socket.emitWithAck("remove_reaction", { id: reacted_emotes[i].id });
					return;
				}
			}

			return (
				await unwrapServerResult(
					socket.emitWithAck("add_reaction", { reaction: encrypted, signature: sig, id: message_id })
				)
			).toString();
		},
	});

	const updateReactionArray = (reaction_id: number) => {
		reactMutation.mutate(reaction_id.toString());
	};

	const reactedByUser = (reaction: number) => {
		for (let i = 0; i < reacted_emotes.length; i++) {
			if (reacted_emotes[i].sender === user.username && parseInt(reacted_emotes[i].reaction) === reaction) {
				return true;
			}
		}
		return false;
	};

	return (
		<VStack align="flex-start">
			<Wrap spacing={2}>
				{iconNames.map((IconName, index) => (
					<WrapItem key={index}>
						<IconButton
							key={index}
							borderRadius="full"
							colorScheme={reactedByUser(index) ? "blue" : "gray"}
							icon={IconName}
							aria-label={""}
							onClick={() => updateReactionArray(index)}
						/>
					</WrapItem>
				))}
			</Wrap>
		</VStack>
	);
};
