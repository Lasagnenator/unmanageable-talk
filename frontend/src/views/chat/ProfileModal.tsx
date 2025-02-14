import {
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalCloseButton,
	ModalBody,
	Text,
	HStack,
	Heading,
	ModalFooter,
	Button,
	useToast,
	VStack,
} from "@chakra-ui/react";
import { UserLabel } from "./UserLabel";
import { useUser } from "../../hooks/useUser";
import { Loading } from "../../Loading";
import { UserAvatar } from "./UserAvatar";
import { useFriends } from "../../hooks/useFriends";
import { useFriendRequests } from "../../hooks/useFriendRequests";
import { useOutgoingFriendRequests } from "../../hooks/useOutgoingFriendRequests copy";
import {
	useSendFriendRequestMutation,
	useUnfriendMutation,
	useAckFriendRequestMutation,
} from "../../hooks/friendMutations";
import { useCurrentUser } from "../../hooks/useCurrentUser";

export const ProfileModal = ({
	username,
	isOpen,
	onClose,
}: {
	username: string;
	isOpen: boolean;
	onClose: () => void;
}) => {
	const userQuery = useUser(username);
	const currentUser = useCurrentUser();
	const friendsQuery = useFriends();
	const friendRequestsQuery = useFriendRequests();
	const outgoingFriendRequestsQuery = useOutgoingFriendRequests();
	const toast = useToast();

	const addFriendMutation = useSendFriendRequestMutation(() => {
		toast({
			title: "Friend request sent.",
			description: `You have sent a friend request to ${username}.`,
			status: "success",
			duration: 5000,
			isClosable: true,
		});
		onClose();
	});

	const unfriendMutation = useUnfriendMutation(() => {
		toast({
			title: "Unfriended.",
			description: `You have unfriended ${username}.`,
			status: "info",
			duration: 5000,
			isClosable: true,
		});
		onClose();
	});

	const acceptFriendRequestMutation = useAckFriendRequestMutation(() => {
		toast({
			title: "Friend request accepted.",
			description: `You have accepted the friend request from ${username}.`,
			status: "success",
			duration: 5000,
			isClosable: true,
		});
		onClose();
	});

	const declineFriendRequestMutation = useAckFriendRequestMutation(() => {
		toast({
			title: "Friend request declined.",
			description: `You have declined the friend request from ${username}.`,
			status: "info",
			duration: 5000,
			isClosable: true,
		});
		onClose();
	});

	// Check if the profile being viewed is the current user, if they are already friends, or if there's a pending friend request
	const isCurrentUser = currentUser.username === username;
	const areFriends = friendsQuery.data?.includes(username) ?? false;
	const hasPendingRequest = friendRequestsQuery.data?.includes(username) ?? false;
	const hasOutgoingRequest = outgoingFriendRequestsQuery.data?.includes(username) ?? false;

	return (
		<Modal isOpen={isOpen} onClose={onClose}>
			<ModalOverlay />
			<ModalContent>
				{userQuery.data ? (
					<>
						<ModalHeader>
							<HStack gap={4}>
								<UserAvatar username={username} size="lg" />
								<UserLabel username={username} size="lg" isHeading />
							</HStack>
						</ModalHeader>
						<ModalCloseButton />
						<ModalBody>
							<Heading size="md">Bio</Heading>
							<Text>{userQuery.data.biography || "This user doesn't have a bio."}</Text>
							{!isCurrentUser && !hasPendingRequest && !hasOutgoingRequest && (
								<Button
									mt={4}
									colorScheme={areFriends ? "red" : "blue"}
									onClick={() => (areFriends ? unfriendMutation.mutate(username) : addFriendMutation.mutate(username))}
									isLoading={addFriendMutation.isLoading || unfriendMutation.isLoading}
								>
									{areFriends ? "Unfriend" : "Add Friend"}
								</Button>
							)}
							{hasPendingRequest && (
								<VStack align="start" mt={4}>
									<Heading size="sm">{`${username} has sent you a friend request`}</Heading>
									<HStack>
										<Button
											colorScheme="green"
											onClick={() => acceptFriendRequestMutation.mutate({ username, accept: true })}
											isLoading={acceptFriendRequestMutation.isLoading}
										>
											Accept
										</Button>
										<Button
											colorScheme="red"
											onClick={() => declineFriendRequestMutation.mutate({ username, accept: false })}
											isLoading={declineFriendRequestMutation.isLoading}
										>
											Decline
										</Button>
									</HStack>
								</VStack>
							)}
							{hasOutgoingRequest && <Text mt={4}>Waiting for response...</Text>}
						</ModalBody>
						<ModalFooter />
					</>
				) : (
					<Loading />
				)}
			</ModalContent>
		</Modal>
	);
};
