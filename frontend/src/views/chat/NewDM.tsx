import {
	Button,
	Center,
	Checkbox,
	HStack,
	Icon,
	IconButton,
	Popover,
	PopoverArrow,
	PopoverBody,
	PopoverContent,
	PopoverHeader,
	PopoverTrigger,
	Spinner,
	Text,
	VStack,
	useDisclosure,
} from "@chakra-ui/react";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useCreateDM } from "../../hooks/useCreateDM";
import { useFriends } from "../../hooks/useFriends";
import { UserAvatar } from "./UserAvatar";
import { UserLabel } from "./UserLabel";

export const NewDMPopover = () => {
	const popover = useDisclosure();

	return (
		<Popover isLazy placement="top-end" isOpen={popover.isOpen} onClose={popover.onClose}>
			<PopoverTrigger>
				<IconButton
					onClick={popover.onToggle}
					icon={<Icon as={IconPlus} boxSize={6} />}
					aria-label="Start a new group DM"
				/>
			</PopoverTrigger>
			<PopoverContent>
				<PopoverHeader fontWeight="semibold">Start a new group DM</PopoverHeader>
				<PopoverArrow />
				<PopoverBody>
					<NewDM onCreated={popover.onClose} />
				</PopoverBody>
			</PopoverContent>
		</Popover>
	);
};

export const NewDM = ({ onCreated }: { onCreated: () => void }) => {
	const [selected, setSelected] = useState<string[]>([]);

	const friendsQuery = useFriends();
	const createDMMutation = useCreateDM(onCreated);

	if (friendsQuery.data === undefined) {
		return (
			<Center>
				<Spinner />
			</Center>
		);
	}

	if (friendsQuery.data.length === 0) {
		return <Text>No friends to start a DM with!</Text>;
	}

	return (
		<VStack align="flex-start">
			{friendsQuery.data.map((username) => (
				<Checkbox
					size="lg"
					w="full"
					key={username}
					isChecked={selected.includes(username)}
					onChange={(v) =>
						setSelected((users) => (v.target.checked ? [...users, username] : users.filter((u) => u !== username)))
					}
				>
					<HStack>
						<UserAvatar username={username} />
						<UserLabel username={username} />
					</HStack>
				</Checkbox>
			))}
			<Button alignSelf="center" isDisabled={selected.length === 0} onClick={() => createDMMutation.mutate(selected)}>
				Create DM
			</Button>
		</VStack>
	);
};
