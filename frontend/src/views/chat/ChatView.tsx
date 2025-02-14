import {
	Button,
	ButtonGroup,
	Center,
	Grid,
	GridItem,
	HStack,
	Heading,
	Icon,
	IconButton,
	Input,
	InputGroup,
	InputLeftElement,
	Spinner,
	Text,
	VStack,
	useColorMode,
	useColorModeValue,
} from "@chakra-ui/react";
import { IconPhoneX, IconPower, IconSearch, IconSettings } from "@tabler/icons-react";
import { useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { ErrorPage } from "../../ErrorPage";
import { Loading } from "../../Loading";
import { useCall } from "../../hooks/useCall";
import { useActiveSession, useCurrentUser } from "../../hooks/useCurrentUser";
import { useDMs } from "../../hooks/useDMs";
import { DM } from "../../types";
import { getDMName, getOtherUser, isIndividualDM, toDateTimeString } from "../../utils";
import { AudioOnly } from "./CallView";
import { DMView } from "./DMView";
import { EmptyView } from "./EmptyView";
import { FriendsPopover } from "./Friends";
import { GroupAvatars } from "./GroupAvatars";
import { GroupLabel } from "./GroupLabel";
import { NewDMPopover } from "./NewDM";
import { StatusSelector } from "./StatusSelector";
import { UserAvatar } from "./UserAvatar";
import { UserLabel } from "./UserLabel";

const DMListItem = ({ dm }: { dm: DM }) => {
	const [location, setLocation] = useLocation();
	const active = location === `/chat/${dm.id}`;
	const { username } = useCurrentUser();

	const normalBg = useColorModeValue("gray.50", "gray.800");
	const activeBg = useColorModeValue("gray.100", "gray.700");
	const hoverBg = useColorModeValue("gray.100", "gray.700");

	return (
		<HStack
			p={2}
			onClick={() => setLocation(active ? "/chat" : `/chat/${dm.id}`)}
			bg={active ? activeBg : normalBg}
			_hover={{ bg: hoverBg }}
			cursor="pointer"
		>
			{isIndividualDM(dm) ? <UserAvatar username={getOtherUser(dm, username)} /> : <GroupAvatars dm={dm} size="sm" />}
			<VStack align="stretch" justify="flex-start" gap={0} w="full">
				<HStack justify="space-between" gap={2}>
					{isIndividualDM(dm) ? (
						<UserLabel username={getOtherUser(dm, username)} isHeading></UserLabel>
					) : (
						<GroupLabel dm={dm} isHeading></GroupLabel>
					)}
					<Text fontSize="xs">{toDateTimeString(dm.latest_message?.timestamp ?? dm.created_at)}</Text>
				</HStack>
				<Text noOfLines={1}>{dm.latest_message?.message}</Text>
			</VStack>
		</HStack>
	);
};

export const ChatView = () => {
	const [location, setLocation] = useLocation();
	const { colorMode } = useColorMode();
	const callContext = useCall();

	const {
		user: { username },
		logout,
	} = useActiveSession();
	const dmsQuery = useDMs();
	const [search, setSearch] = useState("");
	const filteredDMs = dmsQuery.data?.filter((dm) =>
		getDMName(dm, username).toLowerCase().includes(search.toLowerCase())
	);

	const callDM = dmsQuery.data?.find((dm) => dm.id === callContext.call?.id);

	return (
		<Grid h="full" templateColumns="1fr 2fr" columnGap={2} templateRows="max-content 1fr max-content max-content">
			<Center h="full" p={2}>
				<InputGroup>
					<InputLeftElement pointerEvents="none">
						<Icon as={IconSearch} color="gray.300" boxSize={6} />
					</InputLeftElement>
					<Input
						type="text"
						placeholder="Search for conversation"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</InputGroup>
			</Center>
			<GridItem rowSpan={4}>
				<ErrorBoundary fallbackRender={ErrorPage}>
					<Switch>
						<Route
							path="/chat/:dm_id"
							component={({ params: { dm_id } }) => {
								if (dmsQuery.isLoading) {
									return (
										<Center h="full">
											<Spinner />
										</Center>
									);
								}
								const dm = dmsQuery.data?.find((dm) => dm.id === Number(dm_id));
								if (!dm) {
									throw new Error("DM not found");
								}
								return <DMView dm={dm} key={dm_id} />;
							}}
						/>

						<Route path="/chat" component={EmptyView} />

						<Route>
							<Redirect to="/chat" />
						</Route>
					</Switch>
				</ErrorBoundary>
			</GridItem>
			<GridItem overflowY="auto" rowSpan={!callContext.call ? 2 : 1}>
				<VStack align="stretch" gap={0}>
					{dmsQuery.data !== undefined ? (
						dmsQuery.data.length ? (
							filteredDMs?.length ? (
								filteredDMs?.map((dm) => <DMListItem dm={dm} key={dm.id} />)
							) : (
								<Center p={2}>
									<Text>No DMs match that search.</Text>
								</Center>
							)
						) : null
					) : (
						<Loading />
					)}
				</VStack>
			</GridItem>
			{callContext.call && callDM && (
				<HStack p={2} justify="space-between">
					{callContext.call.remotes
						.filter((r) => callDM.users_in_call[r.username] === r.call.peer)
						.map(({ username, streams }) => (
							<AudioOnly stream={streams[0]} key={username} />
						))}
					<VStack
						as={Button}
						align="flex-start"
						gap={0}
						variant="link"
						onClick={() => setLocation(`/chat/${callDM.id}`)}
					>
						<Heading size="sm">{callContext.call.open ? "In a call" : "Connecting..."}</Heading>
						<Text fontSize="sm" noOfLines={1}>
							{getDMName(callDM, username)}
						</Text>
					</VStack>
					<IconButton
						icon={<Icon as={IconPhoneX} boxSize={6} color="red.400" />}
						onClick={callContext.leaveCall}
						aria-label="End Call"
					/>
				</HStack>
			)}
			<HStack justify="center" p={2}>
				<ButtonGroup isAttached>
					<NewDMPopover />
					<FriendsPopover />
					<IconButton
						icon={<Icon as={IconSettings} boxSize={6} />}
						onClick={() => setLocation("/profile")}
						aria-label="Profile Settings"
					/>
					<IconButton
						icon={<Icon as={IconPower} boxSize={6} color="red.400" />}
						onClick={logout}
						aria-label="Sign out"
					/>
				</ButtonGroup>
				<StatusSelector />
			</HStack>
		</Grid>
	);
};
