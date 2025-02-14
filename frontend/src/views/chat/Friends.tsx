import {
	ButtonGroup,
	Center,
	HStack,
	Heading,
	Icon,
	IconButton,
	Input,
	InputGroup,
	InputLeftElement,
	Menu,
	MenuButton,
	MenuItem,
	MenuList,
	Popover,
	PopoverArrow,
	PopoverBody,
	PopoverContent,
	PopoverTrigger,
	Spinner,
	Tab,
	TabList,
	TabPanel,
	TabPanels,
	Tabs,
	Text,
	VStack,
	useDisclosure,
} from "@chakra-ui/react";
import { IconCheck, IconDots, IconMessage, IconSearch, IconSend, IconUsers, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { useLocation } from "wouter";
import {
	useAckFriendRequestMutation,
	useSendFriendRequestMutation,
	useUnfriendMutation,
} from "../../hooks/friendMutations";
import { useCreateDM } from "../../hooks/useCreateDM";
import { useDMs } from "../../hooks/useDMs";
import { useFriendRequests } from "../../hooks/useFriendRequests";
import { useFriends } from "../../hooks/useFriends";
import { useOutgoingFriendRequests } from "../../hooks/useOutgoingFriendRequests copy";
import { useUserSearch } from "../../hooks/useUserSearch";
import { UserAvatar } from "./UserAvatar";
import { UserLabel } from "./UserLabel";

export const UserListItem = ({ username, children: actions }: React.PropsWithChildren<{ username: string }>) => {
	return (
		<HStack p={2} justify="space-between" w="full">
			<HStack>
				<UserAvatar username={username} size="sm" />
				<UserLabel username={username} />
			</HStack>
			{actions}
		</HStack>
	);
};

export const FriendsPopover = () => {
	const popover = useDisclosure();

	return (
		<Popover isLazy placement="top-end" isOpen={popover.isOpen} onClose={popover.onClose}>
			<PopoverTrigger>
				<IconButton icon={<Icon as={IconUsers} boxSize={6} />} onClick={popover.onToggle} aria-label="Friends" />
			</PopoverTrigger>
			<PopoverContent>
				<PopoverArrow />
				<PopoverBody>
					<Tabs isLazy>
						<TabList>
							<Tab>Friends</Tab>
							<Tab>Requests</Tab>
							<Tab>Find New Friends</Tab>
						</TabList>
						<TabPanels>
							<TabPanel>
								<Friends onClose={popover.onClose} />
							</TabPanel>
							<TabPanel>
								<FriendRequests />
							</TabPanel>
							<TabPanel>
								<FindFriends />
							</TabPanel>
						</TabPanels>
					</Tabs>
				</PopoverBody>
			</PopoverContent>
		</Popover>
	);
};

export const Friends = ({ onClose }: { onClose: () => void }) => {
	const [_location, setLocation] = useLocation();
	const friendsQuery = useFriends();
	const createDMMutation = useCreateDM(onClose);
	const dmsQuery = useDMs();
	const unfriendMutation = useUnfriendMutation();

	if (friendsQuery.data === undefined || dmsQuery.data === undefined) {
		return (
			<Center>
				<Spinner />
			</Center>
		);
	}

	if (friendsQuery.data.length === 0) {
		return <Text>You haven't added any friends!</Text>;
	}

	const onFriendSelect = (username: string) => {
		const dm = dmsQuery.data.find((dm) => dm.users.find((u) => u === username));
		if (dm) {
			setLocation(`/chat/${dm.id}`);
			onClose();
		} else {
			createDMMutation.mutate([username]);
		}
	};

	return (
		<VStack align="flex-start">
			{friendsQuery.data.map((username) => (
				<UserListItem username={username} key={username}>
					<ButtonGroup isAttached>
						<IconButton
							size="sm"
							icon={<Icon as={IconMessage} boxSize={6} />}
							aria-label="Message this friend"
							onClick={() => onFriendSelect(username)}
						/>
						<Menu>
							<MenuButton
								as={IconButton}
								size="sm"
								icon={<Icon as={IconDots} boxSize={6} />}
								aria-label="More actions"
							/>
							<MenuList>
								<MenuItem
									color="red"
									onClick={() => unfriendMutation.mutate(username)}
									isDisabled={unfriendMutation.isLoading}
								>
									Unfriend
								</MenuItem>
							</MenuList>
						</Menu>
					</ButtonGroup>
				</UserListItem>
			))}
		</VStack>
	);
};

export const AckFriendRequestButtons = ({ username, onSuccess }: { username: string; onSuccess?: () => void }) => {
	const ackFriendRequestMutation = useAckFriendRequestMutation(onSuccess);

	return (
		<ButtonGroup isAttached isDisabled={ackFriendRequestMutation.isLoading}>
			<IconButton
				size="sm"
				icon={<Icon as={IconCheck} boxSize={6} />}
				aria-label="Accept Request"
				onClick={() => ackFriendRequestMutation.mutate({ username, accept: true })}
			/>
			<IconButton
				size="sm"
				icon={<Icon as={IconX} boxSize={6} />}
				aria-label="Decline Request"
				onClick={() => ackFriendRequestMutation.mutate({ username, accept: false })}
			/>
		</ButtonGroup>
	);
};

export const FriendRequests = () => {
	const friendRequestsQuery = useFriendRequests();
	const outgoingFriendRequestsQuery = useOutgoingFriendRequests();

	if (friendRequestsQuery.data === undefined || outgoingFriendRequestsQuery.data === undefined) {
		return (
			<Center>
				<Spinner />
			</Center>
		);
	}

	if (friendRequestsQuery.data.length === 0 && outgoingFriendRequestsQuery.data.length === 0) {
		return <Text>You have no pending friend requests.</Text>;
	}

	return (
		<VStack align="flex-start">
			{friendRequestsQuery.data.length > 0 && (
				<>
					<Heading size="sm">Incoming</Heading>
					{friendRequestsQuery.data.map((username) => (
						<UserListItem username={username} key={username}>
							<AckFriendRequestButtons username={username} />
						</UserListItem>
					))}
				</>
			)}
			{outgoingFriendRequestsQuery.data.length > 0 && (
				<>
					<Heading size="sm">Outgoing</Heading>
					{outgoingFriendRequestsQuery.data.map((username) => (
						<UserListItem username={username} key={username}>
							<Text>Pending...</Text>
						</UserListItem>
					))}
				</>
			)}
		</VStack>
	);
};

export const FindFriends = () => {
	const [search, setSearch] = useState("");
	const searchEnabled = search.length >= 1;
	const usersQuery = useUserSearch(search, searchEnabled);
	const friendsQuery = useFriends();
	const friendRequestsQuery = useFriendRequests();
	const outgoingRequestsQuery = useOutgoingFriendRequests();

	const sendFriendRequestMutation = useSendFriendRequestMutation();

	const loading = usersQuery.isLoading || friendsQuery.isLoading || outgoingRequestsQuery.isLoading;
	const data = usersQuery.data?.filter(({ username }) => !friendsQuery.data?.includes(username)) ?? [];

	return (
		<VStack align="stretch">
			<InputGroup size="sm">
				<InputLeftElement pointerEvents="none">
					<Icon as={IconSearch} color="gray.300" boxSize={6} />
				</InputLeftElement>
				<Input type="text" placeholder="Search for users" value={search} onChange={(e) => setSearch(e.target.value)} />
			</InputGroup>
			{!searchEnabled ? (
				<Center>
					<Text>Start typing to find users.</Text>
				</Center>
			) : loading ? (
				<Center>
					<Spinner />
				</Center>
			) : data.length === 0 ? (
				<Center>
					<Text>No users match that search.</Text>
				</Center>
			) : (
				<VStack align="flex-start">
					{data.map(({ username }) => (
						<UserListItem username={username} key={username}>
							{friendRequestsQuery.data?.includes(username) ? (
								<AckFriendRequestButtons username={username} />
							) : outgoingRequestsQuery.data?.includes(username) ? (
								<Text>Pending...</Text>
							) : (
								<IconButton
									isDisabled={sendFriendRequestMutation.isLoading}
									icon={<Icon as={IconSend} boxSize={6} />}
									aria-label="Send Friend Request"
									size="sm"
									onClick={() => sendFriendRequestMutation.mutate(username)}
								/>
							)}
						</UserListItem>
					))}
				</VStack>
			)}
		</VStack>
	);
};
