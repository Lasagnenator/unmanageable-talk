import {
	Box,
	Button,
	ButtonGroup,
	Center,
	Grid,
	GridItem,
	HStack,
	Icon,
	IconButton,
	Popover,
	PopoverArrow,
	PopoverBody,
	PopoverCloseButton,
	PopoverContent,
	PopoverFooter,
	PopoverHeader,
	PopoverTrigger,
	Spinner,
	Text,
	VStack,
	useColorModeValue,
	useDisclosure,
} from "@chakra-ui/react";
import {
	IconBell,
	IconBellOff,
	IconPhoneCall,
	IconPhoneOff,
	IconPin,
	IconPinned,
	IconPinnedFilled,
} from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { iconNames } from "../../assets/reactionStorage";
import { encrypt, signature } from "../../crypto";
import { useCall } from "../../hooks/useCall";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useSharedKey } from "../../hooks/useKeyStorage";
import { useMessageHistory } from "../../hooks/useMessageHistory";
import { usePinnedMessages } from "../../hooks/usePinnedMessages";
import { useSocket } from "../../hooks/useSocket";
import { DM, Message, TypingNotification } from "../../types";
import { getOtherUser, isIndividualDM, textToHex, toDateTimeString, unwrapServerResult } from "../../utils";
import { CallView } from "./CallView";
import { GroupAvatars } from "./GroupAvatars";
import { GroupLabel } from "./GroupLabel";
import { MessageInput } from "./MessageInput";
import { ProfileModal } from "./ProfileModal";
import { ReactionPopover } from "./Reactions";
import { UserAvatar } from "./UserAvatar";
import { UserLabel } from "./UserLabel";
import { UserProfileButton } from "./UserProfileButton";
import { UsersDrawerButton } from "./UsersDrawerButton";

const ChatMessage = ({
	otherUser,
	message: { message: content, sender, timestamp, pinned, id, reactions, delete_timestamp },
	dm_id,
}: {
	otherUser: boolean;
	message: Message;
	dm_id: number;
}) => {
	const profile = useDisclosure();
	const socket = useSocket();
	const user = useCurrentUser();
	const sharedKey = useSharedKey(dm_id);
	const pinMessageMutation = useMutation({
		mutationFn: async (pinned: boolean) => socket.emitWithAck("set_message", { pinned, id }),
	});
	const contentBg = useColorModeValue("gray.200", "gray.700");

	const reactMutation = useMutation({
		mutationFn: async (reaction: string) => {
			const hex = textToHex(reaction);
			const encrypted = await encrypt(sharedKey, hex);
			const sig = signature(user.privateKey, encrypted);
			for (let i = 0; i < reactions.length; i++) {
				if (reactions[i].sender === user.username && reactions[i].reaction === reaction) {
					await socket.emitWithAck("remove_reaction", { id: reactions[i].id });
					return;
				}
			}

			return (
				await unwrapServerResult(socket.emitWithAck("add_reaction", { reaction: encrypted, signature: sig, id }))
			).toString();
		},
	});

	const uniqueReactions = Array.from(new Set(reactions.map((reaction) => reaction.reaction))); // Get unique reaction IDs

	const reactionsMap: { [key: string]: string[] } = {}; // Map reaction IDs to senders

	reactions.forEach((reaction) => {
		if (reactionsMap[reaction.reaction]) {
			reactionsMap[reaction.reaction].push(reaction.sender);
		} else {
			reactionsMap[reaction.reaction] = [reaction.sender];
		}
	});

	const updateReaction = (reaction: string) => {
		reactMutation.mutate(reaction);
	};

	const avatar = (
		<VStack gap={2} key="avatar">
			<Box onClick={profile.onOpen} cursor="pointer">
				<UserAvatar username={sender} size="md" />
			</Box>
			<ButtonGroup isAttached>
				<IconButton
					size="xs"
					icon={<Icon as={pinned ? IconPinnedFilled : IconPin} boxSize={4} />}
					onClick={() => pinMessageMutation.mutate(!pinned)}
					aria-label="Pin message"
				/>
			</ButtonGroup>
		</VStack>
	);

	const reactionList = uniqueReactions.map((reactionId) => (
		<Popover key={reactionId} placement="top">
			<PopoverTrigger>
				<IconButton size={"xs"} aria-label={reactionId} icon={iconNames[parseInt(reactionId)]} />
			</PopoverTrigger>
			<PopoverContent>
				<PopoverArrow />
				<PopoverCloseButton />
				<PopoverHeader>
					Reacted by {reactionsMap[reactionId].length} {reactionsMap[reactionId].length === 1 ? "person" : "people"}:
				</PopoverHeader>
				<PopoverBody>
					<HStack>
						{reactionsMap[reactionId].map((sender) => (
							<Text key={sender}>{sender} </Text>
						))}
					</HStack>
				</PopoverBody>
				<PopoverFooter>
					<Button size="sm" onClick={() => updateReaction(reactionId)}>
						{reactionsMap[reactionId].includes(user.username) ? "Unreact" : "React"}{" "}
						{/* Only works for unique usernames */}
					</Button>
				</PopoverFooter>
			</PopoverContent>
		</Popover>
	));

	const timestampText = (
		<Text key="timestamp" fontSize="xs">
			{toDateTimeString(timestamp)}
			{delete_timestamp && `, self-destructs at ${toDateTimeString(delete_timestamp)}`}
		</Text>
	);
	const reactionPopover = (
		<ReactionPopover key="reaction-popover" reacted_message_id={id} reactions_by_user={reactions} dm_id={dm_id} />
	);

	const message = (
		<VStack align={otherUser ? "flex-start" : "flex-end"} gap={1} key="message">
			<Box onClick={profile.onOpen} cursor="pointer">
				<UserLabel username={sender} />
			</Box>
			<Box p={1} bg={contentBg}>
				<Text wordBreak="break-word">{content}</Text>
			</Box>
			<HStack gap={1}>{reactionList}</HStack>
			<HStack>{otherUser ? [timestampText, reactionPopover] : [reactionPopover, timestampText]}</HStack>
		</VStack>
	);

	return (
		<HStack justify={otherUser ? "flex-start" : "flex-end"} align="flex-start">
			{otherUser ? [avatar, message] : [message, avatar]}
			<ProfileModal username={sender} isOpen={profile.isOpen} onClose={profile.onClose} />
		</HStack>
	);
};

