import {
	Box,
	Button,
	Center,
	Divider,
	Grid,
	GridItem,
	HStack,
	Icon,
	IconButton,
	Input,
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
import { IconHelpCircle, IconTimelineEventExclamation } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { encrypt, signature } from "../../crypto";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useSharedKey } from "../../hooks/useKeyStorage";
import { useSocket } from "../../hooks/useSocket";
import { textToHex } from "../../utils";
import { useScheduledMessages } from "../../hooks/useScheduledMessages";

const ScheduledMessages = ({ dm_id }: { dm_id: number }) => {
	const scheduledMessagesQuery = useScheduledMessages(dm_id);
	if (!scheduledMessagesQuery.data) {
		return (
			<Center>
				<Spinner />
			</Center>
		);
	}

	if (scheduledMessagesQuery.data.length === 0) {
		return <Text>You have not scheduled any messages.</Text>;
	}

	return (
		<VStack>
			{scheduledMessagesQuery.data.map((value, i) => (
				<VStack gap={1} key={i}>
					<Box p={1} bg="gray.200">
						<Text wordBreak="break-word">{value.message}</Text>
					</Box>
					<Text key="timestamp" fontSize="xs">
						Scheduled at {new Date(value.timestamp).toLocaleTimeString()}
					</Text>
				</VStack>
			))}
		</VStack>
	);
};

