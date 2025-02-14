import { Center, Grid, Spinner, Text, VStack } from "@chakra-ui/react";
import { useEffect, useRef } from "react";
import { useCall } from "../../hooks/useCall";
import { useDMs } from "../../hooks/useDMs";

const VideoOnly = ({ stream }: { stream: MediaStream }) => {
	const ref = useRef<HTMLVideoElement | null>(null);

	useEffect(() => {
		if (ref.current) ref.current.srcObject = stream;
	}, [stream]);

	return <video playsInline autoPlay muted ref={ref} style={{ maxHeight: "10rem" }} />;
};

export const AudioOnly = ({ stream }: { stream: MediaStream }) => {
	const ref = useRef<HTMLVideoElement | null>(null);

	useEffect(() => {
		if (ref.current) ref.current.srcObject = stream;
	}, [stream]);

	return <audio playsInline controls={false} autoPlay ref={ref} />;
};

export const CallView = () => {
	const callContext = useCall();
	const dmsQuery = useDMs();
	const dm = dmsQuery.data?.find((dm) => dm.id === callContext.call?.id);

	useEffect(() => {
		console.log("dm", dm);
		console.log("call", callContext.call);
	}, [callContext.call, dm]);

	if (!callContext.call || !dm || !callContext.call.open) {
		return (
			<Center p={6} bg="blackAlpha.200">
				<Spinner />
			</Center>
		);
	}

	const shownRemotes = callContext.call.remotes.filter((r) => dm.users_in_call[r.username] === r.call.peer);

	return (
		<Grid
			h="max-content"
			p={4}
			gap={4}
			templateColumns="auto auto auto"
			autoRows="1fr"
			bg="blackAlpha.200"
			placeContent="center"
		>
			{shownRemotes.length ? (
				shownRemotes.map(({ username, streams, call }) => (
					<VStack key={call.peer}>
						<VideoOnly stream={streams[0]} />
						<Text fontWeight="bold">{username}</Text>
					</VStack>
				))
			) : (
				<Text align="center" m={4}>
					No one else has joined the call!
				</Text>
			)}
		</Grid>
	);
};