const ChatMessages = ({ messages, dm_id }: { messages: Message[]; dm_id: number }) => {
	const user = useCurrentUser();
	const stack = useRef<HTMLDivElement | null>(null);
	const [scrollLimit, setScrollLimit] = useState(0);

	useEffect(() => {
		if (stack.current) {
			// Store the initial length of the scrollable area.
			setScrollLimit(stack.current.scrollHeight);
			// On mount, scroll (instantly) to the bottom.
			// Note: the type definitions are bugged, so builds will fail if we use `behaviour: "instant"` directly (https://github.com/microsoft/TypeScript/issues/47441)
			stack.current.scroll({ behavior: "instant" as unknown as ScrollBehavior, top: stack.current.scrollHeight });
		}
	}, []);

	useEffect(() => {
		if (stack.current) {
			// `scrollLimit` is the previous size of the scrollable area,
			// so if our current scroll location plus the length of the element within the
			// viewport is within a pixel of that previous size, then we must have been scrolled
			// to the bottom, so we will scroll to the bottom of the new message.
			if (stack.current.scrollTop + stack.current.clientHeight >= scrollLimit - 1) {
				// Smooth scrolling for new messages.
				stack.current.scroll({ behavior: "smooth", top: stack.current.scrollHeight });
			}

			// Regardless, update with the new size of the area.
			setScrollLimit(stack.current.scrollHeight);
		}
	}, [messages]);

	return (
		<Box overflowY="auto" ref={stack} h="full" p={2}>
			<VStack justify="flex-end" align="stretch" minH={0}>
				{messages.map((m, i) => (
					<ChatMessage otherUser={m.sender !== user.username} message={m} key={m.id} dm_id={dm_id} />
				))}
			</VStack>
		</Box>
	);
};

const PinnedMessages = ({ dm_id }: { dm_id: number }) => {
	const pinnedMessagesQuery = usePinnedMessages(dm_id);

	if (!pinnedMessagesQuery.data) {
		return (
			<Center>
				<Spinner />
			</Center>
		);
	}

	if (pinnedMessagesQuery.data.length === 0) {
		return <Text>This DM has no pinned messages!</Text>;
	}

	return <ChatMessages messages={pinnedMessagesQuery.data.reverse()} dm_id={dm_id} />;
};