export const SpecialSendView = ({
	dm_id,
	message,
	setMessage,
}: {
	dm_id: number;
	message: string;
	setMessage: any;
}) => {
	const socket = useSocket();
	const sharedKey = useSharedKey(dm_id);
	const { privateKey } = useCurrentUser();

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
				id: dm_id,
				message: encrypted,
				signature: sig,
				schedule: schedule_time,
				delete: delete_time,
			});
		},
	});

	const { isOpen: isSpecialSendOpen, onOpen: onSpecialSendOpen, onClose: onSpecialSendClose } = useDisclosure();
	const [scheduleTimeFinal, setScheduleTimeFinal] = useState(0);
	const [deletionTimeFinal, setDeletionTimeFinal] = useState(0);
	const [scheduleTime, setScheduleTime] = useState(["", "", "", ""]);
	const [deletionTime, setDeletionTime] = useState(["", "", "", ""]);

	const updateScheduleTime = (e: any, timeunit: string) => {
		let original_time = scheduleTime;
		if (timeunit == "day") {
			original_time[0] = e.target.value;
		} else if (timeunit == "hour") {
			original_time[1] = e.target.value;
		} else if (timeunit == "minute") {
			original_time[2] = e.target.value;
		} else if (timeunit == "second") {
			original_time[3] = e.target.value;
		}
		setScheduleTime(original_time);
		setScheduleTimeFinal(
			86400 * (parseInt(scheduleTime[0]) || 0) +
				3600 * (parseInt(scheduleTime[1]) || 0) +
				60 * (parseInt(scheduleTime[2]) || 0) +
				(parseInt(scheduleTime[3]) || 0)
		);
	};

	const updateDeletionTime = (e: any, timeunit: string) => {
		let original_time = deletionTime;
		if (timeunit == "day") {
			original_time[0] = e.target.value;
		} else if (timeunit == "hour") {
			original_time[1] = e.target.value;
		} else if (timeunit == "minute") {
			original_time[2] = e.target.value;
		} else if (timeunit == "second") {
			original_time[3] = e.target.value;
		}
		setDeletionTime(original_time);
		setDeletionTimeFinal(
			86400 * (parseInt(deletionTime[0]) || 0) +
				3600 * (parseInt(deletionTime[1]) || 0) +
				60 * (parseInt(deletionTime[2]) || 0) +
				(parseInt(deletionTime[3]) || 0)
		);
	};

	const handleSpecialSend = () => {
		if (message) {
			sendMessageMutation.mutate({
				message: message,
				schedule_time: scheduleTimeFinal,
				delete_time: deletionTimeFinal,
			});
			setMessage();
		}
	};

	const TimePicker = () => {
		return (
			<VStack align="right">
				<Grid
					templateAreas={`"ss ssd ssh ssm sss"
                                  "sd sdd sdh sdm sds"`}
					gridTemplateRows={"1fr 1fr"}
					gridTemplateColumns={"1fr 1fr 1fr 1fr 1fr"}
					h="full"
					gap="1"
				>
					<GridItem pl="2" area={"ss"}>
						Schedule in:
					</GridItem>
					<GridItem pl="2" area={"ssd"}>
						<Input placeholder="day" size="sm" value={scheduleTime[0]} onChange={(e) => updateScheduleTime(e, "day")} />
					</GridItem>
					<GridItem pl="2" area={"ssh"}>
						<Input
							placeholder="hour"
							size="sm"
							value={scheduleTime[1]}
							onChange={(e) => updateScheduleTime(e, "hour")}
						/>
					</GridItem>
					<GridItem pl="2" area={"ssm"}>
						<Input
							placeholder="minute"
							size="sm"
							value={scheduleTime[2]}
							onChange={(e) => updateScheduleTime(e, "minute")}
						/>
					</GridItem>
					<GridItem pl="2" area={"sss"}>
						<Input
							placeholder="second"
							size="sm"
							value={scheduleTime[3]}
							onChange={(e) => updateScheduleTime(e, "second")}
						/>
					</GridItem>
					<GridItem pl="2" area={"sd"}>
						Delete in:
					</GridItem>
					<GridItem pl="2" area={"sdd"}>
						<Input placeholder="day" size="sm" value={deletionTime[0]} onChange={(e) => updateDeletionTime(e, "day")} />
					</GridItem>
					<GridItem pl="2" area={"sdh"}>
						<Input
							placeholder="hour"
							size="sm"
							value={deletionTime[1]}
							onChange={(e) => updateDeletionTime(e, "hour")}
						/>
					</GridItem>
					<GridItem pl="2" area={"sdm"}>
						<Input
							placeholder="minute"
							size="sm"
							value={deletionTime[2]}
							onChange={(e) => updateDeletionTime(e, "minute")}
						/>
					</GridItem>
					<GridItem pl="2" area={"sds"}>
						<Input
							placeholder="second"
							size="sm"
							value={deletionTime[3]}
							onChange={(e) => updateDeletionTime(e, "second")}
						/>
					</GridItem>
				</Grid>
				<VStack align="right">
					<Text fontSize={"sm"} textAlign="right">
						Scheduled to send in {scheduleTimeFinal || 0} seconds.
					</Text>
					<Text fontSize={"sm"} textAlign="right">
						Scheduled to delete in {deletionTimeFinal || 0} seconds.
					</Text>
					{message === "" && (
						<Text fontSize={"sm"} textAlign="right" color={"red"}>
							You have not typed a message! Nothing will be sent!
						</Text>
					)}
				</VStack>
			</VStack>
		);
	};

	return (
		<>
			<IconButton
				size="sm"
				icon={<Icon as={IconTimelineEventExclamation} boxSize={5} />}
				aria-label="Special send"
				onClick={onSpecialSendOpen}
			/>
			<Modal isOpen={isSpecialSendOpen} onClose={onSpecialSendClose} size="xl">
				<ModalOverlay />
				<ModalContent>
					<ModalHeader>
						<HStack>
							<Popover>
								<PopoverTrigger>
									<IconButton size="sm" icon={<IconHelpCircle />} aria-label="Special Send Help" />
								</PopoverTrigger>
								<PopoverContent>
									<PopoverArrow />
									<PopoverCloseButton />
									<PopoverHeader>
										<Text fontSize={"sm"}>Schedule/Self-destructing Messages Help</Text>
									</PopoverHeader>
									<PopoverBody>
										<VStack align={"left"}>
											<Divider />
											<Text fontSize={"sm"}>The time you set here is relative.</Text>
											<Text fontSize={"sm"}>
												For example, If you change the hour to 1 and presses send, the message will be sent 1 hour from
												now.
											</Text>
											<Divider />
											<Text fontSize={"sm"}>Deleting can only happen after a message is sent.</Text>
											<Text fontSize={"sm"}>
												For example, if you schedule a message 1 hour from now that is set to be deleted in 1 hour, It
												will be deleted 2 hours from now.
											</Text>
											<Divider />
										</VStack>
									</PopoverBody>
								</PopoverContent>
							</Popover>
						</HStack>
					</ModalHeader>
					<ModalCloseButton />
					<ModalBody>
						<VStack align="right">
							<Popover isLazy placement="auto">
								<PopoverTrigger>
									<Button>View all scheduled messages</Button>
								</PopoverTrigger>
								<PopoverContent>
									<PopoverBody>
										<ScheduledMessages dm_id={dm_id} />
									</PopoverBody>
								</PopoverContent>
							</Popover>
							{TimePicker()}
						</VStack>
					</ModalBody>
					<ModalFooter>
						<Button onClick={handleSpecialSend}>Send</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>
		</>
	);
};
