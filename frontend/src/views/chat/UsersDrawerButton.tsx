import {
	Button,
	Drawer,
	DrawerBody,
	DrawerCloseButton,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerOverlay,
	Icon,
	IconButton,
	VStack,
	useDisclosure,
} from "@chakra-ui/react";
import { IconList } from "@tabler/icons-react";
import { UserProfileButton } from "./UserProfileButton";

export const UsersDrawerButton = ({ usernames }: { usernames: string[] }) => {
	const { onClose, onOpen, isOpen } = useDisclosure();
	return (
		<>
			<IconButton icon={<Icon as={IconList} boxSize={6} />} aria-label="View users in DM" onClick={onOpen}></IconButton>
			<Drawer placement="right" isOpen={isOpen} onClose={onClose}>
				<DrawerOverlay>
					<DrawerContent>
						<DrawerCloseButton />
						<DrawerHeader>Users in DM</DrawerHeader>
						<DrawerBody>
							<VStack align="flex-start">
								{usernames.map((username) => (
									<UserProfileButton
										key={username}
										username={username}
										avatarSize="sm"
										variant="ghost"
										labelSize="md"
									/>
								))}
							</VStack>
						</DrawerBody>
					</DrawerContent>
				</DrawerOverlay>
			</Drawer>
		</>
	);
};