const TypingPopup = ({ dm_id }: { dm_id: number }) => {
	const [users, setUsers] = useState<Record<string, NodeJS.Timeout>>({});
	const socket = useSocket();
	const typing = Object.keys(users);
	const bg = useColorModeValue("gray.200", "gray.700");

	useEffect(() => {
		const onTyping = (t: TypingNotification) => {
			if (t.id === dm_id) {
				const handle = setTimeout(
					() =>
						setUsers((prev) => {
							const { [t.username]: handle, ...rest } = prev;
							return { ...rest };
						}),
					2000
				);
				setUsers((prev) => {
					clearInterval(prev[t.username]);
					return { ...prev, [t.username]: handle };
				});
			}
		};
		socket.on("typing_notification", onTyping);

		return () => {
			socket.off("typing_notification", onTyping);
		};
	}, [socket, dm_id]);

	return (
		<>
			{typing.length !== 0 && (
				<Box position="absolute" bottom={0} left={0} bg={bg} p={1} w="full">
					<Text align="center">
						{typing.length < 3 ? typing.join(", ") : "Several people"} {typing.length > 1 ? "are" : "is"} typing...
					</Text>
				</Box>
			)}
		</>
	);
};

export const DMView = ({ dm }: { dm: DM }) => {
	const messagesBg = useColorModeValue("gray.50", "gray.900");
	const user = useCurrentUser();

	const [muted, setMuted] = useState(localStorage.getItem(dm.id.toString()) === "muted");
	const handleMuted = () => {
		setMuted((prev) => !prev);
	};
	useEffect(() => {
		localStorage.setItem(dm.id.toString(), muted ? "muted" : "unmuted");
	}, [muted]);

	const messagesQuery = useMessageHistory(dm.id);

	const callContext = useCall();
	const inCall = callContext.call !== null;
	const callInThisDM = callContext.call?.id === dm.id;

	if (messagesQuery.isLoading) {
		return (
			<Center h="full">
				<Spinner />
			</Center>
		);
	}

	return (
		<Grid h="full" templateRows="max-content max-content 1fr max-content">
			<HStack p={2} justify="space-between">
				<HStack>
					{isIndividualDM(dm) ? (
						<UserProfileButton
							isHeading
							avatarSize="sm"
							labelSize="md"
							username={getOtherUser(dm, user.username)}
							variant="link"
						/>
					) : (
						<HStack>
							<GroupAvatars dm={dm} size="sm" />
							<GroupLabel dm={dm} size="md" />
						</HStack>
					)}
					{Object.keys(dm.users_in_call).length !== 0 && (
						<Text>{Object.keys(dm.users_in_call).length} users in a call.</Text>
					)}
				</HStack>
				<ButtonGroup isAttached>
					<IconButton
						aria-label={"Mute"}
						icon={<Icon as={muted ? IconBellOff : IconBell} boxSize={6} />}
						onClick={handleMuted}
					></IconButton>
					<IconButton
						aria-label={"Call group"}
						icon={<Icon as={callInThisDM ? IconPhoneOff : IconPhoneCall} boxSize={6} />}
						disabled={inCall && !callInThisDM}
						isLoading={inCall && !callContext.call.open}
						onClick={() => (callContext.call ? callContext.leaveCall() : callContext.joinCall(dm.id))}
					></IconButton>
					<UsersDrawerButton usernames={dm.users} />
				</ButtonGroup>
			</HStack>
			{callInThisDM && <CallView />}
			<GridItem position="relative" h="full" minH={0} rowSpan={callInThisDM ? 1 : 2} bg={messagesBg}>
				<ChatMessages messages={messagesQuery.data?.pages.flat().reverse() ?? []} dm_id={dm.id} />
				<TypingPopup dm_id={dm.id} />
			</GridItem>
			<HStack p={2}>
				<Popover isLazy placement="top-end">
					<PopoverTrigger>
						<IconButton icon={<Icon as={IconPinned} boxSize={6} />} aria-label="View pinned messages" />
					</PopoverTrigger>
					<PopoverContent>
						<PopoverHeader fontWeight="semibold">Pinned Messages</PopoverHeader>
						<PopoverArrow />
						<PopoverBody bg={messagesBg} roundedBottom="md">
							<PinnedMessages dm_id={dm.id} />
						</PopoverBody>
					</PopoverContent>
				</Popover>
				<MessageInput id={dm.id} />
			</HStack>
		</Grid>
	);
};
