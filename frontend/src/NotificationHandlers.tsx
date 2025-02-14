import { InfiniteData, useQueryClient } from "@tanstack/react-query";
import { PropsWithChildren, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { getPublicKey, recvGroupDM } from "./crypto";
import { useSession } from "./hooks/useCurrentUser";
import { makeDMsQueryKey } from "./hooks/useDMs";
import { useKeyStorageContext } from "./hooks/useKeyStorage";
import { decryptMessageContent } from "./hooks/useMessageHistory";
import { useSocketContext } from "./hooks/useSocket";
import { DM, Message, User, X3DHNotification } from "./types";
import { getDMName, isIndividualDM, notify } from "./utils";

const replace = <T,>(array: T[], predicate: (e: T, i: number, a: T[]) => boolean, replacement: T) =>
	array.map((e, i, a) => (predicate(e, i, a) ? { ...replacement } : { ...e }));

export const NotificationHandlers = ({ children }: PropsWithChildren<{}>) => {
	const socketContext = useSocketContext();
	const { userRef } = useSession();
	const queryClient = useQueryClient();
	const { keyStorageRef, addSharedKeyRef } = useKeyStorageContext();
	const currentDMRef = useRef<string | null>(null);
	const [, dmParams] = useRoute("/chat/:dm_id");

	useEffect(() => {
		currentDMRef.current = dmParams?.dm_id ?? null;
	}, [dmParams]);

	useEffect(() => {
		if (socketContext) {
			const socket = socketContext.socket;

			const onProfileNotification = (user: User) => {
				queryClient.setQueryData<User>(["user", { username: user.username }], user);
			};

			const onDMNotification = async (dm: DM) => {
				const keyStorage = keyStorageRef.current;
				if (!keyStorage) throw new Error("Received DM notification before key storage was downloaded.");

				if (dm.latest_message) {
					const message = await decryptMessageContent(dm.latest_message, keyStorage.sharedKeys[dm.id]);
					dm.latest_message = message || null;
				}

				queryClient.setQueryData<DM[]>(makeDMsQueryKey(keyStorage), (dms) =>
					dms ? replace(dms, (d) => d.id === dm.id, dm) : undefined
				);

				queryClient.setQueryData<DM[]>(makeDMsQueryKey(keyStorage), (dms) =>
					dms ? replace(dms, (d) => d.id === dm.id, dm) : undefined
				);
			};

			const onMessageNotification = async (encryptedMessage: Message) => {
				console.log(`Received new message in DM ${encryptedMessage.dm_id}.`);
				if (!userRef.current) throw new Error("cannot receive a message without a user");

				const keyStorage = keyStorageRef.current;
				if (!keyStorage) throw new Error("Received message notification before key storage was downloaded.");

				const message = await decryptMessageContent(encryptedMessage, keyStorage.sharedKeys[encryptedMessage.dm_id]);
				if (message === false) {
					return;
				}

				queryClient.setQueryData<InfiniteData<Message[]>>(["messages", { id: message.dm_id }], (prev) => {
					if (prev) {
						const [firstPage, ...pages] = prev.pages;
						const [, ...pageParams] = prev.pageParams;
						return {
							pages: [[message, ...firstPage].sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1)), ...pages],
							pageParams: [new Date().toISOString(), ...pageParams],
						};
					} else {
						// If no message history for this DM (e.g. the DM hasn't been viewed), initialise the cache.
						return {
							pages: [[message]],
							pageParams: [new Date().toISOString()],
						};
					}
				});

				queryClient.setQueryData<DM[]>(makeDMsQueryKey(keyStorage), (prev) =>
					prev
						? prev.map((dm) =>
								dm.id === message.dm_id
									? {
											...dm,
											latest_message: dm.latest_message
												? dm.latest_message.timestamp < message.timestamp
													? message
													: dm.latest_message
												: message,
									  }
									: dm
						  )
						: undefined
				);

				const user = await queryClient.fetchQuery<User>(["user", { username: userRef.current?.username }]);
				if (
					user.status !== "dnd" &&
					localStorage.getItem(message.dm_id.toString()) !== "muted" &&
					currentDMRef.current !== message.dm_id.toString()
				) {
					const dm = (await queryClient.fetchQuery<DM[]>(makeDMsQueryKey(keyStorage))).find(
						(dm) => dm.id === message.dm_id
					);
					if (dm) {
						await notify({
							title: `New Message ${isIndividualDM(dm) ? "from" : "in"} ${getDMName(dm, user.username)}`,
							body: message.message,
						});
					}
				}
			};

			const onMessageChangeNotification = async (encryptedMessage: Message) => {
				console.log(`Received message change in DM ${encryptedMessage.dm_id}.`);
				if (!userRef.current) throw new Error("cannot receive a message change without a user");

				const keyStorage = keyStorageRef.current;
				if (!keyStorage) throw new Error("Received message change notification before key storage was downloaded.");

				const message = await decryptMessageContent(encryptedMessage, keyStorage.sharedKeys[encryptedMessage.dm_id]);
				if (message === false) {
					return;
				}

				queryClient.setQueryData<InfiniteData<Message[]>>(["messages", { id: message.dm_id }], (prev) =>
					prev
						? {
								pages: prev.pages.map((page) => replace(page, (m) => m.id === message.id, message)),
								pageParams: prev.pageParams,
						  }
						: undefined
				);

				if (message.pinned) {
					queryClient.setQueryData<Message[]>(["pinnedMessages", { id: message.dm_id }], (prev) =>
						prev
							? prev.find((m) => m.id === message.id)
								? replace(prev, (m) => m.id === message.id, message)
								: [...prev, message]
							: undefined
					);
				} else {
					queryClient.setQueryData<Message[]>(["pinnedMessages", { id: message.dm_id }], (prev) =>
						prev ? prev.filter((m) => m.id !== message.id) : undefined
					);
				}
			};

			const onX3DHNotification = async ({ id, ik, ek, spk, position, key_tree }: X3DHNotification) => {
				console.log(`Received X3DH notification for DM ${id}.`);
				if (!userRef.current) throw new Error("cannot receive group DM without a user");

				const keyStorage = keyStorageRef.current;
				const addSharedKey = addSharedKeyRef.current;
				if (!keyStorage || !addSharedKey)
					throw new Error("Received X3DH notification before key storage was downloaded.");

				const privSPK: string = keyStorage.privSPK;
				const pubSPK = getPublicKey(privSPK);
				if (pubSPK !== spk) {
					throw new Error("public SPK does not match stored SPK.");
				}

				const sharedKey = recvGroupDM(userRef.current.privateKey, ik, privSPK, ek, key_tree, position);
				await addSharedKey(id, sharedKey);

				queryClient.invalidateQueries({ queryKey: ["dmsList"] });
			};

			const onFriendRequestNotification = async ({ username }: { username: string }) => {
				queryClient.setQueryData<string[]>(["friendRequests"], (prev) => [username, ...(prev ?? [])]);

				const user = await queryClient.fetchQuery<User>(["user", { username: userRef.current?.username }]);
				if (user.status !== "dnd") {
					await notify({
						title: username,
						body: "New friend request!",
					});
				}
			};

			const onFriendRequestAcceptNotification = async ({ username, accept }: { username: string; accept: boolean }) => {
				queryClient.setQueryData<string[]>(["friendRequests"], (prev) => prev?.filter((u) => u !== username));
				queryClient.setQueryData<string[]>(["outgoingFriendRequests"], (prev) => prev?.filter((u) => u !== username));
				if (accept) {
					queryClient.setQueryData<string[]>(["friendsList"], (prev) => [username, ...(prev ?? [])]);
				}

				const user = await queryClient.fetchQuery<User>(["user", { username: userRef.current?.username }]);
				if (user.status !== "dnd") {
					await notify({
						title: username,
						body: `Friend request ${accept ? "accepted" : "declined"}!`,
					});
				}
			};

			const onMessageDeleteNotification = () => {
				queryClient.invalidateQueries({
					queryKey: ["messages"],
				});
				queryClient.invalidateQueries({
					queryKey: ["pinnedMessages"],
				});

				const keyStorage = keyStorageRef.current;
				if (!keyStorage) throw new Error("Received message delete notification before key storage was downloaded.");
				queryClient.invalidateQueries({
					queryKey: makeDMsQueryKey(keyStorage),
				});
			};

			const onScheduledSoonNotification = async ({ dm_id }: { dm_id: number }) => {
				const user = await queryClient.fetchQuery<User>(["user", { username: userRef.current?.username }]);
				if (user.status !== "dnd") {
					const keyStorage = keyStorageRef.current;
					if (!keyStorage) throw new Error("Received sched soon notification before key storage was downloaded.");

					const dm = (await queryClient.fetchQuery<DM[]>(makeDMsQueryKey(keyStorage))).find((dm) => dm.id === dm_id);
					if (dm) {
						await notify({
							title: "Scheduled message will be sent soon!",
							body: getDMName(dm, user.username),
						});
					}
				}
			};

			socket.on("message_delete_notification", onMessageDeleteNotification);
			socket.on("profile_notification", onProfileNotification);
			socket.on("dm_notification", onDMNotification);
			socket.on("message_notification", onMessageNotification);
			socket.on("message_change_notification", onMessageChangeNotification);
			socket.on("x3dh_notification", onX3DHNotification);
			socket.on("friend_request_notification", onFriendRequestNotification);
			socket.on("friend_request_accept_notification", onFriendRequestAcceptNotification);
			socket.on("scheduled_soon_notification", onScheduledSoonNotification);

			return () => {
				socket.off("message_delete_notification", onMessageDeleteNotification);
				socket.off("profile_notification", onProfileNotification);
				socket.off("dm_notification", onDMNotification);
				socket.off("message_notification", onMessageNotification);
				socket.off("message_change_notification", onMessageChangeNotification);
				socket.off("x3dh_notification", onX3DHNotification);
				socket.off("friend_request_notification", onFriendRequestNotification);
				socket.off("friend_request_accept_notification", onFriendRequestAcceptNotification);
				socket.off("scheduled_soon_notification", onScheduledSoonNotification);
			};
		}
	}, [socketContext]);

	return <>{children}</>;
};
