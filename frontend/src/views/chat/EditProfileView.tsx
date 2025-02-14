import { ArrowBackIcon, EditIcon } from "@chakra-ui/icons";
import {
	Avatar,
	Box,
	Button,
	Flex,
	FormControl,
	FormLabel,
	HStack,
	IconButton,
	Input,
	Popover,
	PopoverArrow,
	PopoverBody,
	PopoverCloseButton,
	PopoverContent,
	PopoverTrigger,
	Switch,
	Textarea,
	VStack,
	useColorMode,
	useToast,
} from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loading } from "../../Loading";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useSocket } from "../../hooks/useSocket";
import { useUser } from "../../hooks/useUser";
import { User } from "../../types";
import { unwrapServerResult } from "../../utils";
import { UserLabel } from "./UserLabel";

export const EditProfileView = () => {
	const { colorMode, setColorMode } = useColorMode();
	const toast = useToast();
	const queryClient = useQueryClient();
	const [location, setLocation] = useLocation();
	const [bio, setBio] = useState("");
	const [color, setColor] = useState("");
	const socket = useSocket();
	const { username } = useCurrentUser();
	const userQuery = useUser(username);
	useEffect(() => {
		if (userQuery.data) {
			setBio(userQuery.data.biography);
			setColor(userQuery.data.profile_picture || "gray.400");
		}
	}, [userQuery.data?.biography, userQuery.data?.profile_picture]);

	const updateProfileMutation = useMutation({
		mutationFn: ({ bio: biography, color: profile_picture }: { bio: string; color: string }) =>
			unwrapServerResult(socket.emitWithAck("set_user", { biography, profile_picture })),
		onSuccess: (_, { bio: biography, color: profile_picture }) => {
			queryClient.setQueryData<User>(["user", { username }], (p) =>
				p ? { ...p, biography, profile_picture } : undefined
			);

			toast({
				title: "Profile updated.",
				description: "Your profile has been successfully updated.",
				status: "success",
				duration: 1500,
				isClosable: true,
			});
		},
	});

	if (!userQuery.data) {
		return <Loading />;
	}

	return (
		<VStack h="full" p={6} bg={colorMode === "dark" ? "gray.800" : "gray.100"}>
			<HStack justify="space-between" w="full">
				<IconButton
					icon={<ArrowBackIcon />}
					aria-label="Back"
					variant="ghost"
					alignSelf="flex-start"
					onClick={() => setLocation("/chat")}
				/>
				<HStack align="baseline">
					<FormLabel htmlFor="color-mode-switch">Use dark mode?</FormLabel>
					<Switch
						id="color-mode-switch"
						isChecked={colorMode === "dark"}
						onChange={(e) => setColorMode(e.target.checked ? "dark" : "light")}
					/>
				</HStack>
			</HStack>

			<Box
				maxW={"500px"}
				w={"full"}
				bg={colorMode === "dark" ? "gray.700" : "white"}
				boxShadow={"2xl"}
				rounded={"md"}
				p={6}
				overflow={"hidden"}
				alignSelf="center"
				mt={12}
			>
				<Flex direction="column" align="center" justifyContent="center" mb={6}>
					<Popover>
						<PopoverTrigger>
							<HStack spacing={4} ml={10}>
								<Avatar size="2xl" bg={color} />
								<IconButton icon={<EditIcon />} aria-label="Edit" variant="ghost" />
							</HStack>
						</PopoverTrigger>
						<PopoverContent>
							<PopoverArrow />
							<PopoverCloseButton />
							<PopoverBody>
								<Input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
							</PopoverBody>
						</PopoverContent>
					</Popover>
					<Box mt={3}>
						<UserLabel username={username} isHeading={true} size="xl" />
					</Box>
				</Flex>

				<FormControl>
					<FormLabel>Bio</FormLabel>
					<Textarea
						placeholder="Bio"
						value={bio}
						onChange={(e) => setBio(e.target.value)}
						size="lg"
						resize="vertical"
						maxH="200px"
					/>
				</FormControl>

				<Flex justifyContent="center" mt={6}>
					<Button colorScheme="blue" onClick={() => updateProfileMutation.mutate({ bio, color })} size="lg">
						Update Profile
					</Button>
				</Flex>
			</Box>
		</VStack>
	);
};
