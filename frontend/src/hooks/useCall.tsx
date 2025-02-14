import Peer, { LogLevel, MediaConnection } from "peerjs";
import {
	PropsWithChildren,
	RefObject,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { unwrapServerResult } from "../utils";
import { useCurrentUser } from "./useCurrentUser";
import { useSocket } from "./useSocket";

type Remote = { username: string; call: MediaConnection; streams: MediaStream[] };
type Call = { id: number; open: boolean; localStream: MediaStream | null; peer: Peer; remotes: Remote[] };

const PEERJS_DEBUG_LEVEL: LogLevel = 2; // Warnings
// const PEERJS_DEBUG_LEVEL: LogLevel = 3; // All

const CallContext = createContext<
	| ({ callRef: RefObject<Call> } & (
			| { call: null; joinCall: (id: number) => Promise<void> }
			| { call: Call; leaveCall: () => Promise<void> }
	  ))
	| null
>(null);

export const useCall = () => {
	const context = useContext(CallContext);
	if (context === null) {
		throw new Error("`useCall` called outside of a `CallProvider` component.");
	}
	return context;
};

export const CallProvider = ({ children, peerjsServer }: PropsWithChildren<{ peerjsServer: string }>) => {
	const socket = useSocket();
	const user = useCurrentUser();

	const [call, setCall] = useState<Call | null>(null);
	const callRef = useRef(call);

	useEffect(() => {
		console.log("Updated call context:", call);
		callRef.current = call;
	}, [call]);

	const getStream = useCallback(() => navigator.mediaDevices.getUserMedia({ audio: true, video: true }), []);

	const setupCall = useCallback((self: string, username: string, call: MediaConnection) => {
		// Setup event handler for incoming streams.
		call.on("stream", (stream: MediaStream) => {
			console.log("Received stream from remote:", call.peer);
			setCall((prev) => {
				// Check that we are adding this stream to the correct call.
				if (!prev || prev.peer.id !== self) return prev;

				return {
					...prev,
					remotes: prev.remotes.map((r) =>
						r.call.peer === call.peer ? { ...r, streams: [...r.streams, stream] } : { ...r }
					),
				};
			});
		});

		// Event handler for when a call is closed (either on our side or on the remote).
		call.on("close", () => {
			console.log("Remote closed:", call.peer);
			setCall((prev) => {
				// Check that we are removing this remote from the correct call.
				if (!prev || prev.peer.id !== self) return prev;

				return {
					...prev,
					remotes: prev.remotes.filter((r) => r.call.peer !== call.peer),
				};
			});
		});

		// Add remote to call state.
		setCall((prev) => {
			// Check that we are adding this remote to the correct call.
			if (!prev || prev.peer.id !== self) return prev;

			return {
				...prev,
				remotes: [...prev.remotes, { username, call, streams: [] }],
			};
		});
	}, []);

	const joinCall = useCallback(
		async (id: number) => {
			console.log(`Starting call in DM ${id}.`);

			const peer = new Peer({ debug: PEERJS_DEBUG_LEVEL });
			setCall({ id, peer, open: false, localStream: null, remotes: [] });

			const localStreamPromise = getStream();

			peer.on("call", async (call) => {
				const localStream = await localStreamPromise;
				console.log("Received call from remote:", call.peer);
				// Reply with local stream.
				call.answer(localStream);
				setupCall(peer.id, call.metadata, call);
			});

			// Can only start a call in PeerJS once the connection to PeerServer has opened.
			peer.on("open", async (uuid) => {
				const localStream = await localStreamPromise;

				console.log("Peer JS connection opened, with ID:", uuid);
				setCall((prev) => (prev && prev.peer.id === uuid ? { ...prev, open: true, localStream } : prev));

				const usersInCall = await unwrapServerResult(socket.emitWithAck("join_call", { id, uuid }));

				console.log(
					"Initiating calls with the following users:",
					Object.keys(usersInCall).filter((username) => username !== user.username)
				);

				Object.entries(usersInCall)
					.filter(([username]) => username !== user.username)
					.forEach(([remoteUsername, id]) => {
						console.log("Starting call with remote:", id, localStream);
						// Send call (with local stream).
						const call = peer.call(id, localStream, { metadata: user.username });
						setupCall(peer.id, remoteUsername, call);
					});

				console.log("Finished setup of call with peer ID:", peer.id);
			});
		},
		[socket]
	);

	const leaveCall = useCallback(async () => {
		if (!callRef.current) throw new Error("Cannot leave a call while no call is active.");

		const call = callRef.current;
		setCall(null);

		await unwrapServerResult(socket.emitWithAck("leave_call", { id: call.id }));
		call.localStream?.getTracks().forEach((t) => {
			call.localStream?.removeTrack(t);
			t.stop();
		});
		call.remotes.forEach((r) => {
			r.call.close();
		});
		call.peer.destroy();
	}, [socket]);

	// In the event this is unmounted, leave the current call nicely.
	useEffect(() => {
		return () => {
			if (callRef.current) leaveCall();
		};
	}, []);

	return (
		<CallContext.Provider value={call ? { call, leaveCall, callRef } : { call, joinCall, callRef }}>
			{children}
		</CallContext.Provider>
	);
};
